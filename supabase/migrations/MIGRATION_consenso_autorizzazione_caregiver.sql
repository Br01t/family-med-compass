-- =====================================================================
-- MIGRATION: dichiarazione di autorizzazione del caregiver (punto 4 audit)
-- Da lanciare nell'SQL Editor Supabase DOPO MIGRATION_consensi_gdpr.sql.
-- Idempotente.
--
-- Quando un caregiver aggiunge un paziente che non gestisce il proprio
-- account (caso tipico: figlio che gestisce le terapie di un genitore
-- anziano), deve dichiarare esplicitamente di essere autorizzato a
-- inserire e trattare i dati sanitari di quella persona. Questa
-- dichiarazione viene tracciata allo stesso modo del consenso di
-- registrazione (art. 7.1 GDPR — accountability), ma è legata al
-- singolo paziente, non solo all'utente.
-- =====================================================================

-- 1. Aggiungi la colonna patient_id (nullable: i consensi 'terms_privacy'
--    e 'health_data' esistenti restano legati solo all'utente, non a un
--    paziente specifico).
-- NB: patients.id è di tipo text (non uuid) nello schema di questo
-- progetto — i patient id sono generati lato client come `p_<uuid>`.
ALTER TABLE public.user_consents
  ADD COLUMN IF NOT EXISTS patient_id text REFERENCES public.patients(id) ON DELETE CASCADE;

-- 2. Estendi il CHECK sul kind per includere il nuovo tipo di consenso.
ALTER TABLE public.user_consents DROP CONSTRAINT IF EXISTS user_consents_kind_check;
ALTER TABLE public.user_consents
  ADD CONSTRAINT user_consents_kind_check
  CHECK (kind IN ('terms_privacy', 'health_data', 'caregiver_authorization'));

-- 3. Vincolo di coerenza: la dichiarazione di autorizzazione DEVE essere
--    legata a un paziente; gli altri due tipi restano a livello utente.
ALTER TABLE public.user_consents DROP CONSTRAINT IF EXISTS user_consents_patient_id_required;
ALTER TABLE public.user_consents
  ADD CONSTRAINT user_consents_patient_id_required
  CHECK (
    (kind = 'caregiver_authorization' AND patient_id IS NOT NULL)
    OR (kind <> 'caregiver_authorization')
  );

CREATE INDEX IF NOT EXISTS user_consents_patient_idx
  ON public.user_consents (patient_id, kind)
  WHERE patient_id IS NOT NULL;

COMMENT ON COLUMN public.user_consents.patient_id IS
  'Valorizzato solo per kind=''caregiver_authorization'': collega la dichiarazione '
  'di autorizzazione al paziente specifico per cui il caregiver dichiara di avere titolo.';

-- La policy di INSERT esistente ("user inserts own consents", WITH CHECK
-- user_id = auth.uid()) copre già anche questo nuovo kind: chi dichiara
-- deve essere l'utente autenticato che sta effettuando l'operazione.
-- Non serve una policy separata.

DO $$
BEGIN
  RAISE NOTICE 'MIGRATION_consenso_autorizzazione_caregiver.sql completata.';
END $$;