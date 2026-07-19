-- =====================================================================
-- MIGRATION: riduzione egress + refresh manuale statistiche
-- Da lanciare nell'SQL Editor del TUO Supabase.
-- Idempotente.
-- =====================================================================

-- 1) Realtime: teniamolo SOLO dove serve davvero -----------------------
--    - events         → serve (allarmi paziente, azioni paziente per caregiver)
--    - notifications  → serve (centro notifiche live)
--    - therapies, patients → NON servono realtime: cambiano raramente e
--      vengono ricaricate al mount / navigazione. Le rimuoviamo dalla
--      publication per ridurre l'egress.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname='public' AND tablename='therapies'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.therapies';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname='public' AND tablename='patients'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.patients';
  END IF;
END $$;

-- 2) Cron: statistiche ricalcolate una volta al giorno alle 03:15 ------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
      FROM cron.job
     WHERE jobname IN (
       'refresh-caregiver-dashboard-stats',
       'refresh-caregiver-dashboard-stats-5m',
       'refresh-caregiver-dashboard-stats-30m'
     );

    PERFORM cron.schedule(
      'refresh-caregiver-dashboard-stats-daily',
      '15 3 * * *',   -- ogni giorno alle 03:15 (server time)
      $CRON$ SELECT public.refresh_caregiver_dashboard_stats(); $CRON$
    );
  END IF;
END $$;

-- 3) Refresh manuale on-demand esposto al caregiver --------------------
--    Chiamabile da UI quando l'utente clicca "Aggiorna".
CREATE OR REPLACE FUNCTION public.refresh_my_caregiver_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Solo caregiver possono farlo (evita abusi)
  IF NOT public.has_role(auth.uid(), 'caregiver') THEN
    RAISE EXCEPTION 'Solo un caregiver può aggiornare le statistiche'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.refresh_caregiver_dashboard_stats();
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_my_caregiver_stats() FROM public;
GRANT EXECUTE ON FUNCTION public.refresh_my_caregiver_stats() TO authenticated;

-- 4) Refresh immediato una volta ora, così i dati sono già pronti ------
SELECT public.refresh_caregiver_dashboard_stats();
