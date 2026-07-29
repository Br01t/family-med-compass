-- =====================================================================
-- MIGRATION: Conversione Edge Function dose-scheduler in PL/pgSQL
-- Obiettivo: Azzerare completamente Egress (0 MB) e Invocazioni Edge Function.
--
-- Esegui questo script nel Supabase SQL Editor della tua istanza.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.process_dose_schedule()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_horizon timestamptz := v_now + interval '24 hours';
  v_past timestamptz := v_now - interval '30 minutes';
  v_therapy RECORD;
  v_curr_date date;
  v_start_date date;
  v_end_date date;
  v_dow int;
  v_kind text;
  v_is_scheduled boolean;
  v_time_str text;
  v_at timestamptz;
  v_event_id text;
  v_before int;
  v_diff_min numeric;
  v_post_min int;
  v_elapsed_min numeric;
  v_timeout_min int;
  v_hard_deadline timestamptz;
  v_ev RECORD;
BEGIN
  -- 1) GENERAZIONE DOSI FUTURE MANCANTI (-30min -> +24h)
  FOR v_therapy IN
    SELECT id, patient_id, times, recurrence, start_date, end_date
    FROM public.therapies
    WHERE active = true AND suspended = false AND times IS NOT NULL AND jsonb_array_length(times) > 0
  LOOP
    v_start_date := v_therapy.start_date::date;
    v_end_date := CASE WHEN v_therapy.end_date IS NOT NULL THEN v_therapy.end_date::date ELSE NULL END;
    v_curr_date := v_past::date;

    WHILE v_curr_date <= v_horizon::date LOOP
      IF v_curr_date >= v_start_date AND (v_end_date IS NULL OR v_curr_date <= v_end_date) THEN
        v_kind := COALESCE(v_therapy.recurrence->>'kind', 'daily');
        v_dow := EXTRACT(DOW FROM v_curr_date)::int; -- 0=Sun, 1=Mon, ..., 6=Sat

        v_is_scheduled := CASE
          WHEN v_kind = 'daily' THEN true
          WHEN v_kind = 'weekdays' THEN v_dow BETWEEN 1 AND 5
          WHEN v_kind = 'weekend' THEN v_dow IN (0, 6)
          WHEN v_kind = 'every_x_days' THEN
            v_curr_date >= v_start_date AND
            ((v_curr_date - v_start_date) % GREATEST(1, COALESCE((v_therapy.recurrence->>'x')::int, 1))) = 0
          WHEN v_kind = 'specific_days' THEN
            COALESCE(v_therapy.recurrence->'days', '[]'::jsonb) @> to_jsonb(v_dow)
          ELSE true
        END;

        IF v_is_scheduled THEN
          FOR v_time_str IN SELECT jsonb_array_elements_text(v_therapy.times) LOOP
            v_at := (v_curr_date || ' ' || v_time_str || ':00')::timestamptz;
            IF v_at BETWEEN v_past AND v_horizon THEN
              v_event_id := 'e_' || v_therapy.id || '_' || (floor(extract(epoch from v_at) * 1000))::bigint;

              INSERT INTO public.events (id, therapy_id, patient_id, scheduled_at, status, stage, timeline)
              VALUES (
                v_event_id,
                v_therapy.id,
                v_therapy.patient_id,
                v_at,
                'scheduled',
                'scheduled',
                jsonb_build_array(jsonb_build_object(
                  'at', to_char(v_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                  'kind', 'scheduled',
                  'message', 'Dose programmata'
                ))
              )
              ON CONFLICT (therapy_id, scheduled_at) DO NOTHING;
            END IF;
          END LOOP;
        END IF;
      END IF;
      v_curr_date := v_curr_date + 1;
    END LOOP;
  END LOOP;

  -- 2) TRANSIZIONI DI STAGE E NOTIFICHE PAZIENTE

  -- 2a) REMINDER_PRE
  FOR v_ev IN
    SELECT e.id, e.therapy_id, e.patient_id, e.scheduled_at,
           t.name AS therapy_name, t.dosage, t.reminder_intervals,
           p.user_id AS patient_user_id
    FROM public.events e
    JOIN public.therapies t ON t.id = e.therapy_id
    JOIN public.patients p ON p.id = e.patient_id
    WHERE e.status = 'scheduled'
      AND e.scheduled_at BETWEEN v_now AND v_horizon
  LOOP
    v_before := 10;
    IF v_ev.reminder_intervals IS NOT NULL AND jsonb_array_length(v_ev.reminder_intervals) > 0 THEN
      SELECT COALESCE(NULLIF(ABS((jsonb_array_elements_text(v_ev.reminder_intervals))::int), 0), 10)
      INTO v_before
      LIMIT 1;
    END IF;

    v_diff_min := extract(epoch from (v_ev.scheduled_at - v_now)) / 60.0;
    IF v_diff_min <= v_before AND v_diff_min > GREATEST(0, v_before - 2) THEN
      IF v_ev.patient_user_id IS NOT NULL THEN
        INSERT INTO public.notifications (
          target_user_id, kind, severity, title, message, patient_id, therapy_id, event_id, dose_key
        ) VALUES (
          v_ev.patient_user_id, 'reminder_pre', 'info',
          '💊 Tra ' || v_before || ' min: ' || COALESCE(v_ev.therapy_name, 'farmaco'),
          'Alle ' || to_char(v_ev.scheduled_at AT TIME ZONE 'Europe/Rome', 'HH24:MI') || ' — ' || COALESCE(v_ev.dosage, ''),
          v_ev.patient_id, v_ev.therapy_id, v_ev.id,
          v_ev.therapy_id || '@' || v_ev.scheduled_at::text || '@reminder_pre@patient'
        )
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END LOOP;

  -- 2b) DUE (ora esatta ±90s / -60s..+90s)
  FOR v_ev IN
    SELECT e.id, e.therapy_id, e.patient_id, e.scheduled_at,
           t.name AS therapy_name, t.dosage, t.quantity,
           p.user_id AS patient_user_id
    FROM public.events e
    JOIN public.therapies t ON t.id = e.therapy_id
    JOIN public.patients p ON p.id = e.patient_id
    WHERE e.status = 'scheduled'
      AND e.scheduled_at BETWEEN (v_now - interval '60 seconds') AND (v_now + interval '90 seconds')
  LOOP
    UPDATE public.events
    SET stage = 'due'
    WHERE id = v_ev.id AND status = 'scheduled';

    IF FOUND AND v_ev.patient_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (
        target_user_id, kind, severity, title, message, patient_id, therapy_id, event_id, dose_key
      ) VALUES (
        v_ev.patient_user_id, 'due', 'warning',
        '💊 È ora: ' || COALESCE(v_ev.therapy_name, 'farmaco'),
        COALESCE(v_ev.quantity, 1) || ' unità — ' || COALESCE(v_ev.dosage, ''),
        v_ev.patient_id, v_ev.therapy_id, v_ev.id,
        v_ev.therapy_id || '@' || v_ev.scheduled_at::text || '@due@patient'
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  -- 2c) REMINDER_POST: dopo N min (post_reminder_minutes, def 5)
  FOR v_ev IN
    SELECT e.id, e.therapy_id, e.patient_id, e.scheduled_at, e.stage,
           t.name AS therapy_name, t.post_reminder_minutes,
           p.user_id AS patient_user_id
    FROM public.events e
    JOIN public.therapies t ON t.id = e.therapy_id
    JOIN public.patients p ON p.id = e.patient_id
    WHERE e.status = 'scheduled'
      AND e.scheduled_at BETWEEN v_past AND (v_now - interval '60 seconds')
      AND e.stage NOT IN ('reminder_post', 'final_due', 'missed')
  LOOP
    v_post_min := GREATEST(1, COALESCE(v_ev.post_reminder_minutes, 5));
    v_elapsed_min := extract(epoch from (v_now - v_ev.scheduled_at)) / 60.0;

    IF v_elapsed_min >= v_post_min AND v_elapsed_min <= (v_post_min + 2) THEN
      UPDATE public.events
      SET stage = 'reminder_post'
      WHERE id = v_ev.id AND status = 'scheduled';

      IF FOUND AND v_ev.patient_user_id IS NOT NULL THEN
        INSERT INTO public.notifications (
          target_user_id, kind, severity, title, message, patient_id, therapy_id, event_id, dose_key
        ) VALUES (
          v_ev.patient_user_id, 'reminder_post', 'warning',
          '💊 Non hai ancora preso ' || COALESCE(v_ev.therapy_name, 'il farmaco'),
          'Erano le ' || to_char(v_ev.scheduled_at AT TIME ZONE 'Europe/Rome', 'HH24:MI') || '. Conferma o rimanda.',
          v_ev.patient_id, v_ev.therapy_id, v_ev.id,
          v_ev.therapy_id || '@' || v_ev.scheduled_at::text || '@reminder_post@patient'
        )
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END LOOP;

  -- 2d) FINAL_DUE: snoozed alla scadenza dello snooze
  FOR v_ev IN
    SELECT e.id, e.therapy_id, e.patient_id, e.scheduled_at, e.stage, e.final_due_at,
           t.name AS therapy_name,
           p.user_id AS patient_user_id
    FROM public.events e
    JOIN public.therapies t ON t.id = e.therapy_id
    JOIN public.patients p ON p.id = e.patient_id
    WHERE e.status = 'snoozed'
      AND e.snoozed_until IS NOT NULL
      AND e.snoozed_until <= (v_now + interval '60 seconds')
      AND e.final_due_at IS NULL
      AND e.stage NOT IN ('final_due', 'missed')
  LOOP
    UPDATE public.events
    SET stage = 'final_due',
        final_due_at = v_now
    WHERE id = v_ev.id AND status = 'snoozed';

    IF FOUND AND v_ev.patient_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (
        target_user_id, kind, severity, title, message, patient_id, therapy_id, event_id, dose_key
      ) VALUES (
        v_ev.patient_user_id, 'final_due', 'warning',
        '💊 Ultima chiamata: ' || COALESCE(v_ev.therapy_name, 'farmaco'),
        'Conferma la dose delle ' || to_char(v_ev.scheduled_at AT TIME ZONE 'Europe/Rome', 'HH24:MI') || '. Non puoi più rimandare.',
        v_ev.patient_id, v_ev.therapy_id, v_ev.id,
        v_ev.therapy_id || '@' || v_ev.scheduled_at::text || '@final_due@patient'
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  -- 2e) MISSED: scatta dopo hard deadline
  FOR v_ev IN
    SELECT e.id, e.therapy_id, e.patient_id, e.scheduled_at, e.snoozed_until,
           t.timeout_minutes
    FROM public.events e
    JOIN public.therapies t ON t.id = e.therapy_id
    WHERE e.status IN ('scheduled', 'snoozed')
      AND e.scheduled_at <= (v_now - interval '5 minutes')
  LOOP
    v_timeout_min := COALESCE(v_ev.timeout_minutes, 10);
    v_hard_deadline := CASE
      WHEN v_ev.snoozed_until IS NOT NULL THEN v_ev.snoozed_until
      ELSE v_ev.scheduled_at + (v_timeout_min || ' minutes')::interval
    END;

    IF v_now >= v_hard_deadline THEN
      -- Il trigger trg_dose_status_change gestirà notifiche a paziente e caregiver
      UPDATE public.events
      SET status = 'missed',
          stage = 'missed',
          timeline = timeline || jsonb_build_array(jsonb_build_object(
            'at', to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'kind', 'missed',
            'message', 'Dose non confermata entro il tempo massimo'
          ))
      WHERE id = v_ev.id AND status IN ('scheduled', 'snoozed');
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.process_dose_schedule() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_dose_schedule() TO service_role, postgres;

-- Aggiorna il job pg_cron per chiamare la funzione SQL direttamente
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
      FROM cron.job
     WHERE jobname IN ('familymed-dose-scheduler', 'dose-scheduler');

    PERFORM cron.schedule(
      'familymed-dose-scheduler',
      '* * * * *',
      $CRON$ SELECT public.process_dose_schedule(); $CRON$
    );
  END IF;
END $$;
