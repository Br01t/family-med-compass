
-- Materialized view: statistiche aggregate per caregiver
DROP MATERIALIZED VIEW IF EXISTS public.caregiver_dashboard_stats CASCADE;

CREATE MATERIALIZED VIEW public.caregiver_dashboard_stats AS
WITH cg AS (
  SELECT DISTINCT caregiver_id FROM public.caregiver_patients
),
patient_counts AS (
  SELECT caregiver_id, COUNT(DISTINCT patient_id)::int AS patients_count
  FROM public.caregiver_patients
  GROUP BY caregiver_id
),
alerts AS (
  SELECT cp.caregiver_id, COUNT(*)::int AS active_alerts
  FROM public.caregiver_patients cp
  JOIN public.events e ON e.patient_id = cp.patient_id
  WHERE e.status IN ('missed','skipped')
    AND (e.note IS NULL OR e.note NOT LIKE '%caregiver_ack%')
  GROUP BY cp.caregiver_id
),
low_stock AS (
  SELECT cp.caregiver_id,
         COUNT(*)::int AS low_stock_count,
         COALESCE(ARRAY_AGG(t.name ORDER BY t.name), ARRAY[]::text[]) AS low_stock_names
  FROM public.caregiver_patients cp
  JOIN public.therapies t ON t.patient_id = cp.patient_id
  WHERE t.pills_remaining <= COALESCE(t.low_stock_threshold, 10)
    AND COALESCE(t.active, true) = true
    AND COALESCE(t.suspended, false) = false
  GROUP BY cp.caregiver_id
),
adherence_7d AS (
  SELECT cp.caregiver_id,
    COUNT(*) FILTER (WHERE e.status = 'taken')::int AS taken,
    COUNT(*) FILTER (WHERE e.status IN ('taken','missed','skipped'))::int AS total
  FROM public.caregiver_patients cp
  JOIN public.events e ON e.patient_id = cp.patient_id
  WHERE e.scheduled_at >= now() - interval '7 days'
    AND e.scheduled_at <= now()
  GROUP BY cp.caregiver_id
)
SELECT
  cg.caregiver_id,
  COALESCE(pc.patients_count, 0) AS patients_count,
  COALESCE(a.active_alerts, 0) AS active_alerts,
  COALESCE(ls.low_stock_count, 0) AS low_stock_count,
  COALESCE(ls.low_stock_names, ARRAY[]::text[]) AS low_stock_names,
  CASE
    WHEN COALESCE(ad.total, 0) = 0 THEN 100
    ELSE ROUND((ad.taken::numeric / ad.total::numeric) * 100)::int
  END AS adherence_7d,
  now() AS refreshed_at
FROM cg
LEFT JOIN patient_counts pc ON pc.caregiver_id = cg.caregiver_id
LEFT JOIN alerts a ON a.caregiver_id = cg.caregiver_id
LEFT JOIN low_stock ls ON ls.caregiver_id = cg.caregiver_id
LEFT JOIN adherence_7d ad ON ad.caregiver_id = cg.caregiver_id;

CREATE UNIQUE INDEX caregiver_dashboard_stats_pk
  ON public.caregiver_dashboard_stats (caregiver_id);

-- Non concediamo SELECT diretta: gli utenti leggono solo tramite RPC
REVOKE ALL ON public.caregiver_dashboard_stats FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.caregiver_dashboard_stats TO service_role;

-- Funzione che ritorna solo la riga dell'utente corrente
CREATE OR REPLACE FUNCTION public.get_my_caregiver_stats()
RETURNS TABLE (
  patients_count int,
  active_alerts int,
  low_stock_count int,
  low_stock_names text[],
  adherence_7d int,
  refreshed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT patients_count, active_alerts, low_stock_count, low_stock_names, adherence_7d, refreshed_at
  FROM public.caregiver_dashboard_stats
  WHERE caregiver_id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.get_my_caregiver_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_caregiver_stats() TO authenticated;

-- Funzione di refresh (concurrent per non bloccare le letture)
CREATE OR REPLACE FUNCTION public.refresh_caregiver_dashboard_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.caregiver_dashboard_stats;
EXCEPTION WHEN OTHERS THEN
  REFRESH MATERIALIZED VIEW public.caregiver_dashboard_stats;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_caregiver_dashboard_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_caregiver_dashboard_stats() TO service_role;

-- Refresh iniziale
SELECT public.refresh_caregiver_dashboard_stats();

-- Indice per la paginazione notifiche (idempotente)
CREATE INDEX IF NOT EXISTS notifications_target_created_idx
  ON public.notifications (target_user_id, created_at DESC);
