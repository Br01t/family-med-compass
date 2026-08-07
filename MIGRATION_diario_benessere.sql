-- =====================================================================
-- FamilyMed — Diario del Benessere e Note Sintomi
-- Crea la tabella `wellness_notes` per annotare umore, sintomi ed eventi
-- saltuari ("stamattina era confuso", "nausea dopo la pillola delle 14").
-- Le note possono essere correlate a una terapia e/o a una dose specifica
-- per capire se un farmaco sta dando effetti collaterali.
--
-- RLS coerente con `vital_signs`: lettura/scrittura per paziente, owner e
-- caregiver collegati; delete riservata al primary caregiver, all'owner,
-- al paziente stesso o all'autore della nota.
--
-- Esegui questo file UNA SOLA VOLTA sul tuo DB Supabase.
-- =====================================================================

-- 1) TABELLA -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wellness_notes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   text NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  -- umore 1..5 (1 = molto male, 5 = molto bene). Opzionale.
  mood         smallint CHECK (mood IS NULL OR (mood BETWEEN 1 AND 5)),
  -- sintomi selezionati (slug: 'nausea','confusione','dolore', ...)
  symptoms     text[] NOT NULL DEFAULT '{}',
  -- gravità percepita: 'lieve' | 'moderata' | 'severa' (opzionale)
  severity     text CHECK (severity IS NULL OR severity IN ('lieve','moderata','severa')),
  note         text,
  -- correlazione opzionale con una terapia e/o una dose specifica
  therapy_id   text REFERENCES public.therapies(id) ON DELETE SET NULL,
  event_id     text REFERENCES public.events(id) ON DELETE SET NULL,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  -- una nota vuota non ha senso: serve almeno umore, sintomi o testo
  CONSTRAINT wellness_notes_not_empty CHECK (
    mood IS NOT NULL
    OR array_length(symptoms, 1) IS NOT NULL
    OR (note IS NOT NULL AND length(btrim(note)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS wellness_notes_patient_occurred_idx
  ON public.wellness_notes (patient_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS wellness_notes_therapy_idx
  ON public.wellness_notes (therapy_id, occurred_at DESC)
  WHERE therapy_id IS NOT NULL;

-- 2) GRANT --------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wellness_notes TO authenticated;
GRANT ALL ON public.wellness_notes TO service_role;

-- 3) RLS ----------------------------------------------------------------
ALTER TABLE public.wellness_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wellness_notes: read linked"   ON public.wellness_notes;
DROP POLICY IF EXISTS "wellness_notes: insert linked" ON public.wellness_notes;
DROP POLICY IF EXISTS "wellness_notes: update author" ON public.wellness_notes;
DROP POLICY IF EXISTS "wellness_notes: delete author" ON public.wellness_notes;

-- SELECT: paziente, owner, primary caregiver o caregiver collegato
CREATE POLICY "wellness_notes: read linked"
  ON public.wellness_notes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = wellness_notes.patient_id
        AND (
          p.user_id = auth.uid()
          OR p.owner_user_id = auth.uid()
          OR p.primary_caregiver_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.caregiver_patients cp
            WHERE cp.patient_id = p.id AND cp.caregiver_id = auth.uid()
          )
        )
    )
  );

-- INSERT: chiunque sia legato al paziente può annotare
CREATE POLICY "wellness_notes: insert linked"
  ON public.wellness_notes FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = wellness_notes.patient_id
        AND (
          p.user_id = auth.uid()
          OR p.owner_user_id = auth.uid()
          OR p.primary_caregiver_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.caregiver_patients cp
            WHERE cp.patient_id = p.id AND cp.caregiver_id = auth.uid()
          )
        )
    )
  );

-- UPDATE: solo l'autore della nota (o il primary/owner/paziente)
CREATE POLICY "wellness_notes: update author"
  ON public.wellness_notes FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = wellness_notes.patient_id
        AND (p.user_id = auth.uid() OR p.owner_user_id = auth.uid() OR p.primary_caregiver_id = auth.uid())
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = wellness_notes.patient_id
        AND (p.user_id = auth.uid() OR p.owner_user_id = auth.uid() OR p.primary_caregiver_id = auth.uid())
    )
  );

-- DELETE: autore, paziente, owner o primary caregiver
CREATE POLICY "wellness_notes: delete author"
  ON public.wellness_notes FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = wellness_notes.patient_id
        AND (p.user_id = auth.uid() OR p.owner_user_id = auth.uid() OR p.primary_caregiver_id = auth.uid())
    )
  );

-- 4) updated_at ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wellness_notes_set_updated_at ON public.wellness_notes;
CREATE TRIGGER wellness_notes_set_updated_at
  BEFORE UPDATE ON public.wellness_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5) CORRELAZIONE FARMACO ↔ SINTOMI (RPC, calcolata lato DB) -------------
-- Restituisce, per ogni terapia del paziente, quante note-sintomo sono
-- state registrate entro `_window_hours` ore DOPO una dose assunta.
-- Una sola chiamata invece di scaricare tutto lo storico: egress minimo.
CREATE OR REPLACE FUNCTION public.wellness_symptom_correlation(
  _patient_id text,
  _days integer DEFAULT 30,
  _window_hours integer DEFAULT 6
)
RETURNS TABLE (
  therapy_id     text,
  therapy_name   text,
  doses_taken    bigint,
  notes_after    bigint,
  top_symptoms   text[]
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH taken AS (
    SELECT e.id, e.therapy_id, COALESCE(e.confirmed_at, e.scheduled_at) AS at
    FROM public.events e
    WHERE e.patient_id = _patient_id
      AND e.status = 'taken'
      AND COALESCE(e.confirmed_at, e.scheduled_at) >= now() - make_interval(days => _days)
  ),
  notes AS (
    SELECT w.id, w.occurred_at, w.symptoms, w.therapy_id
    FROM public.wellness_notes w
    WHERE w.patient_id = _patient_id
      AND w.occurred_at >= now() - make_interval(days => _days)
  ),
  matched AS (
    SELECT t.therapy_id, n.symptoms
    FROM taken t
    JOIN notes n
      ON n.occurred_at >= t.at
     AND n.occurred_at <= t.at + make_interval(hours => _window_hours)
     AND (n.therapy_id IS NULL OR n.therapy_id = t.therapy_id)
  )
  SELECT
    th.id,
    th.name,
    (SELECT count(*) FROM taken t WHERE t.therapy_id = th.id),
    (SELECT count(*) FROM matched m WHERE m.therapy_id = th.id),
    COALESCE((
      SELECT array_agg(s ORDER BY c DESC)
      FROM (
        SELECT unnest(m.symptoms) AS s, count(*) AS c
        FROM matched m
        WHERE m.therapy_id = th.id
        GROUP BY 1
        ORDER BY 2 DESC
        LIMIT 5
      ) q
    ), '{}')
  FROM public.therapies th
  WHERE th.patient_id = _patient_id
  ORDER BY 4 DESC, 2;
$$;

GRANT EXECUTE ON FUNCTION public.wellness_symptom_correlation(text, integer, integer) TO authenticated;

-- 6) RETENTION (facoltativo, coerente con le altre tabelle) --------------
-- Le note sono dati sanitari: le conserviamo 24 mesi.
-- Se usi pg_cron:
-- SELECT cron.schedule('wellness_notes_cleanup', '30 3 * * *',
--   $$DELETE FROM public.wellness_notes WHERE occurred_at < now() - interval '24 months'$$);
