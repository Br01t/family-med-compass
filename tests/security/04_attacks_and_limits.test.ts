import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTestEnvironment, teardownTestEnvironment, TestEnvironment } from "../fixtures/seed-test-users";

describe("Sicurezza & Resilienza agli Attacchi — Brute-force, Input Limits & Injections", () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    env = await setupTestEnvironment();
  });

  afterAll(async () => {
    await teardownTestEnvironment(env);
  });

  it("Anti-Brute-Force: blocca tentativi ripetuti con codici invito errati dopo 8 tentativi", async () => {
    // Pulizia log residui per questo utente (da eventuali test precedenti)
    await env.adminClient
      .from("audit_log")
      .delete()
      .eq("actor_id", env.strangerUser.userId)
      .eq("action", "invite_redeem_failed");

    // Caregiver estraneo tenta di indovinare codici invito a raffica
    for (let i = 1; i <= 8; i++) {
      const { error } = await env.strangerUser.client.rpc("redeem_family_invite", {
        _code: `FAKE${i}XX`,
      });
      // Nei primi 8 fallimenti riceve errore "Codice non valido"
      expect(error).toBeDefined();
      expect(error?.message).toMatch(/Codice non valido|scaduto|non trovato/i);
    }

    // Al 9° tentativo, la funzione deve bloccare l'attacco
    const { error: blockedError } = await env.strangerUser.client.rpc("redeem_family_invite", {
      _code: "FAKENINE",
    });

    expect(blockedError).toBeDefined();
    expect(blockedError?.message).toMatch(/Troppi tentativi/i);

    // Verifica che l'evento di sicurezza sia stato tracciato nell'audit_log
    const { data: auditLogs } = await env.adminClient
      .from("audit_log")
      .select("action, summary")
      .eq("actor_id", env.strangerUser.userId)
      .eq("action", "invite_redeem_failed");

    expect(auditLogs && auditLogs.length).toBeGreaterThanOrEqual(8);
  });

  it("CHECK Constraints: respinge stringhe smisurate per impedire la saturazione del DB (500MB Free Tier)", async () => {
    // 1. Nome terapia > 120 caratteri
    const hugeTherapyName = "A".repeat(121);
    const { error: therapyErr } = await env.primaryCaregiverUser.client.from("therapies").insert({
      id: `t_huge_${Date.now()}`,
      patient_id: env.patientId,
      name: hugeTherapyName,
      times: ["08:00"],
      recurrence: { type: "daily" },
    });

    expect(therapyErr).toBeDefined();
    expect(therapyErr?.message).toMatch(/check constraint|therapies_name_len/i);

    // 2. Note cliniche (wellness_notes) > 2000 caratteri
    // Nota: wellness_notes usa `created_by` (non `author_id`), e `id` è UUID (generato dal DB)
    const hugeNote = "N".repeat(2001);
    const { error: noteErr } = await env.primaryCaregiverUser.client.from("wellness_notes").insert({
      patient_id: env.patientId,
      created_by: env.primaryCaregiverUser.userId,
      note: hugeNote,
    });

    expect(noteErr).toBeDefined();
    expect(noteErr?.message).toMatch(/check constraint|wn_note_len/i);

    // 3. Allergie > 50 elementi
    const tooManyAllergies = Array.from({ length: 51 }, (_, i) => `Allergene_${i}`);
    const { error: profileErr } = await env.primaryCaregiverUser.client
      .from("patient_medical_profiles")
      .insert({
        patient_id: env.patientId,
        allergies: tooManyAllergies,
      });

    expect(profileErr).toBeDefined();
    expect(profileErr?.message).toMatch(/check constraint|pmp_allergies_count/i);
  });

  it("Resistenza a SQL Injection: parametri e query rimangono protetti", async () => {
    const sqlInjectionPayload = "Cardio'; DROP TABLE therapies; --";
    const therapyId = `t_sqli_${Date.now()}`;

    // Tentativo di inserimento payload SQL
    const { error: insertErr } = await env.primaryCaregiverUser.client.from("therapies").insert({
      id: therapyId,
      patient_id: env.patientId,
      name: sqlInjectionPayload,
      times: ["10:00"],
      recurrence: { type: "daily" },
    });

    expect(insertErr).toBeNull();

    // Verifichiamo che la tabella esista ancora e il dato sia stato trattato come stringa pura
    const { data: check } = await env.primaryCaregiverUser.client
      .from("therapies")
      .select("name")
      .eq("id", therapyId)
      .single();

    expect(check?.name).toBe(sqlInjectionPayload);

    // Cleanup
    await env.primaryCaregiverUser.client.from("therapies").delete().eq("id", therapyId);
  });

  it("Resistenza a XSS Stored: payload HTML/JS memorizzato come testo puro", async () => {
    const xssPayload = "<script>alert('pwned')</script><img src=x onerror=alert(1)>";
    const therapyId = `t_xss_${Date.now()}`;

    const { error } = await env.primaryCaregiverUser.client.from("therapies").insert({
      id: therapyId,
      patient_id: env.patientId,
      name: "Tachipirina",
      notes: xssPayload,
      times: ["14:00"],
      recurrence: { type: "daily" },
    });

    expect(error).toBeNull();

    const { data } = await env.primaryCaregiverUser.client
      .from("therapies")
      .select("notes")
      .eq("id", therapyId)
      .single();

    expect(data?.notes).toBe(xssPayload);

    await env.primaryCaregiverUser.client.from("therapies").delete().eq("id", therapyId);
  });
});
