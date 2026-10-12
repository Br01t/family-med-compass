import { defineConfig, devices } from "@playwright/test";

const LOCAL_ANON_KEY =
  process.env.TEST_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  use: {
    baseURL: process.env.TEST_BASE_URL || "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  // Avvia da solo l'app in locale (porta 5173) se non è già in esecuzione.
  // Se imposti TEST_BASE_URL (es. un sito già online) il server locale non viene avviato.
  webServer: process.env.TEST_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:5173",
        reuseExistingServer: true,
        timeout: 120000,
        // I test E2E usano SEMPRE il Supabase locale, qualunque cosa dica il file .env
        // (le variabili d'ambiente hanno la precedenza sui file .env di Vite).
        // Valori pubblici di prova del Supabase locale, gli stessi usati da tests/fixtures.
        env: {
          SUPABASE_URL: "http://127.0.0.1:54321",
          VITE_SUPABASE_URL: "http://127.0.0.1:54321",
          VITE_SUPABASE_ANON_KEY: LOCAL_ANON_KEY,
          VITE_SUPABASE_PUBLISHABLE_KEY: LOCAL_ANON_KEY,
          SUPABASE_PUBLISHABLE_KEY: LOCAL_ANON_KEY,
        },
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
