-- =====================================================================
-- MIGRATION: caregiver dashboard stats (materialized view) + indici
-- Da lanciare nell'SQL Editor del TUO Supabase.
-- Idempotente: puoi rilanciarla senza rompere nulla.
-- =====================================================================

-- 1) Materialized view aggregata per caregiver ------------------------
DROP MATERIALIZED VIEW IF EXISTS public.caregiver_dashboard_stats CASCADE;

CREATE MATERIALIZED VIEW public.caregiver_dashboard_stats AS
WITH cg AS (
  SELECT DISTINCT caregiver_id FROM public.caregiver_patients
),
pats AS (
  SELECT cp.caregiver_id, cp.patient_id
  FROM public.caregiver_patients cp
),
alerts AS (
  -- dosi missed/skipped non ancora "acknowledged" dal caregiver
  -- (il tag di ack è memorizzato dentro events.notes come CG_ACK)
  SELECT p.caregiver_id, count(*)::int AS active_alerts
  FROM pats p
  JOIN public.events e ON e.patient_id = p.patient_id
  WHERE e.status IN ('missed','skipped')
    AND COALESCE(e.notes,'') NOT LIKE '%CG_ACK%'
  GROUP BY p.caregiver_id
),
low_stock AS (
  SELECT p.caregiver_id,
         count(*)::int AS low_stock_count,
         array_agg(t.name ORDER BY t.name) AS low_stock_names
  FROM pats p
  JOIN public.therapies t ON t.patient_id = p.patient_id
  WHERE t.pills_remaining <= COALESCE(t.low_stock_threshold, 10)
  GROUP BY p.caregiver_id
),
adh AS (
  SELECT p.caregiver_id,
         CASE WHEN count(*) = 0 THEN 100
              ELSE round(100.0 * sum(CASE WHEN e.status='taken' THEN 1 ELSE 0 END) / count(*))::int
         END AS adherence_7d
  FROM pats p
  JOIN public.events e ON e.patient_id = p.patient_id
  WHERE e.scheduled_at >= now() - interval '7 days'
    AND e.scheduled_at <= now()
  GROUP BY p.caregiver_id
),
pcount AS (
  SELECT caregiver_id, count(*)::int AS patients_count
  FROM pats GROUP BY caregiver_id
)
SELECT
  cg.caregiver_id,
  COALESCE(pcount.patients_count, 0)                   AS patients_count,
  COALESCE(alerts.active_alerts, 0)                    AS active_alerts,
  COALESCE(low_stock.low_stock_count, 0)               AS low_stock_count,
  COALESCE(low_stock.low_stock_names, ARRAY[]::text[]) AS low_stock_names,
  COALESCE(adh.adherence_7d, 100)                      AS adherence_7d,
  now()                                                AS refreshed_at
FROM cg
LEFT JOIN pcount    ON pcount.caregiver_id    = cg.caregiver_id
LEFT JOIN alerts    ON alerts.caregiver_id    = cg.caregiver_id
LEFT JOIN low_stock ON low_stock.caregiver_id = cg.caregiver_id
LEFT JOIN adh       ON adh.caregiver_id       = cg.caregiver_id;

CREATE UNIQUE INDEX IF NOT EXISTS caregiver_dashboard_stats_pk
  ON public.caregiver_dashboard_stats (caregiver_id);

-- La MV non ha bisogno di RLS: l'accesso passa SOLO dalla RPC sotto.
REVOKE ALL ON public.caregiver_dashboard_stats FROM anon, authenticated;
GRANT SELECT ON public.caregiver_dashboard_stats TO service_role;

-- 2) RPC che espone SOLO la riga dell'utente corrente ------------------
CREATE OR REPLACE FUNCTION public.get_my_caregiver_stats()
RETURNS TABLE (
  patients_count   int,
  active_alerts    int,
  low_stock_count  int,
  low_stock_names  text[],
  adherence_7d     int,
  refreshed_at     timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT patients_count, active_alerts, low_stock_count,
         low_stock_names, adherence_7d, refreshed_at
  FROM public.caregiver_dashboard_stats
  WHERE caregiver_id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.get_my_caregiver_stats() FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_caregiver_stats() TO authenticated;

-- 3) Funzione di refresh (CONCURRENTLY quando possibile) ---------------
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

REVOKE ALL ON FUNCTION public.refresh_caregiver_dashboard_stats() FROM public;

-- 4) Indice per il centro notifiche (paginazione veloce) ---------------
CREATE INDEX IF NOT EXISTS notifications_target_created_idx
  ON public.notifications (target_user_id, created_at DESC);

-- 5) Cron: rimuove il vecchio job ogni 5 min e ne crea uno ogni 30 min -
--    Richiede l'estensione pg_cron abilitata (Database → Extensions).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
      FROM cron.job
     WHERE jobname IN (
       'refresh-caregiver-dashboard-stats',
       'refresh-caregiver-dashboard-stats-5m'
     );

    PERFORM cron.schedule(
      'refresh-caregiver-dashboard-stats',
      '*/30 * * * *',
      $CRON$ SELECT public.refresh_caregiver_dashboard_stats(); $CRON$
    );
  END IF;
END $$;

-- 6) Primo popolamento immediato --------------------------------------
SELECT public.refresh_caregiver_dashboard_stats();
