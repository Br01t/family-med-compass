import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTestEnvironment, teardownTestEnvironment, TestEnvironment } from "../fixtures/seed-test-users";

/**
 * Isolamento tra famiglie su notifiche e movimenti di scorta
 * (non coperti da 01_family_isolation).
 */
describe("Isolamento — notifications e stock_movements", () => {
  let env: TestEnvironment;
  const tag = `iso_${Date.now()}`;
  let notifA: string; // notifica per il caregiver primario, legata al paziente A
  let notifB: string; // notifica per l'estraneo, legata al paziente B
  const therapyId = `t_${tag}`;

  beforeAll(async () => {
    env = await setupTestEnvironment();
    const a = env.adminClient;

    const nA = await a.from("notifications").insert({ target_user_id: env.primaryCaregiverUser.userId, title: `ntf_${tag}_A`, patient_id: env.patientId }).select("id").single();
    const nB = await a.from("notifications").insert({ target_user_id: env.strangerUser.userId, title: `ntf_${tag}_B`, patient_id: env.strangerPatientId }).select("id").single();
    if (nA.error || nB.error) throw new Error(`seed notifiche: ${nA.error?.message ?? nB.error?.message}`);
    notifA = nA.data!.id;
    notifB = nB.data!.id;

    const t = await a.from("therapies").insert({ id: therapyId, patient_id: env.patientId, name: `Terapia ${tag}`, times: ["08:00"], recurrence: { type: "daily" } });
    if (t.error) throw new Error(`seed terapia: ${t.error.message}`);
    const s = await a.from("stock_movements").insert({ therapy_id: therapyId, delta: 10, reason: "manual:refill" });
    if (s.error) throw new Error(`seed stock: ${s.error.message}`);
  }, 60000);

  afterAll(async () => {
    const a = env.adminClient;
    await a.from("notifications").delete().in("id", [notifA, notifB]);
    await a.from("stock_movements").delete().eq("therapy_id", therapyId);
    await a.from("therapies").delete().eq("id", therapyId);
    await teardownTestEnvironment(env);
  });

  const ids = (rows: { id: string }[] | null) => new Set((rows ?? []).map((r) => r.id));

  describe("notifications", () => {
    it("Ognuno vede le proprie notifiche e non quelle dell'altra famiglia", async () => {
      const own = ids((await env.primaryCaregiverUser.client.from("notifications").select("id")).data as any);
      expect(own.has(notifA)).toBe(true);
      expect(own.has(notifB)).toBe(false);

      const stranger = ids((await env.strangerUser.client.from("notifications").select("id")).data as any);
      expect(stranger.has(notifB)).toBe(true);
      expect(stranger.has(notifA)).toBe(false);
    });

    it("Il caregiver collegato vede le notifiche del paziente, non quelle dell'altra famiglia", async () => {
      const seen = ids((await env.secondaryCaregiverUser.client.from("notifications").select("id")).data as any);
      expect(seen.has(notifA)).toBe(true);
      expect(seen.has(notifB)).toBe(false);
    });

    it("Un estraneo NON può segnare come lette le notifiche altrui", async () => {
      await env.strangerUser.client.from("notifications").update({ read: true }).eq("id", notifA);
      const { data } = await env.adminClient.from("notifications").select("read").eq("id", notifA).single();
      expect(data?.read).toBe(false);
    });

    it("Nessuno può reindirizzare una propria notifica verso un altro utente", async () => {
      await env.strangerUser.client.from("notifications").update({ target_user_id: env.primaryCaregiverUser.userId }).eq("id", notifB);
      const { data } = await env.adminClient.from("notifications").select("target_user_id").eq("id", notifB).single();
      expect(data?.target_user_id).toBe(env.strangerUser.userId);
    });

    it("Nessun utente può CREARE notifiche (anti-spoofing: messaggi falsi a un'altra persona)", async () => {
      const { error } = await env.strangerUser.client.from("notifications").insert({
        target_user_id: env.primaryCaregiverUser.userId, title: `FAKE_${tag}`,
      });
      expect(error).not.toBeNull();
      const { data } = await env.adminClient.from("notifications").select("id").eq("title", `FAKE_${tag}`);
      expect(data ?? []).toHaveLength(0);
    });
  });

  describe("stock_movements", () => {
    it("Titolare e caregiver collegato leggono i movimenti; l'estraneo no", async () => {
      expect(((await env.primaryCaregiverUser.client.from("stock_movements").select("id").eq("therapy_id", therapyId)).data ?? []).length).toBe(1);
      expect(((await env.secondaryCaregiverUser.client.from("stock_movements").select("id").eq("therapy_id", therapyId)).data ?? []).length).toBe(1);
      expect(((await env.strangerUser.client.from("stock_movements").select("id").eq("therapy_id", therapyId)).data ?? []).length).toBe(0);
    });

    it("L'estraneo NON può registrare movimenti di scorta sulla terapia altrui", async () => {
      const { error } = await env.strangerUser.client.from("stock_movements").insert({ therapy_id: therapyId, delta: 999, reason: "manual:attack" });
      expect(error).not.toBeNull();
    });

    it("Il caregiver secondario NON può modificare le scorte (solo il primario)", async () => {
      const { error } = await env.secondaryCaregiverUser.client.from("stock_movements").insert({ therapy_id: therapyId, delta: 5, reason: "manual:secondary" });
      expect(error).not.toBeNull();
    });

    it("Il caregiver primario può registrare un movimento", async () => {
      const { error } = await env.primaryCaregiverUser.client.from("stock_movements").insert({ therapy_id: therapyId, delta: -1, reason: "manual:primary_ok" });
      expect(error).toBeNull();
    });

    it("Nessuno può modificare o cancellare movimenti già registrati (registro append-only)", async () => {
      await env.primaryCaregiverUser.client.from("stock_movements").update({ delta: 12345 }).eq("therapy_id", therapyId);
      await env.primaryCaregiverUser.client.from("stock_movements").delete().eq("therapy_id", therapyId);
      const { data } = await env.adminClient.from("stock_movements").select("delta").eq("therapy_id", therapyId);
      expect((data ?? []).length).toBeGreaterThanOrEqual(2);
      expect((data ?? []).some((r) => r.delta === 12345)).toBe(false);
    });
  });
});
