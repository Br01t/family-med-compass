import { test, expect } from "@playwright/test";

/**
 * E2E pubblico (senza login): landing, accesso alla pagina di login e verifica
 * che un visitatore non autenticato non riceva dati sanitari dall'API.
 *
 * Nota: se in src/routes/__root.tsx è MAINTENANCE_MODE = true l'app mostra solo
 * "FamilyMed è attualmente SOSPESO" e questo test viene SALTATO (non passa "a vuoto").
 */
test.describe("E2E Flusso pubblico — landing, login, nessun dato senza sessione", () => {
  test("Landing, navigazione verso il login e assenza di dati per utente non autenticato", async ({ page }) => {
    const apiResponses: { url: string; body: unknown }[] = [];
    page.on("response", async (res) => {
      const url = res.url();
      if (/\/rest\/v1\/(patients|therapies|events|vital_signs|wellness_notes|patient_medical_profiles)/.test(url)) {
        apiResponses.push({ url, body: await res.json().catch(() => null) });
      }
    });

    // 1. Home
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    const suspended = page.getByText(/SOSPESO|Manutenzione/i).first();
    if (await suspended.isVisible().catch(() => false)) {
      test.skip(true, "App sospesa: MAINTENANCE_MODE = true in src/routes/__root.tsx.");
      return;
    }
    await expect(page).toHaveTitle(/FamilyMed/i);

    // 2. Navigazione principale della landing
    await expect(page.locator("nav").first()).toBeVisible();

    // 3. Accedi -> pagina di login con campi email e password (password mascherata)
    await page.getByRole("link", { name: /^Accedi$/ }).first().click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toHaveAttribute("type", "password");

    // 4. Da non autenticato, una pagina interna non deve ricevere righe sanitarie dall'API
    await page.goto("/terapie");
    await page.waitForTimeout(3000);
    for (const r of apiResponses) {
      if (Array.isArray(r.body)) {
        expect(r.body, `L'API ha restituito dati a un utente non autenticato: ${r.url}`).toHaveLength(0);
      }
    }
  });
});