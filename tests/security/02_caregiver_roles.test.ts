import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTestEnvironment, teardownTestEnvironment, TestEnvironment } from "../fixtures/seed-test-users";

describe("Sicurezza & RLS — Separazione Ruoli (Caregiver Primario vs Secondario)", () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    env = await setupTestEnvironment();
  });

  afterAll(async () => {
    await teardownTestEnvironment(env);
  });

  it("Caregiver Secondario PUÒ leggere le terapie del paziente collegato", async () => {
    const therapyId = `t_role_${Date.now()}`;
    await env.adminClient.from("therapies").insert({
      id: therapyId,
      patient_id: env.patientId,
      name: "Metformina",
      dosage: "500mg",
      times: ["12:00"],
      recurrence: { type: "daily" },
    });

    const { data } = await env.secondaryCaregiverUser.client
      .from("therapies")
      .select("id, name, dosage")
      .eq("id", therapyId);

    expect(data).toHaveLength(1);
    expect(data?.[0].name).toBe("Metformina");

    await env.adminClient.from("therapies").delete().eq("id", therapyId);
  });

  it("Caregiver Secondario NON PUÒ creare una nuova terapia (INSERT bloccata)", async () => {
    const therapyId = `t_sec_insert_${Date.now()}`;

    const { error } = await env.secondaryCaregiverUser.client.from("therapies").insert({
      id: therapyId,
      patient_id: env.patientId,
      name: "Farmaco Non Autorizzato",
      dosage: "10mg",
      times: ["09:00"],
      recurrence: { type: "daily" },
    });

    // RLS deve bloccare l'insert (violazione policy o 0 righe inserite)
    expect(error).toBeDefined();

    const { data: check } = await env.adminClient
      .from("therapies")
      .select("id")
      .eq("id", therapyId);

    expect(check).toHaveLength(0);
  });

  it("Caregiver Secondario NON PUÒ modificare né cancellare una terapia esistente", async () => {
    const therapyId = `t_sec_update_${Date.now()}`;
    await env.adminClient.from("therapies").insert({
      id: therapyId,
      patient_id: env.patientId,
      name: "Amlodipina",
      dosage: "5mg",
      times: ["08:00"],
      recurrence: { type: "daily" },
    });

    // Tentativo UPDATE
    const { data: updated } = await env.secondaryCaregiverUser.client
      .from("therapies")
      .update({ dosage: "100mg" })
      .eq("id", therapyId)
      .select();

    expect(updated).toHaveLength(0);

    // Tentativo DELETE
    await env.secondaryCaregiverUser.client.from("therapies").delete().eq("id", therapyId);

    // Verifica che esista ancora con il dosaggio originale
    const { data: check } = await env.adminClient
      .from("therapies")
      .select("dosage")
      .eq("id", therapyId)
      .single();

    expect(check?.dosage).toBe("5mg");

    await env.adminClient.from("therapies").delete().eq("id", therapyId);
  });

  it("Caregiver Secondario PUÒ confermare una dose registrando l'evento in events", async () => {
    // Prima crea una terapia via admin
    const therapyId = `t_ev_sec_${Date.now()}`;
    await env.adminClient.from("therapies").insert({
      id: therapyId,
      patient_id: env.patientId,
      name: "Paracetamolo",
      times: ["12:00"],
      recurrence: { type: "daily" },
    });

    // Crea l'evento pending via admin
    const eventId = `ev_sec_${Date.now()}`;
    await env.adminClient.from("events").insert({
      id: eventId,
      therapy_id: therapyId,
      patient_id: env.patientId,
      status: "pending",
      scheduled_at: new Date().toISOString(),
    });

    // Il secondario aggiorna lo stato a "taken" (conferma dose)
    const { error } = await env.secondaryCaregiverUser.client
      .from("events")
      .update({
        status: "taken",
        confirmed_by: env.secondaryCaregiverUser.userId,
        confirmed_at: new Date().toISOString(),
        note: "Somministrata con un bicchiere d'acqua",
      })
      .eq("id", eventId);

    expect(error).toBeNull();

    // Pulizia
    await env.adminClient.from("events").delete().eq("id", eventId);
    await env.adminClient.from("therapies").delete().eq("id", therapyId);
  });
});
