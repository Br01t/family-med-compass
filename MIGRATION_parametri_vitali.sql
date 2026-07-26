-- =====================================================================
-- FamilyMed — Monitoraggio Parametri Vitali
-- Crea la tabella `vital_signs` per tracciare pressione arteriosa,
-- glicemia, peso e saturazione, con RLS coerente al resto del progetto
-- (accesso per paziente proprietario, primary/secondary caregiver via
-- caregiver_patients, scrittura ampia, delete riservata al primary o
-- all'autore della misurazione).
--
-- Esegui questo file una sola volta sul tuo DB Supabase.
-- =====================================================================

-- 1) TABELLA -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vital_signs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    text NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('blood_pressure','glycemia','weight','saturation')),
  -- valore principale numerico (peso in kg, glicemia in mg/dL, saturazione in %,
  -- per la pressione: sistolica)
  value_primary   numeric(6,2),
  -- valore secondario (solo pressione: diastolica)
  value_secondary numeric(6,2),
  -- battito cardiaco opzionale (bpm) — utile con pressione o saturazione
  pulse           integer,
  unit            text,
  measured_at     timestamptz NOT NULL DEFAULT now(),
  notes           text,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vital_signs_bp_check CHECK (
    kind <> 'blood_pressure' OR (value_primary IS NOT NULL AND value_secondary IS NOT NULL)
  ),
  CONSTRAINT vital_signs_value_check CHECK (value_primary IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS vital_signs_patient_measured_idx
  ON public.vital_signs (patient_id, measured_at DESC);
CREATE INDEX IF NOT EXISTS vital_signs_patient_kind_measured_idx
  ON public.vital_signs (patient_id, kind, measured_at DESC);

-- 2) GRANT --------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vital_signs TO authenticated;
GRANT ALL ON public.vital_signs TO service_role;

-- 3) RLS ----------------------------------------------------------------
ALTER TABLE public.vital_signs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vital_signs: read linked"     ON public.vital_signs;
DROP POLICY IF EXISTS "vital_signs: insert linked"   ON public.vital_signs;
DROP POLICY IF EXISTS "vital_signs: update linked"   ON public.vital_signs;
DROP POLICY IF EXISTS "vital_signs: delete primary"  ON public.vital_signs;

-- SELECT: paziente, owner, primary caregiver, o caregiver collegato
CREATE POLICY "vital_signs: read linked"
  ON public.vital_signs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = vital_signs.patient_id
        AND (
          p.user_id = auth.uid()
          OR p.owner_user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.caregiver_patients cp
            WHERE cp.patient_id = p.id AND cp.caregiver_id = auth.uid()
          )
        )
    )
  );

-- INSERT: qualsiasi utente legato al paziente può registrare misurazioni
CREATE POLICY "vital_signs: insert linked"
  ON public.vital_signs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = vital_signs.patient_id
        AND (
          p.user_id = auth.uid()
          OR p.owner_user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.caregiver_patients cp
            WHERE cp.patient_id = p.id AND cp.caregiver_id = auth.uid()
          )
        )
    )
  );

-- UPDATE: primary caregiver o autore della misurazione (o il paziente stesso)
CREATE POLICY "vital_signs: update linked"
  ON public.vital_signs FOR UPDATE
  TO authenticated
  USING (
    public.is_primary_of(patient_id)
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = vital_signs.patient_id AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_primary_of(patient_id)
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = vital_signs.patient_id AND p.user_id = auth.uid()
    )
  );

-- DELETE: solo primary caregiver o autore
CREATE POLICY "vital_signs: delete primary"
  ON public.vital_signs FOR DELETE
  TO authenticated
  USING (
    public.is_primary_of(patient_id)
    OR created_by = auth.uid()
  );

-- 4) TRIGGER updated_at -------------------------------------------------
CREATE OR REPLACE FUNCTION public.vital_signs_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vital_signs_updated_at ON public.vital_signs;
CREATE TRIGGER trg_vital_signs_updated_at
  BEFORE UPDATE ON public.vital_signs
  FOR EACH ROW EXECUTE FUNCTION public.vital_signs_touch_updated_at();

-- FINE ------------------------------------------------------------------
