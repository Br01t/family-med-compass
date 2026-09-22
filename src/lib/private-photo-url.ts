/**
 * Risoluzione generica di foto/file da bucket Storage PRIVATI, tramite
 * Signed URL temporanei generati on-demand e cachati in memoria.
 *
 * Nato per le foto terapia (`therapy-photos`, vedi
 * supabase/migrations/20260916000000_private_therapy_photos.sql) e riusato
 * anche per gli avatar dei caregiver (`caregiver-avatars`, vedi
 * supabase/migrations/20260919000000_caregiver_avatars_bucket.sql): stessa
 * logica, bucket diverso — per questo è stato estratto qui invece di
 * duplicare il codice.
 *
 * Per restare leggeri sul piano free anche con molti utenti:
 * - i Signed URL vengono **cachati in memoria** (per tab, per bucket+path)
 *   e riusati finché non sono vicini alla scadenza;
 * - le richieste concorrenti per lo stesso bucket+path vengono deduplicate.
 */

import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

/** Validità del Signed URL lato Supabase. */
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 ora
/** Rigenera in anticipo se mancano meno di 5 minuti alla scadenza. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

type CacheEntry = { url: string; expiresAt: number };

const urlCache = new Map<string, CacheEntry>();
const inflightRequests = new Map<string, Promise<string | null>>();

function cacheKey(bucket: string, path: string): string {
  return `${bucket}:${path}`;
}

/**
 * Estrae il path dell'oggetto Storage da un valore salvato in DB, che sia
 * già un path nudo (riconosciuto dal prefisso indicato) o un vecchio URL
 * pubblico completo (per la compatibilità con dati caricati prima del
 * passaggio a bucket privato). Ritorna `null` se il valore non è
 * riconducibile a un oggetto di quel bucket.
 */
export function extractPrivatePhotoPath(
  bucket: string,
  pathPrefix: string,
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  if (value.startsWith(pathPrefix)) return value;

  const marker = `/${bucket}/`;
  const idx = value.indexOf(marker);
  if (idx === -1) return null;

  let path = value.slice(idx + marker.length);
  const queryIdx = path.indexOf("?");
  if (queryIdx !== -1) path = path.slice(0, queryIdx);

  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/**
 * Risolve un path di un bucket privato in un Signed URL temporaneo pronto
 * per un tag `<img src>`. Ritorna `null` se il path è assente o se la RLS
 * nega l'accesso (utente non autorizzato per quella risorsa).
 */
export async function getSignedPrivateUrl(
  bucket: string,
  path: string | null | undefined,
): Promise<string | null> {
  if (!path || !supabase) return null;

  const key = cacheKey(bucket, path);
  const cached = urlCache.get(key);
  if (cached && cached.expiresAt - Date.now() > REFRESH_MARGIN_MS) {
    return cached.url;
  }

  const pending = inflightRequests.get(key);
  if (pending) return pending;

  const request = (async () => {
    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      if (error || !data?.signedUrl) {
        if (error) logger.warn(`[private-photo-url] createSignedUrl fallita (${bucket})`, error);
        return null;
      }
      urlCache.set(key, {
        url: data.signedUrl,
        expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
      });
      return data.signedUrl;
    } finally {
      inflightRequests.delete(key);
    }
  })();

  inflightRequests.set(key, request);
  return request;
}