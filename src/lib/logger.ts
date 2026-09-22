/**
 * Logger centralizzato "privacy-safe".
 *
 * PERCHÉ ESISTE
 * -------------
 * `console.log(err)` o `console.error("Creating therapy", therapy)` sono comodi ma
 * pericolosi in un'app che tratta dati sanitari (art. 9 GDPR): l'oggetto passato al
 * console può contenere nomi, dosaggi, note cliniche... e finire:
 *  - nella console del browser (visibile a chiunque abbia accesso al device/estensioni),
 *  - nei log dei Cloudflare Workers (lato server.ts),
 *  - nei log delle Supabase Edge Functions,
 *  - in un futuro tool di error tracking (Sentry & co.), se mai verrà aggiunto.
 *
 * REGOLE
 * ------
 * 1. Non si logga MAI un oggetto "di dominio" (paziente, terapia, dose, nota, ecc.)
 *    così com'è. Si loggano solo identificativi tecnici (id) o metadati safe
 *    (contatori, codici errore, nomi di funzione).
 * 2. Gli errori (`Error`, `PostgrestError`, ecc.) vengono ridotti a
 *    `{ message, code, name }`. Si scartano volutamente i campi `details`/`hint`
 *    di PostgREST perché su violazioni di vincolo possono riportare i valori
 *    coinvolti (es. "Key (email)=(...) already exists").
 * 3. `debug`/`info` sono silenziati in produzione di default: riducono rumore e
 *    volume di log lato Edge Functions / Cloudflare Workers (utile perché il piano
 *    free di Supabase ha retention/quota di log limitate — non è un costo per il
 *    client-side, ma lo è per le funzioni server-side).
 * 4. `warn`/`error` restano sempre attivi (servono per il debug in produzione) ma
 *    passano comunque dalla sanitizzazione.
 *
 * USO
 * ---
 *   import { logger } from "@/lib/logger";
 *
 *   logger.info("Therapy created", { therapyId, userId });     // solo id, mai il payload
 *   logger.warn("fetch fallito, uso cache", err);               // err viene sanitizzato
 *   logger.error("[AddPatientDialog] salvataggio fallito", err);
 */

// Rilevamento ambiente compatibile sia con Vite (browser) sia con Node/Workers (server,
// edge functions), senza introdurre dipendenze da `import.meta` in contesti dove non è
// disponibile.
const isDev: boolean = (() => {
  try {
    // Vite espone import.meta.env.DEV lato client e lato SSR con Vite.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore -- import.meta.env non è tipizzato in tutti i target di build
    if (typeof import.meta !== "undefined" && import.meta.env) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      return Boolean(import.meta.env.DEV);
    }
  } catch {
    // ignora: import.meta non disponibile in questo runtime
  }
  if (typeof process !== "undefined" && process.env) {
    return process.env.NODE_ENV !== "production";
  }
  return false;
})();

/** Metadati ammessi nei log: solo identificativi tecnici e numeri, mai testo libero. */
export type SafeLogMeta = Record<string, string | number | boolean | null | undefined>;

interface SafeError {
  message: string;
  code?: string;
  name?: string;
}

const MAX_MESSAGE_LENGTH = 300;

function truncate(value: string, max = MAX_MESSAGE_LENGTH): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/**
 * Riduce un errore (di qualunque forma: Error, PostgrestError, AuthError, stringa,
 * oggetto sconosciuto...) ai soli campi ritenuti sicuri da loggare.
 * Scarta deliberatamente `details`/`hint`/altri campi custom che potrebbero
 * contenere frammenti dei dati coinvolti nell'operazione fallita.
 */
function toSafeError(err: unknown): SafeError {
  if (err instanceof Error) {
    const withCode = err as Error & { code?: string; status?: number };
    return {
      message: truncate(err.message || "Errore senza messaggio"),
      code: withCode.code ?? (withCode.status ? String(withCode.status) : undefined),
      name: err.name,
    };
  }
  if (typeof err === "string") {
    return { message: truncate(err) };
  }
  if (err && typeof err === "object") {
    const anyErr = err as Record<string, unknown>;
    const message = typeof anyErr.message === "string" ? anyErr.message : "Errore non tipizzato";
    const code = typeof anyErr.code === "string" ? anyErr.code : undefined;
    return { message: truncate(message), code };
  }
  return { message: "Errore sconosciuto" };
}

/** Filtra i metadati: accetta solo valori primitivi, scarta oggetti/array annidati. */
function sanitizeMeta(meta?: SafeLogMeta): SafeLogMeta | undefined {
  if (!meta) return undefined;
  const out: SafeLogMeta = {};
  for (const [key, value] of Object.entries(meta)) {
    if (
      value === null ||
      value === undefined ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      out[key] = value;
      continue;
    }
    if (typeof value === "string") {
      out[key] = truncate(value, 120);
    }
    // Qualsiasi altro tipo (oggetti, array...) viene scartato silenziosamente:
    // è quasi sempre segno che si sta per loggare un payload di dominio per errore.
  }
  return out;
}

function emit(level: "debug" | "info" | "warn" | "error", message: string, meta?: SafeLogMeta) {
  const safeMeta = sanitizeMeta(meta);
  const payload = safeMeta && Object.keys(safeMeta).length > 0 ? [message, safeMeta] : [message];
  const consoleMethod = level === "debug" ? "log" : level;
  console[consoleMethod](...payload);
}

export const logger = {
  /** Solo in sviluppo. Per tracciare flussi durante il debug locale. */
  debug(message: string, meta?: SafeLogMeta) {
    if (!isDev) return;
    emit("debug", message, meta);
  },

  /** Eventi applicativi normali (es. "Therapy created"). Silenziato in produzione. */
  info(message: string, meta?: SafeLogMeta) {
    if (!isDev) return;
    emit("info", message, meta);
  },

  /** Situazioni recuperabili (fallback attivato, retry, ecc.). Sempre attivo, err sanitizzato. */
  warn(message: string, err?: unknown) {
    const safeErr = err !== undefined ? toSafeError(err) : undefined;
    emit("warn", message, safeErr as unknown as SafeLogMeta | undefined);
  },

  /** Errori. Sempre attivo, err sanitizzato (mai l'oggetto originale). */
  error(message: string, err?: unknown) {
    const safeErr = err !== undefined ? toSafeError(err) : undefined;
    emit("error", message, safeErr as unknown as SafeLogMeta | undefined);
  },
};