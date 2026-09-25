/**
 * Costanti e parametri di configurazione per i test automatici.
 * Puntano di default all'istanza Supabase locale (supabase start).
 * ZERO connessioni al Supabase cloud di produzione, ZERO costi.
 */

export const TEST_CONFIG = {
  // Supabase locale (porta standard avviata da `supabase start`)
  supabaseUrl: process.env.TEST_SUPABASE_URL || "http://127.0.0.1:54321",
  
  // Chiavi standard generate da Supabase CLI in ambiente locale
  supabaseAnonKey:
    process.env.TEST_SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
    
  supabaseServiceRoleKey:
    process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",

  // Chiavi pubbliche ufficiali Cloudflare Turnstile per ambienti di test (passa sempre)
  turnstileAlwaysPassSiteKey: "1x00000000000000000000AA",
  turnstileAlwaysFailSiteKey: "2x00000000000000000000AB",
};
