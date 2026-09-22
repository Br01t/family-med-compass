/**
 * Risoluzione delle foto terapia dal bucket PRIVATO `therapy-photos`.
 * Wrapper sottile sopra src/lib/private-photo-url.ts (logica condivisa con
 * gli avatar caregiver) — vedi quel file per i dettagli di caching/RLS.
 *
 * Compatibilità con i dati esistenti: prima del passaggio a bucket privato
 * il DB conteneva URL pubblici completi (`.../object/public/therapy-photos/...`).
 * `extractTherapyPhotoPath` riconosce sia quel formato legacy sia il nuovo
 * formato "path nudo" (`therapies/{patientId}/{therapyId}/...`), così non è
 * necessaria alcuna migrazione dei dati già in tabella.
 */

import { extractPrivatePhotoPath, getSignedPrivateUrl } from "@/lib/private-photo-url";

const BUCKET = "therapy-photos";
const PATH_PREFIX = "therapies/";

export function extractTherapyPhotoPath(value: string | null | undefined): string | null {
  return extractPrivatePhotoPath(BUCKET, PATH_PREFIX, value);
}

export async function getSignedTherapyPhotoUrl(
  value: string | null | undefined,
): Promise<string | null> {
  const path = extractTherapyPhotoPath(value);
  return getSignedPrivateUrl(BUCKET, path);
}