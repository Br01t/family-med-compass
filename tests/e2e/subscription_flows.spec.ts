import { test, expect } from "@playwright/test";
import {
  admin, USERS, createTempUser, deleteTempUser, localSupabaseIsUp, login, preparePage, waitForAppHydrated, withUi,
} from "./helpers";

/**
 * Pagina "Piani e Abbonamenti" (/abbonamento): upgrade senza pagamenti e downgrade dall'interfaccia.
 * Usa il Supabase LOCALE. Il downgrade lavora su un utente temporaneo, non sui dati del seed.
 */
const stamp = Date.now();

test.beforeAll(async () => {
  test.skip(!(await localSupabaseIsUp()), "Supabase locale spento: avvia `npx supabase start`.");
});

test.beforeEach(async ({ page }) => {
  await preparePage(page);
});

test("Upgrade senza pagamenti: messaggio chiaro, piano invariato, nessuna funzione sbloccata", async ({ page }) => {
  await login(page, USERS.free);
  await page.goto("/abbonamento");
  const pro = page.getByRole("button", { name: /Seleziona Pro/ });
  await expect(pro).toBeVisible({ timeout: 20_000 });
  await waitForAppHydrated(page);
  await pro.click();

  await withUi(page, () => expect(page.getByText("Pagamenti in arrivo").first()).toBeVisible({ timeout: 15_000 }));
  await expect(page.getByText(/Errore durante l'aggiornamento/)).toHaveCount(0);

  const { data } = await admin.from("profiles").select("subscription_plan, subscription_plan_own").eq("email", USERS.free).single();
  expect(data?.subscription_plan_own).toBe("free");
  expect(data?.subscription_plan).toBe("free");
});

test("Downgrade Pro -> Free dall'interfaccia: riuscito, nessun errore, dati sospesi e non persi", async ({ page }) => {
  const user = await createTempUser("downgrade", stamp);
  const patients = [`p_e2e_dg_a_${stamp}`, `p_e2e_dg_b_${stamp}`];
  try {
    await admin.from("profiles").update({ subscription_plan_own: "pro" }).eq("id", user.id);
    for (const [i, pid] of patients.entries()) {
      const ins = await admin.from("patients").insert({
        id: pid, name: `Paziente DG ${i}`, birth_year: 1950, owner_user_id: user.id, primary_caregiver_id: user.id,
      });
      expect(ins.error).toBeNull();
      for (let t = 1; t <= 4; t++) {
        const r = await admin.from("therapies").insert({
          id: `t_e2e_dg_${i}_${t}_${stamp}`, patient_id: pid, name: `Farmaco ${i}-${t}`,
          times: ["08:00"], recurrence: { kind: "daily" },
        });
        expect(r.error).toBeNull();
      }
    }

    await login(page, user.email);
    await page.goto("/abbonamento");
    const free = page.getByRole("button", { name: /Seleziona Free/ });
    await expect(free).toBeVisible({ timeout: 20_000 });
    await waitForAppHydrated(page);
    await free.click();

    // Passo 1: scelta di cosa mantenere (preselezionata entro i limiti del Free)
    const next = page.getByRole("button", { name: /^Continua/ });
    await expect(next).toBeVisible({ timeout: 20_000 });
    await expect(next).toBeEnabled();
    await next.click();
    // Passo 2: conferma
    await page.getByRole("button", { name: /Conferma Downgrade/ }).click();

    await withUi(page, async () => {
      await expect(page.getByText(/Piano modificato in Free/).first()).toBeVisible({ timeout: 20_000 });
    });
    await expect(page.getByText(/Errore imprevisto/)).toHaveCount(0);
    await expect(page.getByText(/Errore durante il downgrade/)).toHaveCount(0);

    // Database: piano Free, un paziente sospeso, e per quello mantenuto 3 terapie attive + 1 sospesa
    const prof = await admin.from("profiles").select("subscription_plan, subscription_plan_own").eq("id", user.id).single();
    expect(prof.data?.subscription_plan_own).toBe("free");
    expect(prof.data?.subscription_plan).toBe("free");

    const pts = (await admin.from("patients").select("id, suspended_at").in("id", patients)).data ?? [];
    expect(pts).toHaveLength(2);                                   // nessun paziente cancellato
    expect(pts.filter((p) => p.suspended_at !== null)).toHaveLength(1);
    const kept = pts.find((p) => p.suspended_at === null)!;

    const ths = (await admin.from("therapies").select("id, suspended_at").eq("patient_id", kept.id)).data ?? [];
    expect(ths).toHaveLength(4);                                    // nessuna terapia cancellata
    expect(ths.filter((t) => t.suspended_at !== null)).toHaveLength(1);
  } finally {
    await deleteTempUser(user.id, patients);
  }
});
