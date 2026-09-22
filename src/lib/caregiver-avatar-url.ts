/**
 * Risoluzione degli avatar caregiver dal bucket PRIVATO `caregiver-avatars`.
 * Wrapper sottile sopra src/lib/private-photo-url.ts (logica condivisa con
 * le foto terapia) — vedi quel file per i dettagli di caching/RLS, e
 * supabase/migrations/20260919000000_caregiver_avatars_bucket.sql per la
 * definizione del bucket e delle policy.
 */

import { extractPrivatePhotoPath, getSignedPrivateUrl } from "@/lib/private-photo-url";

const BUCKET = "caregiver-avatars";
const PATH_PREFIX = "caregivers/";

export function extractCaregiverAvatarPath(value: string | null | undefined): string | null {
  return extractPrivatePhotoPath(BUCKET, PATH_PREFIX, value);
}

export async function getSignedCaregiverAvatarUrl(
  value: string | null | undefined,
): Promise<string | null> {
  const path = extractCaregiverAvatarPath(value);
  return getSignedPrivateUrl(BUCKET, path);
}