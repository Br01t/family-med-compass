
-- ============================================================
-- Ottimizzazioni egress + performance
-- Step 2 (cleanup notifiche) + Step 3 (realtime replica identity) + Step 5 (indici)
-- ============================================================

-- Step 5: indici mirati
CREATE INDEX IF NOT EXISTS idx_notifications_target_created
  ON public.notifications(target_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_caregiver_patients_caregiver
  ON public.caregiver_patients(caregiver_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_therapy_created
  ON public.stock_movements(therapy_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_patient_scheduled
  ON public.events(patient_id, scheduled_at DESC);

CREATE INDEX IF NOT EXISTS idx_therapies_patient
  ON public.therapies(patient_id);

CREATE INDEX IF NOT EXISTS idx_events_therapy_scheduled
  ON public.events(therapy_id, scheduled_at DESC);

-- Step 3: REPLICA IDENTITY DEFAULT su tabelle "pesanti"
-- I payload realtime UPDATE non conterranno più le foto base64.
-- Il client, ricevendo l'evento, rilegge la riga con select mirato.
ALTER TABLE public.therapies REPLICA IDENTITY DEFAULT;
ALTER TABLE public.patients  REPLICA IDENTITY DEFAULT;
ALTER TABLE public.events    REPLICA IDENTITY DEFAULT;

-- Step 2: pulizia notifiche > 30 giorni (schedulata giornaliera)
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('notifications-cleanup-daily');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'notifications-cleanup-daily',
  '0 3 * * *',
  $$ DELETE FROM public.notifications WHERE created_at < now() - interval '30 days' $$
);
