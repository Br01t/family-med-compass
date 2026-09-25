import { test, expect } from "@playwright/test";

test.describe("E2E Flusso Paziente & Terapia", () => {
  test("Navigazione principale, visualizzazione e interazione con le terapie", async ({ page }) => {
    // 1. Visita la home page dell'applicazione
    await page.goto("/");
    await expect(page).toHaveTitle(/FamilyMed/i);

    // 2. Se in manutenzione o splash screen, verifica rendering sicuro
    const maintenanceBanner = page.locator("text=Manutenzione");
    if (await maintenanceBanner.isVisible()) {
      test.skip(true, "App in modalità manutenzione per migrazione.");
      return;
    }

    // 3. Verifica presenza navigazione principale
    const navbar = page.locator("nav");
    await expect(navbar).toBeVisible();

    // 4. Navigazione verso la pagina Terapie
    await page.goto("/terapie");
    await expect(page.locator("h1, h2").filter({ hasText: /Terapie/i })).toBeVisible();

    // 5. Verifica pulsante aggiunta terapia
    const addTherapyBtn = page.locator("button").filter({ hasText: /Aggiungi terapia/i });
    if (await addTherapyBtn.isVisible()) {
      await addTherapyBtn.click();
      // Verifica apertura del Dialog
      await expect(page.locator("[role='dialog']")).toBeVisible();
      // Verifica campo nome con limite di lunghezza presente
      const nameInput = page.locator("#therapy-name-input");
      await expect(nameInput).toHaveAttribute("maxLength", "120");
    }
  });
});
