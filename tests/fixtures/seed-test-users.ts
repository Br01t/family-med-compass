import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { TEST_CONFIG } from "./test-constants";

export interface TestUserSession {
  userId: string;
  email: string;
  role: "paziente" | "caregiver";
  client: SupabaseClient;
  jwt: string;
}

export interface TestEnvironment {
  adminClient: SupabaseClient;
  patientUser: TestUserSession;
  primaryCaregiverUser: TestUserSession;
  secondaryCaregiverUser: TestUserSession;
  strangerUser: TestUserSession;
  patientId: string;
  strangerPatientId: string;
}

export function getAdminClient(): SupabaseClient {
  return createClient(TEST_CONFIG.supabaseUrl, TEST_CONFIG.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function createAndAuthenticateUser(
  email: string,
  password = "Password123!",
  role: "paziente" | "caregiver" = "caregiver",
  name = "Test User",
): Promise<TestUserSession> {
  const admin = getAdminClient();

  // 1. Pulizia eventuale utente precedente con stessa email
  const { data: list } = await admin.auth.admin.listUsers();
  const existing = list?.users?.find((u) => u.email === email);
  if (existing) {
    await admin.auth.admin.deleteUser(existing.id);
  }

  // 2. Creazione utente con conferma email già attiva
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role },
  });

  if (createErr || !created.user) {
    throw new Error(`Impossibile creare utente di test ${email}: ${createErr?.message}`);
  }

  const userId = created.user.id;

  // 3. Inserimento profilo e ruolo nel DB
  await admin.from("profiles").upsert({
    id: userId,
    name,
    subscription_plan: "free",
    subscription_status: "active",
  });

  await admin.from("user_roles").upsert(
    { user_id: userId, role },
    { onConflict: "user_id,role" },
  );

  if (role === "caregiver") {
    await admin.from("caregivers").upsert({
      id: userId,
      name,
      relation: "Familiare",
      notify: { push: false, email: false, whatsapp: false },
    });
  }

  // 4. Client autenticato con JWT reale (soggetto alle RLS)
  const userClient = createClient(TEST_CONFIG.supabaseUrl, TEST_CONFIG.supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: authData, error: authErr } = await userClient.auth.signInWithPassword({
    email,
    password,
  });

  if (authErr || !authData.session) {
    throw new Error(`Impossibile autenticare utente ${email}: ${authErr?.message}`);
  }

  return {
    userId,
    email,
    role,
    client: userClient,
    jwt: authData.session.access_token,
  };
}

/**
 * Prepara uno scenario completo con:
 * - Famiglia A: Paziente A, Caregiver Primario A, Caregiver Secondario A
 * - Famiglia B: Estraneo B con proprio Paziente B
 */
export async function setupTestEnvironment(): Promise<TestEnvironment> {
  const adminClient = getAdminClient();

  // Creazione utenti isolati
  const patientUser = await createAndAuthenticateUser(
    `patient_${Date.now()}@test.local`,
    "Password123!",
    "paziente",
    "Mario Rossi (Paziente)",
  );

  const primaryCaregiverUser = await createAndAuthenticateUser(
    `primary_cg_${Date.now()}@test.local`,
    "Password123!",
    "caregiver",
    "Luigi Rossi (Caregiver Primario)",
  );

  const secondaryCaregiverUser = await createAndAuthenticateUser(
    `secondary_cg_${Date.now()}@test.local`,
    "Password123!",
    "caregiver",
    "Anna Rossi (Caregiver Secondario)",
  );

  const strangerUser = await createAndAuthenticateUser(
    `stranger_${Date.now()}@test.local`,
    "Password123!",
    "caregiver",
    "Carlo Bianchi (Estraneo Famiglia B)",
  );

  const patientId = `p_test_${Date.now()}`;
  const strangerPatientId = `p_stranger_${Date.now()}`;

  // Inserimento Paziente A (owner: primaryCaregiverUser, user_id: patientUser)
  await adminClient.from("patients").insert({
    id: patientId,
    name: "Mario Rossi",
    birth_year: 1950,
    user_id: patientUser.userId,
    owner_user_id: primaryCaregiverUser.userId,
    primary_caregiver_id: primaryCaregiverUser.userId,
  });

  // Collegamento Caregiver Secondario a Paziente A
  await adminClient.from("caregiver_patients").insert([
    {
      caregiver_id: primaryCaregiverUser.userId,
      patient_id: patientId,
      relationship: "Figlio",
    },
    {
      caregiver_id: secondaryCaregiverUser.userId,
      patient_id: patientId,
      relationship: "Nuora",
    },
  ]);

  // Inserimento Paziente B (Famiglia estranea)
  await adminClient.from("patients").insert({
    id: strangerPatientId,
    name: "Giuseppe Bianchi",
    birth_year: 1962,
    owner_user_id: strangerUser.userId,
    primary_caregiver_id: strangerUser.userId,
  });

  await adminClient.from("caregiver_patients").insert({
    caregiver_id: strangerUser.userId,
    patient_id: strangerPatientId,
    relationship: "Fratello",
  });

  return {
    adminClient,
    patientUser,
    primaryCaregiverUser,
    secondaryCaregiverUser,
    strangerUser,
    patientId,
    strangerPatientId,
  };
}

export async function teardownTestEnvironment(env: TestEnvironment): Promise<void> {
  const admin = env.adminClient;
  
  // Pulizia dati
  await admin.from("therapies").delete().in("patient_id", [env.patientId, env.strangerPatientId]);
  await admin.from("caregiver_patients").delete().in("patient_id", [env.patientId, env.strangerPatientId]);
  await admin.from("patients").delete().in("id", [env.patientId, env.strangerPatientId]);

  // Pulizia utenti auth
  const userIds = [
    env.patientUser.userId,
    env.primaryCaregiverUser.userId,
    env.secondaryCaregiverUser.userId,
    env.strangerUser.userId,
  ];

  for (const uid of userIds) {
    await admin.auth.admin.deleteUser(uid);
  }
}
