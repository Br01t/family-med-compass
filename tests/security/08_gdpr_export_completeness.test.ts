import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTestEnvironment, teardownTestEnvironment, TestEnvironment } from "../fixtures/seed-test-users";

/**
 * Export GDPR (art. 20) completo: ogni categoria di dato sanitario salvata nel DB
 * deve comparire nell'export dell'utente titolare, e NON in quello di un estraneo.
 */
describe("GDPR — completezza di export_my_data()", () => {
  let env: TestEnvironment;
  const tag = `exp_${Date.now()}`;

  beforeAll(async () => {
    env = await setupTestEnvironment();
    const a = env.adminClient;
    const pid = env.patientId;
    const must = (r: { error: any }, what: string) => {
      if (r.error) throw new Error(`seed ${what}: ${r.error.message}`);
    };
    must(await a.from("patient_medical_profiles").upsert({ patient_id: pid, blood_type: "A+", allergies: [`allergia_${tag}`], diagnoses: `diagnosi_${tag}`, notes: `nota_profilo_${tag}` }), "medical profile");
    must(await a.from("vital_signs").insert({ patient_id: pid, kind: "glycemia", value_primary: 111, unit: "mg/dL", notes: `vital_${tag}` }), "vital_signs");
    must(await a.from("wellness_notes").insert({ patient_id: pid, mood: 3, symptoms: ["nausea"], note: `benessere_${tag}` }), "wellness_notes");
    must(await a.from("adherence_monthly").upsert({ patient_id: pid, therapy_id: `t_${tag}`, therapy_name: `Terapia ${tag}`, year: 2026, month: 1, doses_scheduled: 10, doses_taken: 9, doses_missed: 1, doses_skipped: 0, adherence_pct: 90 }), "adherence_monthly");
  }, 60000);

  afterAll(async () => {
    const a = env.adminClient;
    await a.from("adherence_monthly").delete().eq("therapy_id", `t_${tag}`);
    await teardownTestEnvironment(env);
  });

  it("il titolare trova nell'export tutte le categorie di dati sanitari", async () => {
    const { data, error } = await env.primaryCaregiverUser.client.rpc("export_my_data");
    expect(error).toBeNull();
    const json = JSON.stringify(data);

    for (const key of ["patient_medical_profiles", "vital_signs", "wellness_notes", "adherence_monthly", "audit_log_own_actions"]) {
      expect(data, `manca la sezione ${key}`).toHaveProperty(key);
    }
    expect(json).toContain(`diagnosi_${tag}`);
    expect(json).toContain(`nota_profilo_${tag}`);
    expect(json).toContain(`vital_${tag}`);
    expect(json).toContain(`benessere_${tag}`);
    expect(json).toContain(`Terapia ${tag}`);
  });

  it("un estraneo NON trova questi dati nel proprio export", async () => {
    const { data, error } = await env.strangerUser.client.rpc("export_my_data");
    expect(error).toBeNull();
    const json = JSON.stringify(data);
    expect(json).not.toContain(tag);
  });

  it("anche il caregiver secondario collegato li riceve (stesso perimetro di terapie ed eventi)", async () => {
    const { data, error } = await env.secondaryCaregiverUser.client.rpc("export_my_data");
    expect(error).toBeNull();
    expect(JSON.stringify(data)).toContain(`benessere_${tag}`);
  });
});
