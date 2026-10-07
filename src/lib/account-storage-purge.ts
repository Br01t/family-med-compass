import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

/**
 * Pulizia dei file su Supabase Storage PRIMA di eseguire `delete_my_account()`.
 *
 * `delete_my_account()` cancella solo le righe Postgres: i file fisici nei bucket
 * resterebbero per sempre (art. 17 GDPR), occupando quota e restando validi per
 * qualunque Signed URL già emesso. La RLS del bucket autorizza la remove() solo
 * finché il collegamento paziente/terapia esiste ancora, quindi va fatto PRIMA.
 * Best-effort: un fallimento non deve mai bloccare la cancellazione dell'account.
 *
 * Estratto da AccountDataCard.tsx per poterlo testare (tests/security/11_*).
 * Restituisce il numero di file rimossi.
 */
export async function purgeOwnedTherapyPhotos(
  supabase: SupabaseClient | null,
  ownerUserId: string,
): Promise<number> {
  if (!supabase) return 0;
  let removed = 0;
  try {
    const { data: patients, error: patientsError } = await supabase
      .from("patients")
      .select("id")
      .or(`user_id.eq.${ownerUserId},owner_user_id.eq.${ownerUserId}`);
    if (patientsError || !patients) return 0;

    for (const patient of patients) {
      const { data: therapies } = await supabase
        .from("therapies")
        .select("id")
        .eq("patient_id", patient.id);

      for (const therapy of therapies ?? []) {
        // Schema attuale: therapies/{patientId}/{therapyId}/...
        const { data: newSchemeFiles } = await supabase.storage
          .from("therapy-photos")
          .list(`therapies/${patient.id}/${therapy.id}`);
        if (newSchemeFiles && newSchemeFiles.length > 0) {
          const paths = newSchemeFiles.map(
            (f) => `therapies/${patient.id}/${therapy.id}/${f.name}`,
          );
          await supabase.storage.from("therapy-photos").remove(paths);
          removed += paths.length;
        }

        // Schema legacy (foto caricate prima del passaggio a bucket privato):
        // therapies/{therapyId}/... — ripulito per compatibilità.
        const { data: legacyFiles } = await supabase.storage
          .from("therapy-photos")
          .list(`therapies/${therapy.id}`);
        if (legacyFiles && legacyFiles.length > 0) {
          const paths = legacyFiles.map((f) => `therapies/${therapy.id}/${f.name}`);
          await supabase.storage.from("therapy-photos").remove(paths);
          removed += paths.length;
        }
      }
    }
  } catch (e) {
    logger.warn("[account-storage-purge] Pulizia foto Storage fallita (non bloccante)", e);
  }
  return removed;
}

/** Rimuove dal bucket `caregiver-avatars` l'avatar dell'utente che cancella l'account. */
export async function purgeOwnCaregiverAvatar(
  supabase: SupabaseClient | null,
  ownerUserId: string,
): Promise<number> {
  if (!supabase) return 0;
  try {
    const { data: files } = await supabase.storage
      .from("caregiver-avatars")
      .list(`caregivers/${ownerUserId}`);
    if (files && files.length > 0) {
      const paths = files.map((f) => `caregivers/${ownerUserId}/${f.name}`);
      await supabase.storage.from("caregiver-avatars").remove(paths);
      return paths.length;
    }
  } catch (e) {
    logger.warn("[account-storage-purge] Pulizia avatar caregiver fallita (non bloccante)", e);
  }
  return 0;
}
