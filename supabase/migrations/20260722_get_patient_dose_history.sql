-- =========================================================
-- get_patient_dose_history: aggregazione lato DB per lo storico
-- (pagina "Storico & Report", periodi 30/90 giorni).
--
-- Perché: la fetch dedicata attuale (fetchEventsForPatientRange in
-- supabase-service.ts) scarica comunque tutte le righe grezze di
-- `events` per il paziente selezionato sull'intero periodo. Per un
-- paziente con più terapie giornaliere, 90 giorni possono significare
-- centinaia di righe scaricate solo per calcolare percentuali e conteggi.
-- Questa RPC calcola l'aggregazione (conteggi per giorno + per terapia)
-- direttamente nel DB e ritorna un singolo oggetto JSON compatto:
-- niente più righe grezze sul filo per lo storico esteso.
--
-- Nota: gli eventi in questa tabella sono già "dosi materializzate"
-- (create in anticipo da dose-scheduler in base alla ricorrenza), quindi
-- aggregare per data/terapia qui è equivalente al calcolo che il client
-- fa oggi via getDosesForPatientOnDate — non serve reimplementare la
-- logica di ricorrenza in SQL.
--
-- Integrazione lato frontend (non ancora fatta in questo passaggio):
-- sostituire la chiamata a fetchEventsForPatientRange in
-- storico-report.tsx con una chiamata a supabase.rpc('get_patient_dose_history',
-- { p_patient_id, p_days }) e consumare bars/perTherapy/totals già
-- aggregati invece di ricalcolarli client-side con getDosesForPatientOnDate.
-- È un refactor più ampio di quello già applicato (che si limita a
-- restringere la finestra e scoparla al singolo paziente); questa
-- migration è pronta ma opzionale, da applicare quando si vuole fare
-- anche quel passo.
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_patient_dose_history(
  p_patient_id text,
  p_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since timestamptz := now() - (GREATEST(p_days, 1) || ' days')::interval;
  v_result jsonb;
BEGIN
  -- Stessa regola di visibilità delle altre RPC/RLS dell'app: solo il
  -- paziente stesso o un caregiver collegato può leggere lo storico.
  IF NOT EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = p_patient_id
      AND (
        p.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.caregiver_patients cp
          WHERE cp.patient_id = p.id AND cp.caregiver_id = auth.uid()
        )
      )
  ) THEN
    RAISE EXCEPTION 'not authorized for this patient';
  END IF;

  WITH ev AS (
    SELECT
      e.id,
      e.therapy_id,
      e.status,
      e.scheduled_at,
      e.confirmed_at,
      t.name AS therapy_name,
      COALESCE(t.timeout_minutes, 10) AS timeout_minutes
    FROM public.events e
    JOIN public.therapies t ON t.id = e.therapy_id
    WHERE e.patient_id = p_patient_id
      AND e.scheduled_at >= v_since
      AND e.scheduled_at <= now()
  ),
  -- "In ritardo": presa ma confermata oltre il timeout, oppure già
  -- segnata "missed"/"late" a monte — stessa regola di wasTakenLate()
  -- nel client (src/lib/therapy.ts).
  ev_flagged AS (
    SELECT
      *,
      (status = 'skipped') AS is_skipped,
      (status = 'taken') AS is_taken,
      (
        status = 'late'
        OR (
          status = 'taken'
          AND confirmed_at IS NOT NULL
          AND EXTRACT(EPOCH FROM (confirmed_at - scheduled_at)) / 60 >= timeout_minutes
        )
      ) AS is_late
    FROM ev
  ),
  per_day AS (
    SELECT
      (scheduled_at AT TIME ZONE 'Europe/Rome')::date AS day,
      count(*)::int AS scheduled,
      count(*) FILTER (WHERE is_taken)::int AS taken
    FROM ev_flagged
    GROUP BY 1
  ),
  per_therapy AS (
    SELECT
      therapy_id,
      therapy_name,
      count(*)::int AS scheduled,
      count(*) FILTER (WHERE is_taken)::int AS taken,
      count(*) FILTER (WHERE is_late)::int AS late,
      count(*) FILTER (WHERE is_skipped)::int AS skipped
    FROM ev_flagged
    GROUP BY therapy_id, therapy_name
  ),
  totals AS (
    SELECT
      count(*)::int AS scheduled,
      count(*) FILTER (WHERE is_taken)::int AS taken,
      count(*) FILTER (WHERE is_late)::int AS late,
      count(*) FILTER (WHERE is_skipped)::int AS skipped,
      COALESCE(ROUND(
        AVG(EXTRACT(EPOCH FROM (confirmed_at - scheduled_at)) / 60)
          FILTER (WHERE is_taken AND confirmed_at IS NOT NULL AND confirmed_at >= scheduled_at)
      ), 0)::int AS avg_delay
    FROM ev_flagged
  )
  SELECT jsonb_build_object(
    'bars', COALESCE(
      (SELECT jsonb_agg(
         jsonb_build_object('date', day, 'scheduled', scheduled, 'taken', taken)
         ORDER BY day
       ) FROM per_day),
      '[]'::jsonb
    ),
    'perTherapy', COALESCE(
      (SELECT jsonb_agg(
         jsonb_build_object(
           'therapyId', therapy_id,
           'name', therapy_name,
           'scheduled', scheduled,
           'taken', taken,
           'late', late,
           'skipped', skipped
         )
         ORDER BY scheduled DESC
       ) FROM per_therapy),
      '[]'::jsonb
    ),
    'totals', (
      SELECT jsonb_build_object(
        'scheduled', scheduled,
        'taken', taken,
        'late', late,
        'skipped', skipped,
        'avgDelay', avg_delay
      ) FROM totals
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_patient_dose_history(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_patient_dose_history(text, integer) TO authenticated;