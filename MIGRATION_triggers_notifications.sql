-- FamilyMed — trigger notifiche azioni dose (idempotente)
-- Da eseguire una volta nel SQL editor del tuo Supabase esterno.

-- A) Trigger su "taken" (usa la funzione handle_dose_taken già esistente)
DROP TRIGGER IF EXISTS trg_dose_taken ON public.events;
CREATE TRIGGER trg_dose_taken
AFTER UPDATE OF status ON public.events
FOR EACH ROW
WHEN (NEW.status = 'taken' AND (OLD.status IS DISTINCT FROM 'taken'))
EXECUTE FUNCTION public.handle_dose_taken();

-- B) Nuova funzione: notifica caregiver + paziente su snoozed / skipped / missed
CREATE OR REPLACE FUNCTION public.handle_dose_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_therapy public.therapies%rowtype;
  v_patient public.patients%rowtype;
  v_caregiver uuid;
  v_kind text; v_sev text; v_title text; v_msg text;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('snoozed','skipped','missed') THEN RETURN NEW; END IF;

  SELECT * INTO v_therapy FROM public.therapies WHERE id = NEW.therapy_id;
  SELECT * INTO v_patient FROM public.patients  WHERE id = NEW.patient_id;

  IF NEW.status = 'snoozed' THEN
    v_kind := 'snoozed'; v_sev := 'warning';
    v_title := v_patient.name || ' ha rimandato ' || v_therapy.name;
    v_msg   := 'Dose delle ' || to_char(NEW.scheduled_at AT TIME ZONE 'Europe/Rome','HH24:MI') || ' rimandata.';
  ELSIF NEW.status = 'skipped' THEN
    v_kind := 'skipped'; v_sev := 'alert';
    v_title := v_patient.name || ' ha saltato ' || v_therapy.name;
    v_msg   := 'Dose delle ' || to_char(NEW.scheduled_at AT TIME ZONE 'Europe/Rome','HH24:MI') || ' rifiutata.';
  ELSE
    v_kind := 'missed'; v_sev := 'alert';
    v_title := v_patient.name || ' non ha preso ' || v_therapy.name;
    v_msg   := 'Dose delle ' || to_char(NEW.scheduled_at AT TIME ZONE 'Europe/Rome','HH24:MI') || ' dimenticata.';
  END IF;

  FOR v_caregiver IN
    SELECT caregiver_id FROM public.caregiver_patients WHERE patient_id = NEW.patient_id
  LOOP
    INSERT INTO public.notifications
      (target_user_id, kind, severity, title, message, patient_id, therapy_id, event_id, dose_key)
    VALUES
      (v_caregiver, v_kind, v_sev, v_title, v_msg,
       NEW.patient_id, NEW.therapy_id, NEW.id,
       NEW.therapy_id || '@' || NEW.scheduled_at::text || '@' || v_kind || '@cg@' || v_caregiver)
    ON CONFLICT DO NOTHING;
  END LOOP;

  IF NEW.status IN ('skipped','missed') AND v_patient.user_id IS NOT NULL THEN
    INSERT INTO public.notifications
      (target_user_id, kind, severity, title, message, patient_id, therapy_id, event_id, dose_key)
    VALUES
      (v_patient.user_id, v_kind, v_sev,
       CASE WHEN NEW.status='missed' THEN 'Cura dimenticata: '||v_therapy.name
            ELSE 'Hai saltato '||v_therapy.name END,
       'Dose delle ' || to_char(NEW.scheduled_at AT TIME ZONE 'Europe/Rome','HH24:MI'),
       NEW.patient_id, NEW.therapy_id, NEW.id,
       NEW.therapy_id || '@' || NEW.scheduled_at::text || '@' || v_kind || '@patient')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dose_status_change ON public.events;
CREATE TRIGGER trg_dose_status_change
AFTER UPDATE OF status ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.handle_dose_status_change();

-- C) Vincolo di deduplica per ON CONFLICT su (target_user_id, dose_key)
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dose_key_target_uniq
  ON public.notifications (target_user_id, dose_key)
  WHERE dose_key IS NOT NULL;

-- D) (Opzionale) Ricrea il cron ogni minuto per lo scheduler
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- CREATE EXTENSION IF NOT EXISTS pg_net;
-- SELECT cron.unschedule('dose-scheduler-every-minute')
-- WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='dose-scheduler-every-minute');
-- SELECT cron.schedule(
--   'dose-scheduler-every-minute', '* * * * *',
--   $$ SELECT net.http_post(
--        url := 'https://<PROJECT_REF>.functions.supabase.co/dose-scheduler',
--        headers := '{"Content-Type":"application/json","Authorization":"Bearer <TUO_SUPABASE_ANON_KEY>"}'::jsonb,
--        body := '{}'::jsonb
--      ); $$
-- );
