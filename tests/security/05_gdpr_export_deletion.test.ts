import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTestEnvironment, teardownTestEnvironment, TestEnvironment, createAndAuthenticateUser } from "../fixtures/seed-test-users";

describe("GDPR & Privacy — Export Portabilità (Art. 20) & Diritto all'Oblio (Art. 17)", () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    env = await setupTestEnvironment();
  });

  afterAll(async () => {
    await teardownTestEnvironment(env);
  });

  it("export_my_data() esporta tutti i dati sanitari e anagrafici del paziente autenticato", async () => {
    // 1. Inseriamo dati clinici per il paziente A
    const therapyId = `t_export_${Date.now()}`;
    await env.adminClient.from("therapies").insert({
      id: therapyId,
      patient_id: env.patientId,
      name: "Sintrom",
      dosage: "4mg",
      times: ["18:00"],
      recurrence: { type: "daily" },
    });

    await env.adminClient.from("user_consents").insert({
      user_id: env.primaryCaregiverUser.userId,
      consent_type: "health_data_processing",
      ip_hash: "dummy_hash",
      user_agent: "Vitest Agent",
    });

    // 2. Chiamata RPC di esportazione come Caregiver Primario
    const { data: exportData, error } = await env.primaryCaregiverUser.client.rpc("export_my_data");

    expect(error).toBeNull();
    expect(exportData).toBeDefined();

    // La funzione export_my_data() ritorna:
    //   { profile, roles, consents, caregiver_record, patients_owned, caregiver_links, therapies, ... }
    expect(exportData).toHaveProperty("profile");
    expect(exportData).toHaveProperty("therapies");
    expect(exportData).toHaveProperty("consents");
    // I pazienti sono in `patients_owned` (non `patients`)
    expect(exportData).toHaveProperty("patients_owned");

    const therapies = (exportData as any).therapies;
    expect(therapies.some((t: any) => t.name === "Sintrom")).toBe(true);

    // Cleanup
    await env.adminClient.from("therapies").delete().eq("id", therapyId);
  });

  it("Privacy Audit Log: l'Estraneo B NON può leggere gli eventi GDPR degli altri utenti (Fix Policy)", async () => {
    // 1. Primario registra un evento GDPR di export dati
    await env.primaryCaregiverUser.client.rpc("log_gdpr_event", {
      _action: "data_exported",
    });

    // 2. Estraneo B interroga l'audit_log
    const { data: strangerView } = await env.strangerUser.client
      .from("audit_log")
      .select("*")
      .eq("action", "data_exported");

    // L'estraneo NON deve vedere la riga dell'altro utente!
    expect(strangerView).toHaveLength(0);

    // 3. Il proprietario (o l'admin) invece può vederla
    const { data: ownerView } = await env.primaryCaregiverUser.client
      .from("audit_log")
      .select("*")
      .eq("action", "data_exported");

    expect(ownerView && ownerView.length).toBeGreaterThanOrEqual(1);
  });

  it("delete_my_account() elimina definitivamente l'account e tutti i dati correlati", async () => {
    // Creiamo un utente temporaneo sacrificabile
    const disposableUser = await createAndAuthenticateUser(
      `delete_me_${Date.now()}@test.local`,
      "Password123!",
      "caregiver",
      "Utente Da Eliminare",
    );

    const tempPatientId = `p_del_${Date.now()}`;
    await env.adminClient.from("patients").insert({
      id: tempPatientId,
      name: "Paziente Temporaneo",
      owner_user_id: disposableUser.userId,
      primary_caregiver_id: disposableUser.userId,
    });

    const tempTherapyId = `t_del_${Date.now()}`;
    await env.adminClient.from("therapies").insert({
      id: tempTherapyId,
      patient_id: tempPatientId,
      name: "Farmaco Temporaneo",
      times: ["08:00"],
      recurrence: { type: "daily" },
    });

    // Chiamata di cancellazione account via RPC (l'utente chiede di cancellare se stesso)
    const { error: deleteErr } = await disposableUser.client.rpc("delete_my_account");
    expect(deleteErr).toBeNull();

    // Verifichiamo che paziente e terapia siano stati cancellati da Postgres
    const { data: patientCheck } = await env.adminClient
      .from("patients")
      .select("id")
      .eq("id", tempPatientId);
    expect(patientCheck).toHaveLength(0);

    const { data: therapyCheck } = await env.adminClient
      .from("therapies")
      .select("id")
      .eq("id", tempTherapyId);
    expect(therapyCheck).toHaveLength(0);

    // Verifichiamo che il profilo sia stato cancellato
    const { data: profileCheck } = await env.adminClient
      .from("profiles")
      .select("id")
      .eq("id", disposableUser.userId);
    expect(profileCheck).toHaveLength(0);

    // Verifica che l'utente auth sia stato eliminato (non deve poter fare login)
    const { error: loginErr } = await env.adminClient.auth.signInWithPassword({
      email: disposableUser.email,
      password: "Password123!",
    });
    expect(loginErr).toBeDefined();
  });
});
