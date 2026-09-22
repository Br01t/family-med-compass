import { createClient } from "@supabase/supabase-js";

/**
 * ATTENZIONE — sicurezza: questo file caricava in precedenza un URL e una
 * anon key HARDCODED come fallback ("qdwadqkpobtxivlypbio.supabase.co"),
 * usati ogni volta che le variabili d'ambiente VITE_SUPABASE_URL/
 * VITE_SUPABASE_ANON_KEY non erano impostate. Quel progetto è DIVERSO da
 * quello reale dell'app (vedi "project_id" in supabase/config.toml): se le
 * variabili d'ambiente fossero mai mancate — un deploy di anteprima, una
 * pipeline CI, un ambiente locale senza .env — l'intera app (login, dati
 * pazienti, terapie: praticamente tutto, dato che quasi tutto il codice
 * importa il client da questo file) si sarebbe connessa in silenzio a un
 * progetto Supabase sconosciuto e non verificato, invece di segnalare
 * l'errore. Ora, in coerenza con src/integrations/supabase/client.ts (che
 * già adottava questo pattern più sicuro), l'app si ferma con un errore
 * chiaro se la configurazione manca, invece di degradare in silenzio.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  const missing = [
    ...(!supabaseUrl ? ["VITE_SUPABASE_URL"] : []),
    ...(!supabaseAnonKey ? ["VITE_SUPABASE_ANON_KEY o VITE_SUPABASE_PUBLISHABLE_KEY"] : []),
  ];
  throw new Error(
    `Variabili d'ambiente Supabase mancanti: ${missing.join(", ")}. Configurale prima di avviare l'app — nessun fallback a un progetto diverso è previsto per motivi di sicurezza.`,
  );
}

const isBrowser = typeof window !== "undefined";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: isBrowser,
    autoRefreshToken: isBrowser,
    detectSessionInUrl: isBrowser,
  },
});