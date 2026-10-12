import { describe, it, expect, afterAll } from "vitest";
import { Client } from "pg";
import { createAndAuthenticateUser, getAdminClient } from "../fixtures/seed-test-users";

/**
 * Impronta sul database (piano Free di Supabase, 500 MB):
 *  - il registro audit delle DOSI si scrive solo per i pazienti con piano Max (è una funzione Max);
 *  - le modifiche alle terapie restano registrate per tutti i piani;
 *  - le notifiche vengono eliminate dopo 14 giorni.
 */
const stamp = Date.now();
const admin = getAdminClient();
const DB_URL = process.env.TEST_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const users: string[] = [];
const patients: string[] = [];

async function scenario(plan: "free" | "max", label: string) {
  const owner = await createAndAuthenticateUser(`fp_${label}_${stamp}@test.local`, "Password123!", "caregiver", `FP ${label}`);
  users.push(owner.userId);
  if (plan !== "free") await admin.from("profiles").update({ subscription_plan_own: plan }).eq("id", owner.userId);

  const pid = `p_fp_${label}_${stamp}`;
  const tid = `t_fp_${label}_${stamp}`;
  const eid = `ev_fp_${label}_${stamp}`;
  patients.push(pid);
  expect((await admin.from("patients").insert({ id: pid, name: `FP ${label}`, birth_year: 1950, owner_user_id: owner.userId, primary_caregiver_id: owner.userId })).error).toBeNull();
  expect((await admin.from("therapies").insert({ id: tid, patient_id: pid, name: "Aspirina", times: ["08:00"], recurrence: { kind: "daily" } })).error).toBeNull();
  expect((await admin.from("events").insert({ id: eid, therapy_id: tid, patient_id: pid, scheduled_at: new Date(Date.now() - 3600_000).toISOString(), status: "scheduled" })).error).toBeNull();

  // cambio di stato della dose + modifica del nome della terapia
  expect((await admin.from("events").update({ status: "taken" }).eq("id", eid)).error).toBeNull();
  expect((await admin.from("therapies").update({ name: "Aspirina 100" }).eq("id", tid)).error).toBeNull();

  const { data } = await admin.from("audit_log").select("table_name, record_id").in("record_id", [eid, tid]);
  return {
    eventRows: (data ?? []).filter((r) => r.record_id === eid),
    therapyRows: (data ?? []).filter((r) => r.record_id === tid),
  };
}

afterAll(async () => {
  if (patients.length) {
    await admin.from("audit_log").delete().in("patient_id", patients);
    await admin.from("events").delete().in("patient_id", patients);
    await admin.from("therapies").delete().in("patient_id", patients);
    await admin.from("patients").delete().in("id", patients);
  }
  for (const id of users) await admin.auth.admin.deleteUser(id).catch(() => {});
});

describe("Registro audit e piani", () => {
  it("Free: il cambio di stato di una dose NON scrive audit, ma la modifica della terapia sì", async () => {
    const r = await scenario("free", "free");
    expect(r.eventRows).toHaveLength(0);
    expect(r.therapyRows.length).toBeGreaterThanOrEqual(1);
  });

  it("Max: il cambio di stato di una dose viene registrato (il registro attività è del piano Max)", async () => {
    const r = await scenario("max", "max");
    expect(r.eventRows.length).toBeGreaterThanOrEqual(1);
    expect(r.therapyRows.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Conservazione delle notifiche", () => {
  it("il job di pulizia elimina le notifiche dopo 14 giorni", async () => {
    const c = new Client({ connectionString: DB_URL });
    await c.connect();
    try {
      const r = await c.query("SELECT command FROM cron.job WHERE jobname = 'notifications-cleanup-daily'");
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0].command).toContain("14 days");
    } finally {
      await c.end();
    }
  });
});
