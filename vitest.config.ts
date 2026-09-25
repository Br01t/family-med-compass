import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 60000,
    hookTimeout: 60000,
    // CRITICO: un solo worker, nessun isolamento tra file.
    // Questo fa sì che tutti i file vengano eseguiti in sequenza
    // nello stesso processo — indispensabile per non saturare
    // l'Auth API locale di Supabase con burst di creazione utenti.
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    isolate: false,
    // Nessuna esecuzione in parallelo dei file
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
