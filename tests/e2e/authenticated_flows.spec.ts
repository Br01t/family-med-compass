import { test, expect } from "@playwright/test";
import { admin, IDS, PNG_1X1, USERS, assertNoOnlineHits, clickWhenReady, localSupabaseIsUp, login, preparePage, withUi } from "./helpers";

/**
 * E2E con utente connesso, sul Supabase LOCALE e sugli utenti di supabase/seed.sql.
 * Prerequisiti: Docker + `npx supabase start` + `npx supabase db reset` (carica il seed).
 * Ogni test pulisce ciò che crea.
 */
const stamp = Date.now();

test.beforeAll(async () => {
  test.skip(!(await localSupabaseIsUp()), "Supabase locale spento: avvia `npx supabase start`.");
});

test.beforeEach(async ({ page }) => {
  await preparePage(page);
});

test.describe("Accesso", () => {
  test("credenziali corrette portano alla home del caregiver", async ({ page }) => {
    await login(page, USERS.anna);
    await expect(page).toHaveURL(/\/caregiver/);
  });

  test("password errata: si resta sulla pagina di accesso", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill(USERS.anna);
    await page.locator("#password").fill("password-sbagliata-123");
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(3000);
    assertNoOnlineHits(page);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("#password")).toBeVisible();
  });
});

test.describe("Terapie", () => {
  test("Anna (Pro) aggiunge una terapia (foto obbligatorie) e la vede nell'elenco", async ({ page }) => {
    const name = `E2E Farmaco ${stamp}`;
    try {
      await login(page, USERS.anna);
      await page.goto("/terapie");
      await clickWhenReady(page, "#add-therapy-btn");

      await page.locator("#therapy-name-input").fill(name);
      await page.locator("#therapy-dosage-input").fill("10mg");
      await page.locator("#therapy-notes-input").fill("Terapia creata dal test E2E");
      // Su Pro/Max le due foto sono obbligatorie ("Foto terapia mancanti")
      await page.locator("#therapy-photo-drug").setInputFiles({ name: "farmaco.png", mimeType: "image/png", buffer: PNG_1X1 });
      await page.locator("#therapy-photo-package").setInputFiles({ name: "confezione.png", mimeType: "image/png", buffer: PNG_1X1 });
      await expect(page.getByRole("button", { name: "Sostituisci" })).toHaveCount(2, { timeout: 15_000 });
      await page.locator("#save-therapy-btn").click();

      await withUi(page, async () => {
        await expect(page.getByText("Terapia aggiunta").first()).toBeVisible({ timeout: 20_000 });
        await expect(page.getByText(name).first()).toBeVisible();
      });

      const { data } = await admin.from("therapies").select("id, patient_id").eq("name", name);
      expect(data ?? []).toHaveLength(1);
      // Le foto sono state caricate nello Storage privato
      const { data: files } = await admin.storage.from("therapy-photos").list(`therapies/${data![0].patient_id}/${data![0].id}`);
      expect((files ?? []).length).toBeGreaterThanOrEqual(2);
    } finally {
      const { data } = await admin.from("therapies").select("id, patient_id").eq("name", name);
      for (const t of data ?? []) {
        const dir = `therapies/${t.patient_id}/${t.id}`;
        const { data: files } = await admin.storage.from("therapy-photos").list(dir);
        if (files?.length) await admin.storage.from("therapy-photos").remove(files.map((f) => `${dir}/${f.name}`));
      }
      await admin.from("therapies").delete().eq("name", name);
    }
  });

  test("utente Free al limite: la 4ª terapia viene bloccata con l'invito a passare di piano", async ({ page }) => {
    const name = `E2E Oltre limite ${stamp}`;
    try {
      await login(page, USERS.free);
      await page.goto("/terapie");
      await clickWhenReady(page, "#add-therapy-btn");

      await page.locator("#therapy-name-input").fill(name);
      await page.locator("#therapy-dosage-input").fill("5mg");
      await page.locator("#therapy-notes-input").fill("Non deve essere salvata");
      await page.locator("#save-therapy-btn").click();

      await withUi(page, () => expect(page.getByText("Limite Terapie Attive Raggiunto")).toBeVisible({ timeout: 15_000 }));
      const { data } = await admin.from("therapies").select("id").eq("name", name);
      expect(data ?? []).toHaveLength(0);
    } finally {
      await admin.from("therapies").delete().eq("name", name);
    }
  });

  test("Luigi (caregiver secondario) vede le terapie ma non può aggiungerne", async ({ page }) => {
    await login(page, USERS.luigi);
    await page.goto("/terapie");
    await expect(page.getByText("Gestione terapie").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Metformina").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#add-therapy-btn")).toHaveCount(0);
  });
});

test.describe("Dosi", () => {
  test("una dose mancata viene confermata dal caregiver e nel DB diventa 'taken'", async ({ page }) => {
    const eventId = `ev_e2e_${stamp}`;
    // 10 minuti fa: è la più recente tra le dosi "mancate", quindi la prima della lista
    const scheduledAt = new Date(Date.now() - 10 * 60_000).toISOString();
    try {
      const ins = await admin.from("events").insert({
        id: eventId, therapy_id: IDS.metformina, patient_id: IDS.giuseppe,
        scheduled_at: scheduledAt, status: "missed", stage: "missed",
      });
      expect(ins.error).toBeNull();

      await login(page, USERS.anna);
      await page.goto("/dose-da-confermare");
      const confirm = page.getByRole("button", { name: "Segna come confermata" }).first();
      await expect(confirm).toBeVisible({ timeout: 20_000 });
      await confirm.click();
      await expect(page.getByText("Dose confermata").first()).toBeVisible({ timeout: 15_000 });

      await expect
        .poll(async () => (await admin.from("events").select("status").eq("id", eventId).single()).data?.status, { timeout: 15_000 })
        .toBe("taken");
    } finally {
      await admin.from("events").delete().eq("id", eventId);
    }
  });
});

test.describe("Famiglia", () => {
  test("Anna genera un codice invito dall'interfaccia e il codice esiste nel DB", async ({ page }) => {
    const before = new Date().toISOString();
    try {
      await login(page, USERS.anna);
      await page.goto(`/pazienti/${IDS.giuseppe}/famiglia`);
      const gen = page.getByRole("button", { name: "Genera codice" });
      await expect(gen).toBeVisible({ timeout: 20_000 });
      await gen.click();
      await expect(page.getByText("Codice generato").first()).toBeVisible({ timeout: 15_000 });

      const { data } = await admin.from("family_invites").select("code").eq("patient_id", IDS.giuseppe).eq("created_by", IDS.anna).gte("created_at", before);
      expect((data ?? []).length).toBeGreaterThanOrEqual(1);
    } finally {
      await admin.from("family_invites").delete().eq("patient_id", IDS.giuseppe).eq("created_by", IDS.anna).gte("created_at", before);
    }
  });
});
