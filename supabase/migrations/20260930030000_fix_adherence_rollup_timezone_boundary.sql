-- ============================================================================
-- FIX — rollup_adherence_monthly(): confini del mese allineati a
-- Europe/Rome invece che a UTC
--
-- v_start/v_end usavano make_date(...)::timestamptz, che Postgres
-- interpreta come mezzanotte nel fuso di SESSIONE (UTC). Una dose
-- schedulata per le 00:30 locali del giorno 1 del mese, con lo scheduler
-- ora corretto (migration 20260930020000), viene salvata come
-- 2026-09-30T22:30:00Z (le 00:30 del 1° ottobre in Italia, in ora legale,
-- sono le 22:30 UTC del 30 settembre). Con il confine a mezzanotte UTC,
-- quella dose cadeva PRIMA di v_start e finiva nel rollup di settembre
-- invece che in quello di ottobre: poche ore critiche vicino a ogni
-- cambio mese potevano contare nel mese sbagliato.
--
-- FIX: stesso pattern "interpreta come ora locale Europe/Rome, converti a
-- timestamptz" usato per lo scheduler, applicato qui ai confini del mese.
-- Nessun'altra riga della funzione cambia: il calcolo della percentuale
-- di aderenza era già corretto, serviva solo allineare la finestra alle
-- date che l'utente vede davvero sul calendario (ora italiana).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rollup_adherence_monthly(p_year integer DEFAULT NULL::integer, p_month integer DEFAULT NULL::integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_year integer := COALESCE(p_year, EXTRACT(YEAR FROM (now() - interval '1 month'))::int);
  v_month integer := COALESCE(p_month, EXTRACT(MONTH FROM (now() - interval '1 month'))::int);
  v_start timestamptz := (make_date(v_year, v_month, 1)::timestamp) AT TIME ZONE 'Europe/Rome';
  v_end timestamptz := ((make_date(v_year, v_month, 1) + interval '1 month')::timestamp) AT TIME ZONE 'Europe/Rome';
BEGIN
  INSERT INTO public.adherence_monthly (
    patient_id, therapy_id, therapy_name, year, month,
    doses_scheduled, doses_taken, doses_missed, doses_skipped, adherence_pct, computed_at
  )
  SELECT
    e.patient_id,
    e.therapy_id,
    COALESCE(t.name, 'Terapia eliminata'),
    v_year,
    v_month,
    count(*) FILTER (WHERE e.status IN ('taken', 'missed', 'skipped')) AS doses_scheduled,
    count(*) FILTER (WHERE e.status = 'taken') AS doses_taken,
    count(*) FILTER (WHERE e.status = 'missed') AS doses_missed,
    count(*) FILTER (WHERE e.status = 'skipped') AS doses_skipped,
    CASE
      WHEN count(*) FILTER (WHERE e.status IN ('taken', 'missed', 'skipped')) > 0
        THEN round(
          100.0 * count(*) FILTER (WHERE e.status = 'taken')
          / count(*) FILTER (WHERE e.status IN ('taken', 'missed', 'skipped')),
          2
        )
      ELSE NULL
    END AS adherence_pct,
    now()
  FROM public.events e
  LEFT JOIN public.therapies t ON t.id = e.therapy_id
  WHERE e.scheduled_at >= v_start AND e.scheduled_at < v_end
  GROUP BY e.patient_id, e.therapy_id, t.name
  ON CONFLICT (patient_id, therapy_id, year, month) DO UPDATE SET
    therapy_name = EXCLUDED.therapy_name,
    doses_scheduled = EXCLUDED.doses_scheduled,
    doses_taken = EXCLUDED.doses_taken,
    doses_missed = EXCLUDED.doses_missed,
    doses_skipped = EXCLUDED.doses_skipped,
    adherence_pct = EXCLUDED.adherence_pct,
    computed_at = now();
END;
$$;

-- ============================================================================
-- Verifica dopo l'applicazione:
--   SELECT public.rollup_adherence_monthly(2026, 9);
--   SELECT * FROM public.adherence_monthly WHERE year = 2026 AND month = 9;
-- I numeri non devono essere peggiori/diversi in modo vistoso rispetto a
-- prima: l'effetto reale si vede nei mesi futuri, con lo scheduler corretto.
-- ============================================================================