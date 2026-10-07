import { describe, it, expect, afterAll } from "vitest";
import { createAndAuthenticateUser, getAdminClient, TestUserSession } from "../fixtures/seed-test-users";

/**
 * Ciclo di vita dei codici invito famiglia (create_family_invite / redeem_family_invite):
 * monouso, scadenza, multi-uso con tetto, ruoli, e impossibilità di manomettere la
 * tabella dal client. (Il blocco dei tentativi sbagliati è già in 04_*.)
 */
const stamp = Date.now();
const admin = getAdminClient();
const users: string[] = [];
const patients: string[] = [];

async function newUser(label: string, role: "caregiver" | "paziente" = "caregiver"): Promise<TestUserSession> {
  const u = await createAndAuthenticateUser(`inv_${label}_${stamp}@test.local`, "Password123!", role, `Inv ${label}`);
  users.push(u.userId);
  return u;
}

/** Proprietario su piano Pro (fino a 5 caregiver) con un paziente. */
async function ownerWithPatient(label: string) {
  const owner = await newUser(`own_${label}`);
  await admin.from("profiles").update({ subscription_plan_own: "pro" }).eq("id", owner.userId);
  const pid = `p_inv_${label}_${stamp}`;
  patients.push(pid);
  const { error } = await admin.from("patients").insert({
    id: pid, name: `Paziente ${label}`, birth_year: 1950,
    owner_user_id: owner.userId, primary_caregiver_id: owner.userId,
  });
  if (error) throw new Error(`seed paziente: ${error.message}`);
  return { owner, pid };
}

async function createInvite(owner: TestUserSession, pid: string, maxUses = 1): Promise<string> {
  const { data, error } = await owner.client.rpc("create_family_invite", { _patient_id: pid, _ttl_minutes: 60, _max_uses: maxUses });
  expect(error).toBeNull();
  return (data as any).code as string;
}

async function isLinked(userId: string, pid: string) {
  const { data } = await admin.from("caregiver_patients").select("caregiver_id").eq("caregiver_id", userId).eq("patient_id", pid);
  return (data ?? []).length > 0;
}

afterAll(async () => {
  if (patients.length) {
    await admin.from("family_invites").delete().in("patient_id", patients);
    await admin.from("caregiver_patients").delete().in("patient_id", patients);
    await admin.from("patients").delete().in("id", patients);
  }
  for (const id of users) await admin.auth.admin.deleteUser(id);
});

describe("Inviti famiglia — uso, scadenza, tetto usi", () => {
  it("Un codice valido collega il caregiver e restituisce il paziente", async () => {
    const { owner, pid } = await ownerWithPatient("ok");
    const guest = await newUser("ok_guest");
    const code = await createInvite(owner, pid);

    const { data, error } = await guest.client.rpc("redeem_family_invite", { _code: code });
    expect(error).toBeNull();
    expect(data).toBe(pid);
    expect(await isLinked(guest.userId, pid)).toBe(true);

    const { data: seen } = await guest.client.from("patients").select("id").eq("id", pid);
    expect(seen).toHaveLength(1); // ora può leggere il paziente
  });

  it("MONOUSO: dopo il primo utilizzo il codice non funziona più per un altro utente", async () => {
    const { owner, pid } = await ownerWithPatient("once");
    const first = await newUser("once_a");
    const second = await newUser("once_b");
    const code = await createInvite(owner, pid);

    expect((await first.client.rpc("redeem_family_invite", { _code: code })).error).toBeNull();
    const { error } = await second.client.rpc("redeem_family_invite", { _code: code });
    expect(error?.message).toMatch(/già utilizzato/i);
    expect(await isLinked(second.userId, pid)).toBe(false);
  });

  it("SCADENZA: un codice scaduto viene rifiutato", async () => {
    const { owner, pid } = await ownerWithPatient("exp");
    const guest = await newUser("exp_guest");
    const code = await createInvite(owner, pid);
    await admin.from("family_invites").update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("code", code);

    const { error } = await guest.client.rpc("redeem_family_invite", { _code: code });
    expect(error?.message).toMatch(/scaduto/i);
    expect(await isLinked(guest.userId, pid)).toBe(false);
  });

  it("Codice con max_uses = 2: due utenti entrano, il terzo no", async () => {
    const { owner, pid } = await ownerWithPatient("multi");
    const [a, b, c] = [await newUser("multi_a"), await newUser("multi_b"), await newUser("multi_c")];
    const code = await createInvite(owner, pid, 2);

    expect((await a.client.rpc("redeem_family_invite", { _code: code })).error).toBeNull();
    expect((await b.client.rpc("redeem_family_invite", { _code: code })).error).toBeNull();
    const { error } = await c.client.rpc("redeem_family_invite", { _code: code });
    expect(error?.message).toMatch(/già utilizzato/i);
    expect(await isLinked(c.userId, pid)).toBe(false);
  });

  it("Il codice è accettato senza distinguere maiuscole/minuscole e spazi", async () => {
    const { owner, pid } = await ownerWithPatient("case");
    const guest = await newUser("case_guest");
    const code = await createInvite(owner, pid);
    const { error } = await guest.client.rpc("redeem_family_invite", { _code: `  ${code.toLowerCase()} ` });
    expect(error).toBeNull();
  });

  it("Un utente con ruolo 'paziente' NON può usare un codice invito", async () => {
    const { owner, pid } = await ownerWithPatient("role");
    const patientRole = await newUser("role_pz", "paziente");
    const code = await createInvite(owner, pid);
    const { error } = await patientRole.client.rpc("redeem_family_invite", { _code: code });
    expect(error?.message).toMatch(/Solo un caregiver/i);
    expect(await isLinked(patientRole.userId, pid)).toBe(false);
  });
});

describe("Inviti famiglia — chi può crearli, leggerli, manomettere la tabella", () => {
  it("Un estraneo NON può creare inviti per il paziente di un'altra famiglia", async () => {
    const { pid } = await ownerWithPatient("perm");
    const stranger = await newUser("perm_stranger");
    const { error } = await stranger.client.rpc("create_family_invite", { _patient_id: pid, _ttl_minutes: 60, _max_uses: 1 });
    expect(error?.message).toMatch(/Non autorizzato/i);
  });

  it("Un caregiver collegato (non proprietario) NON può invitare altre persone", async () => {
    const { owner, pid } = await ownerWithPatient("linked");
    const guest = await newUser("linked_guest");
    const code = await createInvite(owner, pid);
    expect((await guest.client.rpc("redeem_family_invite", { _code: code })).error).toBeNull();

    const { error } = await guest.client.rpc("create_family_invite", { _patient_id: pid, _ttl_minutes: 60, _max_uses: 1 });
    expect(error?.message).toMatch(/Non autorizzato/i);
  });

  it("Estraneo e caregiver collegato NON leggono i codici invito; il proprietario sì", async () => {
    const { owner, pid } = await ownerWithPatient("read");
    const guest = await newUser("read_guest");
    const stranger = await newUser("read_stranger");
    const code = await createInvite(owner, pid, 2);
    expect((await guest.client.rpc("redeem_family_invite", { _code: code })).error).toBeNull();

    const own = await owner.client.from("family_invites").select("code").eq("patient_id", pid);
    expect((own.data ?? []).length).toBeGreaterThan(0);
    expect((await stranger.client.from("family_invites").select("code").eq("patient_id", pid)).data ?? []).toHaveLength(0);
    expect((await guest.client.from("family_invites").select("code").eq("patient_id", pid)).data ?? []).toHaveLength(0);
  });

  it("MANOMISSIONE: nessuno può 'resettare' un invito già usato modificando la tabella", async () => {
    const { owner, pid } = await ownerWithPatient("tamper");
    const first = await newUser("tamper_a");
    const late = await newUser("tamper_b");
    const code = await createInvite(owner, pid);
    expect((await first.client.rpc("redeem_family_invite", { _code: code })).error).toBeNull();

    // Il proprietario stesso prova a riportare uses a 0 e ad allungare la scadenza
    await owner.client.from("family_invites")
      .update({ uses: 0, max_uses: 99, expires_at: new Date(Date.now() + 86_400_000 * 30).toISOString() })
      .eq("code", code);

    const { data: row } = await admin.from("family_invites").select("uses, max_uses").eq("code", code).single();
    expect(row?.uses).toBe(1);
    expect(row?.max_uses).toBe(1);

    const { error } = await late.client.rpc("redeem_family_invite", { _code: code });
    expect(error?.message).toMatch(/già utilizzato/i);
  });

  it("Un estraneo NON può inserire direttamente un invito per il paziente di un'altra famiglia", async () => {
    const { pid } = await ownerWithPatient("forge");
    const stranger = await newUser("forge_stranger");
    const forged = `FORGE${String(stamp).slice(-3)}`;
    const { error } = await stranger.client.from("family_invites").insert({ code: forged, patient_id: pid, created_by: stranger.userId });
    expect(error).not.toBeNull();
    const { data } = await admin.from("family_invites").select("code").eq("code", forged);
    expect(data ?? []).toHaveLength(0);
  });
});
