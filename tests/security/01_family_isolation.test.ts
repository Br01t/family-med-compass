import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTestEnvironment, teardownTestEnvironment, TestEnvironment } from "../fixtures/seed-test-users";

describe("Sicurezza & RLS — Isolamento tra Famiglie (Anti-IDOR)", () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    env = await setupTestEnvironment();
  });

  afterAll(async () => {
    await teardownTestEnvironment(env);
  });

  it("Estraneo B NON può leggere i dati del Paziente A (SELECT)", async () => {
    // Stranger B interroga la tabella patients
    const { data, error } = await env.strangerUser.client
      .from("patients")
      .select("id, name")
      .eq("id", env.patientId);

    expect(error).toBeNull();
    // La RLS deve silenziare la riga: zero righe restituite
    expect(data).toHaveLength(0);
  });

  it("Estraneo B NON può modificare il Paziente A (UPDATE)", async () => {
    const { data, error } = await env.strangerUser.client
      .from("patients")
      .update({ name: "Hacked by Stranger" })
      .eq("id", env.patientId)
      .select();

    expect(data).toHaveLength(0);

    // Verifica che il nome non sia cambiato
    const { data: check } = await env.adminClient
      .from("patients")
      .select("name")
      .eq("id", env.patientId)
      .single();

    expect(check?.name).toBe("Mario Rossi");
  });

  it("Estraneo B NON può leggere né manipolare le terapie del Paziente A", async () => {
    // 1. Il primario inserisce una terapia per Paziente A
    const therapyId = `t_iso_${Date.now()}`;
    await env.adminClient.from("therapies").insert({
      id: therapyId,
      patient_id: env.patientId,
      name: "Cardioaspirina",
      dosage: "100mg",
      times: ["08:00"],
      recurrence: { type: "daily" },
    });

    // 2. Estraneo B tenta di fare SELECT
    const { data: readData } = await env.strangerUser.client
      .from("therapies")
      .select("*")
      .eq("id", therapyId);

    expect(readData).toHaveLength(0);

    // 3. Estraneo B tenta di eliminare la terapia (DELETE)
    const { error: deleteErr } = await env.strangerUser.client
      .from("therapies")
      .delete()
      .eq("id", therapyId);

    // RLS blocca o non elimina nulla
    const { data: verifyStillExists } = await env.adminClient
      .from("therapies")
      .select("id")
      .eq("id", therapyId);

    expect(verifyStillExists).toHaveLength(1);

    // Cleanup
    await env.adminClient.from("therapies").delete().eq("id", therapyId);
  });

  it("Estraneo B NON può leggere le note cliniche (wellness_notes) del Paziente A", async () => {
    // Inserisce la nota con id generato dal DB (UUID)
    const { data: insertedNote } = await env.adminClient
      .from("wellness_notes")
      .insert({
        patient_id: env.patientId,
        created_by: env.primaryCaregiverUser.userId,
        note: "Pressione leggermente alta dopo pranzo",
      })
      .select("id")
      .single();

    const noteId = insertedNote?.id;

    const { data } = await env.strangerUser.client
      .from("wellness_notes")
      .select("*")
      .eq("id", noteId);

    expect(data).toHaveLength(0);

    await env.adminClient.from("wellness_notes").delete().eq("id", noteId);
  });

  it("Estraneo B NON può leggere i parametri vitali (vital_signs) del Paziente A", async () => {
    const { data } = await env.strangerUser.client
      .from("vital_signs")
      .select("*")
      .eq("patient_id", env.patientId);

    expect(data).toHaveLength(0);
  });
});
