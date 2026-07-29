-- ============================================================
-- MIGRATION: patient_medical_profiles
-- Scheda anagrafica e clinica di emergenza per paziente.
-- Visibile a tutti i caregiver collegati (SELECT),
-- modificabile solo dal caregiver primario (INSERT/UPDATE/DELETE).
-- Ottimizzazione: una sola riga per paziente (PK = patient_id),
-- zero canale Realtime, fetch one-shot con cache lato client.
-- ============================================================

-- 1. Tabella
CREATE TABLE IF NOT EXISTS public.patient_medical_profiles (
  patient_id        text        PRIMARY KEY REFERENCES public.patients(id) ON DELETE CASCADE,
  blood_type        text        CHECK (blood_type IN ('A+','A-','B+','B-','AB+','AB-','0+','0-') OR blood_type IS NULL),
  -- Array di allergie/intolleranze farmacologiche; NULL / empty = nessuna allergia nota
  allergies         text[]      DEFAULT '{}',
  -- Testo libero per patologie e note diagnostiche; NULL = nessuna patologia registrata
  diagnoses         text,
  -- Contatti di emergenza: [{name, role, phone}]
  emergency_contacts jsonb      NOT NULL DEFAULT '[]'::jsonb,
  -- Note aggiuntive libere
  notes             text,
  -- Audit trail
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 2. Indice esplicativo (il PK è già un indice, ma lo documentiamo)
COMMENT ON TABLE public.patient_medical_profiles IS
  'Scheda clinica di emergenza: una riga per paziente. Dati sensibili GDPR.';

COMMENT ON COLUMN public.patient_medical_profiles.allergies IS
  'Array di allergie/intolleranze farmacologiche. Array vuoto = nessuna allergia nota.';

COMMENT ON COLUMN public.patient_medical_profiles.diagnoses IS
  'Riepilogo patologie e note diagnostiche. NULL o stringa vuota = nessuna patologia registrata.';

COMMENT ON COLUMN public.patient_medical_profiles.emergency_contacts IS
  'Array JSON di contatti emergenza: [{name: string, role: string, phone: string}]';

-- 3. Trigger aggiornamento automatico di updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_medical_profile_updated_at ON public.patient_medical_profiles;
CREATE TRIGGER trg_medical_profile_updated_at
  BEFORE UPDATE ON public.patient_medical_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Abilita RLS
ALTER TABLE public.patient_medical_profiles ENABLE ROW LEVEL SECURITY;

-- 5. SELECT: tutti i caregiver collegati al paziente (e il paziente stesso)
CREATE POLICY "medical_profile: read linked"
  ON public.patient_medical_profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = patient_medical_profiles.patient_id
        AND (
          -- Il paziente stesso
          p.user_id = auth.uid()
          -- Owner del paziente
          OR p.owner_user_id = auth.uid()
          -- Qualunque caregiver collegato
          OR EXISTS (
            SELECT 1 FROM public.caregiver_patients cp
            WHERE cp.patient_id = p.id AND cp.caregiver_id = auth.uid()
          )
        )
    )
  );

-- 6. INSERT: solo caregiver primario
CREATE POLICY "medical_profile: insert primary"
  ON public.patient_medical_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_primary_of(patient_id));

-- 7. UPDATE: solo caregiver primario
CREATE POLICY "medical_profile: update primary"
  ON public.patient_medical_profiles
  FOR UPDATE
  TO authenticated
  USING (public.is_primary_of(patient_id))
  WITH CHECK (public.is_primary_of(patient_id));

-- 8. DELETE: solo caregiver primario
CREATE POLICY "medical_profile: delete primary"
  ON public.patient_medical_profiles
  FOR DELETE
  TO authenticated
  USING (public.is_primary_of(patient_id));
