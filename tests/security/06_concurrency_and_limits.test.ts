import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTestEnvironment, teardownTestEnvironment, TestEnvironment } from "../fixtures/seed-test-users";

describe("Concorrenza, Idempotenza & Enforcement Limiti di Piano a livello DB", () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    env = await setupTestEnvironment();
  });

  afterAll(async () => {
    await teardownTestEnvironment(env);
  });

  it("Limite di Piano DB: trigger check_patient_limit() blocca il 2° paziente su piano Free", async () => {
    // Il trigger check_patient_limit() controlla `patients.user_id` (il paziente stesso),
    // non `owner_user_id`. Il patientUser ha già 1 paziente con user_id = patientUser.userId.
    // Tentiamo di inserire un secondo paziente con lo stesso user_id via admin-bypass dell'UI.
    const { error } = await env.adminClient.from("patients").insert({
      id: `p_second_${Date.now()}`,
      name: "Secondo Paziente Vietato",
      user_id: env.patientUser.userId,
      owner_user_id: env.primaryCaregiverUser.userId,
      primary_caregiver_id: env.primaryCaregiverUser.userId,
    });

    // Il trigger RAISE EXCEPTION deve bloccare l'insert
    expect(error).toBeDefined();
    expect(error?.message).toMatch(/Limite pazienti raggiunto|free/i);
  });

  it("Limite di Piano DB: trigger check_therapy_limit() blocca la 4ª terapia su piano Free", async () => {
    // Il piano free consente fino a 3 terapie attive.
    // Inseriamo 3 terapie lecite
    const createdIds: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const id = `t_limit_${i}_${Date.now()}`;
      const { error } = await env.primaryCaregiverUser.client.from("therapies").insert({
        id,
        patient_id: env.patientId,
        name: `Terapia Lecita ${i}`,
        times: ["08:00"],
        recurrence: { type: "daily" },
      });
      expect(error).toBeNull();
      createdIds.push(id);
    }

    // Tentativo di inserire la 4ª terapia
    const { error: fourthErr } = await env.primaryCaregiverUser.client.from("therapies").insert({
      id: `t_limit_4_${Date.now()}`,
      patient_id: env.patientId,
      name: "Quarta Terapia Vietata",
      times: ["08:00"],
      recurrence: { type: "daily" },
    });

    expect(fourthErr).toBeDefined();
    expect(fourthErr?.message).toMatch(/Limite terapie raggiunto|free/i);

    // Cleanup
    await env.adminClient.from("therapies").delete().in("id", createdIds);
  });

  it("Concorrenza & Clic Ripetuti: conferma simultanea della dose gestita in modo idempotente", async () => {
    // Crea una terapia e il suo evento di dose pianificato via admin (bypass RLS)
    const therapyId = `t_race_${Date.now()}`;
    const eventId = `ev_race_${Date.now()}`;
    const scheduledAt = new Date().toISOString();

    await env.adminClient.from("therapies").insert({
      id: therapyId,
      patient_id: env.patientId,
      name: "Antidolorifico Race Test",
      times: ["12:00"],
      recurrence: { type: "daily" },
    });

    // Inserisce un evento "pending" che i due caregiver tenteranno di confermare
    await env.adminClient.from("events").insert({
      id: eventId,
      therapy_id: therapyId,
      patient_id: env.patientId,
      status: "pending",
      scheduled_at: scheduledAt,
    });

    // Due caregiver tentano di confermare lo STESSO evento allo stesso istante
    // (simula doppio clic o due device che aprono l'app contemporaneamente)
    const confirm1 = env.primaryCaregiverUser.client
      .from("events")
      .update({ status: "taken", confirmed_by: env.primaryCaregiverUser.userId, confirmed_at: new Date().toISOString() })
      .eq("id", eventId);

    const confirm2 = env.secondaryCaregiverUser.client
      .from("events")
      .update({ status: "taken", confirmed_by: env.secondaryCaregiverUser.userId, confirmed_at: new Date().toISOString() })
      .eq("id", eventId);

    const [res1, res2] = await Promise.all([confirm1, confirm2]);

    // Almeno una delle conferme deve andare a buon fine senza crash del DB
    expect(res1.error === null || res2.error === null).toBe(true);

    // L'evento finale deve avere status "taken" (non corrotto da race condition)
    const { data: finalEvent } = await env.adminClient
      .from("events")
      .select("status")
      .eq("id", eventId)
      .single();
    expect(finalEvent?.status).toBe("taken");

    // Cleanup
    await env.adminClient.from("events").delete().eq("id", eventId);
    await env.adminClient.from("therapies").delete().eq("id", therapyId);
  });
});
