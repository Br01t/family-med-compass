-- FamilyMed — Bucket `therapy-photos` da pubblico a privato.
-- Da eseguire DOPO aver disattivato "Public bucket" per therapy-photos
-- nella Dashboard Supabase (Storage → therapy-photos → Configuration →
-- "Public bucket" OFF). Vedi compliance/storage-privacy-migration.md per la
-- guida passo passo completa.
--
-- Applicare con: supabase db push  (o incollare nel SQL editor della Dashboard)

-- =============================================================
-- Helper: autorizzazione in LETTURA di una foto terapia.
-- Path supportati:
--   nuovo schema  -> therapies/{patientId}/{therapyId}/{file}
--   schema legacy -> therapies/{therapyId}/{file}
-- (storage.foldername(name) ritorna i segmenti di cartella, cioè tutto
--  tranne il nome file: 2 elementi nel nuovo schema, 1 nel legacy — dato
--  che il primo elemento è sempre il letterale "therapies").
-- =============================================================
CREATE OR REPLACE FUNCTION public.can_access_therapy_photo(_object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_segments text[] := storage.foldername(_object_name);
  v_second text := v_segments[2];
  v_third text := v_segments[3];
BEGIN
  IF v_third IS NOT NULL THEN
    -- Nuovo schema: v_second = patientId, v_third = therapyId
    RETURN public.owns_patient(v_second) OR public.is_caregiver_of(v_second);
  END IF;

  IF v_second IS NOT NULL THEN
    -- Schema legacy: v_second = therapyId, risaliamo al paziente
    RETURN EXISTS (
      SELECT 1 FROM public.therapies t
      WHERE t.id = v_second
        AND (public.owns_patient(t.patient_id) OR public.is_caregiver_of(t.patient_id))
    );
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.can_access_therapy_photo(text) IS
  'True se auth.uid() può VISUALIZZARE la foto terapia identificata dal path oggetto Storage (nuovo schema o legacy).';

-- =============================================================
-- Helper: autorizzazione in SCRITTURA (upload/sostituzione/cancellazione).
-- Nel nuovo schema l''autorizzazione si basa sul PAZIENTE, non sulla
-- terapia: l''upload della foto avviene PRIMA che la riga `therapies`
-- esista (vedi AddTherapyDialog.tsx — il client genera l''id terapia,
-- carica le foto, e solo dopo inserisce la riga). Solo il caregiver
-- primario può creare/modificare/eliminare, stessa regola di RLS già
-- applicata alla tabella `therapies`.
-- =============================================================
CREATE OR REPLACE FUNCTION public.can_manage_therapy_photo(_object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_segments text[] := storage.foldername(_object_name);
  v_second text := v_segments[2];
  v_third text := v_segments[3];
BEGIN
  IF v_third IS NOT NULL THEN
    -- Nuovo schema: v_second = patientId (riga therapies può non esistere ancora)
    RETURN public.is_primary_of(v_second);
  END IF;

  IF v_second IS NOT NULL THEN
    -- Schema legacy: v_second = therapyId, la riga esiste già
    RETURN EXISTS (
      SELECT 1 FROM public.therapies t
      WHERE t.id = v_second AND public.is_primary_of(t.patient_id)
    );
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.can_manage_therapy_photo(text) IS
  'True se auth.uid() può CARICARE/SOSTITUIRE/ELIMINARE la foto terapia identificata dal path oggetto Storage (nuovo schema o legacy).';

-- =============================================================
-- Rimozione delle policy storage.objects esistenti su questo bucket
-- (create in supabase/migrations/20260911165516_initial_schema.sql,
-- NON incluse in supabase/schema_backup.sql perché pg_dump non esporta
-- le storage policy — verificare comunque nella Dashboard che i nomi
-- corrispondano prima di eseguire, potrebbero essere stati rinominati).
--
-- "therapy_photos_public_read" concedeva SELECT a bucket_id='therapy-photos'
-- SENZA ALCUNA CONDIZIONE aggiuntiva, sia al ruolo "anon" sia "authenticated":
-- è la causa diretta per cui il bucket è di fatto leggibile da chiunque
-- anche a prescindere dal flag "Public bucket" della Dashboard. Va rimossa
-- per ottenere davvero la privacy tra famiglie richiesta.
--
-- "therapy_photos_primary_insert/update/delete" contengono inoltre un bug:
-- confrontano `(storage.foldername(t.name))[2]` dove `t.name` è il nome del
-- FARMACO (colonna `therapies.name`, per via dell'alias `t` nella subquery
-- correlata) e non il path dell'oggetto Storage in scrittura — la condizione
-- risulta quindi quasi sempre falsa. Le sostituiamo con le funzioni corrette
-- definite sopra.
-- =============================================================
DROP POLICY IF EXISTS "therapy_photos_public_read" ON storage.objects;
DROP POLICY IF EXISTS "therapy_photos_primary_insert" ON storage.objects;
DROP POLICY IF EXISTS "therapy_photos_primary_update" ON storage.objects;
DROP POLICY IF EXISTS "therapy_photos_primary_delete" ON storage.objects;

-- =============================================================
-- Policy RLS su storage.objects (RLS è già abilitata di default da
-- Supabase su questa tabella: non serve ALTER TABLE ... ENABLE RLS).
-- =============================================================
DROP POLICY IF EXISTS "therapy-photos: read if linked" ON storage.objects;
CREATE POLICY "therapy-photos: read if linked" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'therapy-photos'
    AND public.can_access_therapy_photo(name)
  );

DROP POLICY IF EXISTS "therapy-photos: insert if primary" ON storage.objects;
CREATE POLICY "therapy-photos: insert if primary" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'therapy-photos'
    AND public.can_manage_therapy_photo(name)
  );

DROP POLICY IF EXISTS "therapy-photos: update if primary" ON storage.objects;
CREATE POLICY "therapy-photos: update if primary" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'therapy-photos'
    AND public.can_manage_therapy_photo(name)
  )
  WITH CHECK (
    bucket_id = 'therapy-photos'
    AND public.can_manage_therapy_photo(name)
  );

DROP POLICY IF EXISTS "therapy-photos: delete if primary" ON storage.objects;
CREATE POLICY "therapy-photos: delete if primary" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'therapy-photos'
    AND public.can_manage_therapy_photo(name)
  );

-- =============================================================
-- Verifica post-applicazione (eseguire come utenti di test diversi,
-- vedi compliance/storage-privacy-migration.md §5 per il test completo):
--   1. Un utente A senza relazioni NON deve poter fare list()/download()
--      di nessun oggetto in therapy-photos di un paziente B.
--   2. Un caregiver secondario collegato a un paziente DEVE poter
--      visualizzare (SELECT) le foto ma NON caricarne di nuove (INSERT)
--      né sostituirle/eliminarle — solo il caregiver primario può farlo.
--   3. L'upload di una foto per una terapia NUOVA (riga `therapies` non
--      ancora inserita) deve continuare a funzionare per il caregiver
--      primario del paziente.
-- =============================================================