import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { TEST_CONFIG } from "../fixtures/test-constants";
import { DEMO_PASSWORD, createTempUser, deleteTempUser, localSupabaseIsUp, preparePage, waitForHydration, withUi } from "./helpers";

/**
 * Reset password completo, sul Supabase LOCALE: richiesta dal login, email letta da Mailpit,
 * link, nuova password, accesso con la nuova password.
 *
 * Prerequisito: supabase/config.toml con site_url / additional_redirect_urls su localhost:5173
 * (dopo averlo cambiato: `npx supabase stop` e `npx supabase start`).
 */
const stamp = Date.now();
const MAILPIT = process.env.TEST_MAILPIT_URL ?? "http://127.0.0.1:54324";
const NEW_PASSWORD = "NuovaPassword456!";

async function mailpitIsUp() {
  try {
    return (await fetch(`${MAILPIT}/api/v1/info`)).ok;
  } catch {
    return false;
  }
}

async function messagesTo(email: string) {
  const r = await fetch(`${MAILPIT}/api/v1/messages?limit=200`);
  const j = (await r.json()) as { messages?: { ID: string; To: { Address: string }[] }[] };
  return (j.messages ?? []).filter((m) => m.To?.some((t) => t.Address.toLowerCase() === email.toLowerCase()));
}

async function waitForRecoveryLink(email: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    for (const m of await messagesTo(email)) {
      const full = (await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as { Text?: string; HTML?: string };
      const text = `${full.Text ?? ""}\n${full.HTML ?? ""}`.replace(/&amp;/g, "&");
      const found = text.match(/https?:\/\/[^\s"'<>)]+\/auth\/v1\/verify\?[^\s"'<>)]+/);
      if (found) return found[0];
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Nessuna email di recupero per ${email} in Mailpit (${MAILPIT}). Il Supabase locale è stato riavviato dopo la modifica di config.toml?`);
}

async function clearMessagesTo(email: string) {
  const ids = (await messagesTo(email)).map((m) => m.ID);
  if (ids.length) {
    await fetch(`${MAILPIT}/api/v1/messages`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ IDs: ids }),
    }).catch(() => {});
  }
}

async function requestReset(page: Page, email: string) {
  await page.goto("/login");
  await expect(page.locator("#email")).toBeVisible({ timeout: 30_000 });
  await waitForHydration(page, "#email");
  await page.locator("#email").fill(email);
  await page.getByRole("button", { name: "Password dimenticata?" }).click();
}

test.beforeAll(async () => {
  test.skip(!(await localSupabaseIsUp()), "Supabase locale spento: avvia `npx supabase start`.");
  test.skip(!(await mailpitIsUp()), `Mailpit non raggiungibile su ${MAILPIT}.`);
});

test.beforeEach(async ({ page }) => {
  await preparePage(page);
});

test("Reset completo: email, link, nuova password, accesso con la nuova e non più con la vecchia", async ({ page, browser }) => {
  const user = await createTempUser("reset", stamp);
  try {
    await requestReset(page, user.email);
    await withUi(page, () => expect(page.getByText("Email inviata").first()).toBeVisible({ timeout: 20_000 }));

    const link = await waitForRecoveryLink(user.email);
    await page.goto(link);
    await expect(page).toHaveURL(/\/reset-password/, { timeout: 20_000 });
    await expect(page.locator("#new-pw")).toBeVisible({ timeout: 20_000 });
    await waitForHydration(page, "#new-pw");

    // Prima password e conferma diverse: errore, nessun cambiamento
    await page.locator("#new-pw").fill(NEW_PASSWORD);
    await page.locator("#confirm-pw").fill("Diversa-123456");
    await page.getByRole("button", { name: "Aggiorna password" }).click();
    await expect(page.getByText("Le due password non coincidono").first()).toBeVisible({ timeout: 10_000 });

    // Poi quelle giuste
    await page.locator("#confirm-pw").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Aggiorna password" }).click();
    await withUi(page, () => expect(page.getByText("Password aggiornata").first()).toBeVisible({ timeout: 20_000 }));

    // La nuova password funziona, la vecchia no
    const anon = () => createClient(TEST_CONFIG.supabaseUrl, TEST_CONFIG.supabaseAnonKey, { auth: { persistSession: false } });
    const okNew = await anon().auth.signInWithPassword({ email: user.email, password: NEW_PASSWORD });
    expect(okNew.error).toBeNull();
    const okOld = await anon().auth.signInWithPassword({ email: user.email, password: DEMO_PASSWORD });
    expect(okOld.error).not.toBeNull();

    // Il link è monouso: riaprirlo da un altro browser non deve permettere di cambiare la password
    const ctx = await browser.newContext();
    const page2 = await ctx.newPage();
    await preparePage(page2);
    await page2.goto(link);
    await expect(page2.getByText(/Attendo il link di recupero/)).toBeVisible({ timeout: 20_000 });
    await expect(page2.locator("#new-pw")).toHaveCount(0);
    await ctx.close();
  } finally {
    await clearMessagesTo(user.email);
    await deleteTempUser(user.id);
  }
});

test("Email inesistente: stessa risposta di un indirizzo reale (non rivela chi è registrato) e nessuna email inviata", async ({ page }) => {
  const ghost = `nessuno_${stamp}@test.local`;
  await requestReset(page, ghost);
  await withUi(page, () => expect(page.getByText("Email inviata").first()).toBeVisible({ timeout: 20_000 }));
  await page.waitForTimeout(3000);
  expect(await messagesTo(ghost)).toHaveLength(0);
});

test("Aprire /reset-password senza il link della mail non mostra il modulo", async ({ page }) => {
  await page.goto("/reset-password");
  await expect(page.getByText(/Attendo il link di recupero/)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#new-pw")).toHaveCount(0);
});
