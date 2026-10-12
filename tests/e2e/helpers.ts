import { expect, Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { TEST_CONFIG } from "../fixtures/test-constants";

/** Utenti creati da supabase/seed.sql (solo database LOCALE). */
export const DEMO_PASSWORD = "Password123!";
export const USERS = {
  anna: "anna.demo@example.com",   // Pro, proprietaria di Giuseppe e Rosa
  luigi: "luigi.demo@example.com", // caregiver secondario di Giuseppe
  free: "free.demo@example.com",   // piano Free, 3 terapie (limite)
};
/** Immagine PNG 1x1 valida, usata per le foto obbligatorie su Pro/Max. */
export const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export const IDS = {
  anna: "a0000000-0000-4000-8000-000000000001",
  giuseppe: "p_demo_giuseppe",
  metformina: "t_demo_metformina",
};

/** Client con chiave di servizio, SOLO per preparare e verificare i dati nel DB locale. */
export const admin = createClient(TEST_CONFIG.supabaseUrl, TEST_CONFIG.supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function localSupabaseIsUp(): Promise<boolean> {
  try {
    const r = await fetch(`${TEST_CONFIG.supabaseUrl}/auth/v1/health`, {
      headers: { apikey: TEST_CONFIG.supabaseAnonKey },
    });
    return r.ok;
  } catch {
    return false;
  }
}

const onlineHits = new WeakMap<Page, string[]>();

/**
 * Prepara la pagina:
 *  - BLOCCA ogni richiesta verso *.supabase.co (l'online): i test E2E non devono mai
 *    leggere o scrivere sul progetto reale, nemmeno se .env punta lì;
 *  - salta tour di benvenuto e banner di installazione, che coprirebbero i pulsanti.
 */
export async function preparePage(page: Page) {
  const hits: string[] = [];
  onlineHits.set(page, hits);
  await page.route(/^https:\/\/[^/]*\.supabase\.co\//, (route) => {
    hits.push(route.request().url());
    return route.abort();
  });
  await page.addInitScript(() => {
    for (const role of ["caregiver", "paziente"]) {
      localStorage.setItem(`familymed:onboarding:${role}:done`, "1");
      localStorage.setItem(`familymed:onboarding:${role}:skip`, "1");
    }
    localStorage.setItem("familymed:install-dismissed", "true");
  });
}

export function assertNoOnlineHits(page: Page) {
  const hits = onlineHits.get(page) ?? [];
  if (hits.length) {
    throw new Error(
      "L'app sta puntando al Supabase ONLINE (richiesta bloccata: " + hits[0] + "). " +
        "Chiudi `npm run dev`, controlla .env.development.local e rilancia: i test devono usare il Supabase locale.",
    );
  }
}

/** Aspetta che React abbia "preso in mano" l'elemento (idratazione): prima di allora un clic
 *  non fa nulla, o fa partire l'invio nativo del modulo e ricarica la pagina. */
export async function waitForHydration(page: Page, selector: string, timeout = 30_000) {
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      return !!el && Object.keys(el).some((k) => k.startsWith("__reactProps$") || k.startsWith("__reactFiber$"));
    },
    selector,
    { timeout },
  );
}

/** Clic su un elemento solo quando l'app è pronta a gestirlo. */
export async function clickWhenReady(page: Page, selector: string) {
  await expect(page.locator(selector)).toBeVisible({ timeout: 20_000 });
  await waitForHydration(page, selector);
  await page.locator(selector).click();
}

/** Cosa vede l'utente in questo momento: serve a capire il motivo di un fallimento. */
export async function uiSnapshot(page: Page): Promise<string> {
  try {
    const toasts = await page.locator("[data-sonner-toast]").allInnerTexts();
    const alerts = await page.locator('[role="alert"], .text-destructive').allInnerTexts();
    return `URL=${page.url()} | messaggi=${JSON.stringify(toasts)} | errori=${JSON.stringify(alerts.slice(0, 6))}`;
  } catch {
    return `URL=${page.url()}`;
  }
}

/** Esegue un controllo e, se fallisce, aggiunge all'errore ciò che l'utente stava vedendo. */
export async function withUi<T>(page: Page, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const snap = await uiSnapshot(page);
    throw new Error(`${(e as Error).message}\n--- Stato della pagina: ${snap}`);
  }
}

export async function login(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto("/login");
  await expect(page.locator("#email")).toBeVisible({ timeout: 30_000 });
  await waitForHydration(page, "#email");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator('button[type="submit"]').first().click();
  try {
    await page.waitForURL(/\/(caregiver|paziente)(\/|$|\?)/, { timeout: 25_000 });
  } catch (e) {
    assertNoOnlineHits(page);
    const snap = await uiSnapshot(page);
    throw new Error(
      `Login non riuscito per ${email}. Gli utenti di esempio esistono? Esegui \`npx supabase db reset\`.\n` +
        `--- Stato della pagina: ${snap}\n(${(e as Error).message})`,
    );
  }
  assertNoOnlineHits(page);
}

/** L'albero React è stato idratato (controllo su un pulsante qualsiasi della pagina). */
export async function waitForAppHydrated(page: Page) {
  await waitForHydration(page, "button");
}

/**
 * Utente temporaneo (non quelli del seed) per i test che modificano piano o dati.
 * Crea utente, profilo, ruolo e scheda caregiver; il chiamante lo elimina con deleteTempUser.
 */
export async function createTempUser(label: string, stamp: number) {
  const email = `e2e_${label}_${stamp}@test.local`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password: DEMO_PASSWORD, email_confirm: true,
    user_metadata: { name: `E2E ${label}`, role: "caregiver" },
  });
  if (error || !data.user) throw new Error(`createTempUser: ${error?.message}`);
  const id = data.user.id;
  await admin.from("profiles").upsert({ id, email, name: `E2E ${label}`, role: "caregiver" });
  await admin.from("user_roles").upsert({ user_id: id, role: "caregiver" }, { onConflict: "user_id,role" });
  await admin.from("caregivers").upsert({ id, name: `E2E ${label}` });
  return { id, email };
}

export async function deleteTempUser(id: string, patientIds: string[] = []) {
  if (patientIds.length) {
    await admin.from("events").delete().in("patient_id", patientIds);
    await admin.from("therapies").delete().in("patient_id", patientIds);
    await admin.from("caregiver_patients").delete().in("patient_id", patientIds);
    await admin.from("patients").delete().in("id", patientIds);
  }
  await admin.auth.admin.deleteUser(id).catch(() => {});
}
