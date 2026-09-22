-- FamilyMed — bucket privato per gli avatar dei caregiver.
--
-- Stessa filosofia già applicata a therapy-photos (privacy tra famiglie):
-- bucket creato PRIVATO fin dall'inizio (non serve nessun passaggio manuale
-- da Dashboard stavolta, il bucket nasce già corretto), Signed URL
-- temporanei per la lettura, RLS coerente con la visibilità già esistente
-- sulla tabella `caregivers`.
--
-- Path: caregivers/{caregiverId}/avatar-{timestamp}.{ext}
-- A differenza delle foto terapia, qui NON serve la scorciatoia "autorizza
-- in base al padre prima che la riga esista": il caregiver ha già una riga
-- propria in `caregivers` (creata alla registrazione) nel momento in cui
-- può modificare il proprio profilo, quindi {caregiverId} = auth.uid() è
-- sempre verificabile direttamente.

-- 1. Bucket privato (created via SQL: niente passaggi da Dashboard).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'caregiver-avatars',
  'caregiver-avatars',
  false,
  2097152, -- 2 MB: un avatar compresso client-side (256px, JPEG) pesa poche decine di KB, 2MB è già un margine ampio
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET public = false;

-- 2. Helper di autorizzazione — stessa visibilità già in vigore sulla
--    tabella caregivers (self, "family peers" collegati allo stesso
--    paziente, e il paziente che quel caregiver segue).
CREATE OR REPLACE FUNCTION public.can_access_caregiver_avatar(_object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caregiver_id uuid;
BEGIN
  v_caregiver_id := (storage.foldername(_object_name))[2]::uuid;
  IF v_caregiver_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN
    -- il caregiver vede il proprio avatar
    v_caregiver_id = auth.uid()
    -- un "family peer": un altro caregiver collegato a un paziente in comune
    OR EXISTS (
      SELECT 1
      FROM public.caregiver_patients cp_target
      JOIN public.caregiver_patients cp_self ON cp_self.patient_id = cp_target.patient_id
      WHERE cp_target.caregiver_id = v_caregiver_id
        AND cp_self.caregiver_id = auth.uid()
    )
    -- il paziente seguito da quel caregiver, se ha un account proprio
    OR EXISTS (
      SELECT 1
      FROM public.caregiver_patients cp
      JOIN public.patients p ON p.id = cp.patient_id
      WHERE cp.caregiver_id = v_caregiver_id
        AND p.user_id = auth.uid()
    );
END;
$$;

COMMENT ON FUNCTION public.can_access_caregiver_avatar(text) IS
  'True se auth.uid() può VISUALIZZARE l''avatar del caregiver identificato dal path oggetto Storage: se stesso, un caregiver collegato allo stesso paziente, o il paziente seguito.';

-- 3. Policy RLS su storage.objects per questo bucket.
DROP POLICY IF EXISTS "caregiver-avatars: read if linked" ON storage.objects;
CREATE POLICY "caregiver-avatars: read if linked" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'caregiver-avatars'
    AND public.can_access_caregiver_avatar(name)
  );

DROP POLICY IF EXISTS "caregiver-avatars: write own" ON storage.objects;
CREATE POLICY "caregiver-avatars: write own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'caregiver-avatars'
    AND (storage.foldername(name))[2]::uuid = auth.uid()
  );

DROP POLICY IF EXISTS "caregiver-avatars: update own" ON storage.objects;
CREATE POLICY "caregiver-avatars: update own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'caregiver-avatars' AND (storage.foldername(name))[2]::uuid = auth.uid())
  WITH CHECK (bucket_id = 'caregiver-avatars' AND (storage.foldername(name))[2]::uuid = auth.uid());

DROP POLICY IF EXISTS "caregiver-avatars: delete own" ON storage.objects;
CREATE POLICY "caregiver-avatars: delete own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'caregiver-avatars' AND (storage.foldername(name))[2]::uuid = auth.uid());

-- =============================================================
-- Verifica dopo l'applicazione:
--   1. Un caregiver A carica il proprio avatar -> deve riuscire.
--   2. Un caregiver B SENZA pazienti in comune con A -> non deve vedere né
--      poter modificare l'avatar di A.
--   3. Un caregiver C collegato allo STESSO paziente di A -> deve poter
--      VEDERE l'avatar di A (per la pagina "famiglia"), ma non modificarlo.
--   4. Il paziente seguito da A (se ha un account proprio) deve poter
--      vedere l'avatar di A.
-- =============================================================