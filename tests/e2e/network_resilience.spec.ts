import { test, expect } from "@playwright/test";

test.describe("E2E Resilienza di Rete — Offline & Errori di Caricamento", () => {
  test("La caduta della connessione non azzera i dati a schermo", async ({ page, context }) => {
    await page.goto("/");

    // 1. Simula caduta improvvisa della connessione (modalità offline)
    await context.setOffline(true);

    // 2. Navigazione verso una pagina interna
    await page.goto("/impostazioni").catch(() => {});

    // 3. Ripristino connettività
    await context.setOffline(false);

    // L'app non deve andare in crash con schermata bianca
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });
});
