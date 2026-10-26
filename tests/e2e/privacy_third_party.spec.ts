import { test, expect } from "@playwright/test";
import { USERS, localSupabaseIsUp, login, preparePage } from "./helpers";

/**
 * Privacy (GDPR): l'app non deve contattare servizi di terzi (font, analytics, CDN, tracker).
 * Gli unici host ammessi sono l'app stessa e il Supabase locale. Se in futuro qualcuno aggiunge
 * Google Fonts, un tracker o uno script esterno, questo test fallisce e indica l'indirizzo.
 * (Cloudflare Turnstile compare solo in produzione, quando è impostata la chiave del captcha.)
 */
const ALLOWED = new Set(["localhost:5173", "127.0.0.1:54321"]);

test.beforeAll(async () => {
  test.skip(!(await localSupabaseIsUp()), "Supabase locale spento: avvia `npx supabase start`.");
});

test("nessuna richiesta a terzi su landing, login e area riservata", async ({ page }) => {
  await preparePage(page);
  const hosts = new Map<string, string>();
  page.on("request", (req) => {
    const u = new URL(req.url());
    if (u.protocol === "data:" || u.protocol === "blob:") return;
    if (!ALLOWED.has(u.host)) hosts.set(u.host, req.url());
  });

  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await login(page, USERS.anna);
  await page.goto("/terapie");
  await page.waitForLoadState("networkidle");
  await page.goto("/impostazioni");
  await page.waitForLoadState("networkidle");

  expect([...hosts.entries()], `Richieste a terzi: ${[...hosts.keys()].join(", ")}`).toEqual([]);
});
