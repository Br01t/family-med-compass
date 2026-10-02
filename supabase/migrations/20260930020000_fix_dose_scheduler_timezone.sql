-- ============================================================================
-- FIX CRITICO — process_dose_schedule() generava le dosi all'ora sbagliata
--
-- Il form di creazione/modifica terapia (AddTherapyDialog.tsx) usa un
-- <input type="time"> che restituisce una stringa "HH:MM" senza alcuna
-- informazione di fuso: è l'ora del muro (wall-clock) nel fuso di chi la
-- digita, quasi certamente Europe/Rome dato che l'intera app è in italiano
-- e le altre parti del backend (es. i messaggi "dose in ritardo") già
-- assumono esplicitamente Europe/Rome. Quella stringa viene salvata così
-- com'è in therapies.times (text[]), senza nessuna conversione lato client.
--
-- process_dose_schedule() però faceva:
--
--   v_at := (v_curr_date || ' ' || v_time_str || ':00')::timestamptz;
--
-- Un cast diretto a timestamptz di una stringa senza fuso usa il fuso di
-- SESSIONE del database (su Supabase, UTC di default — non risulta nessun
-- "ALTER DATABASE ... SET timezone" in questo repo). Quindi "08:00"
-- inserito dall'utente veniva salvato come 08:00 UTC, cioè le 09:00 (ora
-- solare, CET) o le 10:00 (ora legale, CEST) in Italia: ogni promemoria e
-- ogni finestra di "dose in ritardo" scattavano 1-2 ore dopo quanto
-- impostato dall'utente.
--
-- Il bug era presente IDENTICO fin dalla primissima versione della
-- funzione (20260911165516) e in tutte le riscritture successive: non è
-- mai stato corretto, solo trascinato avanti.
--
-- FIX: si interpreta la stringa come ora locale di Europe/Rome e la si
-- converte a timestamptz con "AT TIME ZONE", che su Postgres gestisce
-- correttamente anche il passaggio ora solare/legale in automatico in
-- base alla data specifica di ogni occorrenza (a differenza di un offset
-- fisso, che si romperebbe ad ogni cambio d'ora per le terapie ricorrenti).
--
-- Nessun'altra riga va toccata: la UI (formatTime, che usa il fuso reale
-- del browser) e i messaggi di notifica (già "AT TIME ZONE Europe/Rome")
-- interpretano scheduled_at come un vero istante UTC — erano già corretti,
-- mostravano semplicemente l'orario sbagliato perché l'istante salvato era
-- sbagliato. Con questo fix tornano a mostrare l'orario giusto senza
-- bisogno di altre modifiche.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_dose_schedule()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_now timestamptz := now();
  v_minute int := extract(minute from v_now)::int;
  v_past timestamptz := v_now - interval '2 hours';
  v_horizon timestamptz := v_now + interval '24 hours';
  v_should_generate boolean := false;
  v_therapy RECORD;
  v_start_date date;
  v_end_date date;
  v_curr_date date;
  v_kind text;
  v_dow int;
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
  -- 1) GENERAZIONE DOSI FUTURE (+24h):
  IF (v_minute % 15 = 0) OR NOT EXISTS (
    SELECT 1 FROM public.events
    WHERE scheduled_at BETWEEN v_now AND (v_now + interval '1 hour')
      AND status = 'scheduled'
    LIMIT 1
  ) THEN
    v_should_generate := true;
  END IF;

  IF v_should_generate THEN
    FOR v_therapy IN
      SELECT t.id, t.patient_id, t.times, t.recurrence, t.start_date, t.end_date
      FROM public.therapies t
      JOIN public.patients p ON p.id = t.patient_id
      WHERE t.active = true
        AND t.suspended = false
        AND t.suspended_at IS NULL
        AND p.suspended_at IS NULL
        AND t.times IS NOT NULL
        AND cardinality(t.times) > 0
    LOOP
      v_start_date := v_therapy.start_date::date;
      v_end_date := CASE WHEN v_therapy.end_date IS NOT NULL THEN v_therapy.end_date::date ELSE NULL END;
      v_curr_date := v_past::date;

      WHILE v_curr_date <= v_horizon::date LOOP
        IF v_curr_date >= v_start_date AND (v_end_date IS NULL OR v_curr_date <= v_end_date) THEN
          v_kind := COALESCE(v_therapy.recurrence->>'kind', 'daily');
          v_dow := EXTRACT(DOW FROM v_curr_date)::int;

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
            FOR v_time_str IN SELECT unnest(v_therapy.times) LOOP
              -- FIX: interpretata come ora locale Europe/Rome (quella che
              -- l'utente ha davvero digitato nel form), non più come UTC.
              v_at := ((v_curr_date || ' ' || v_time_str || ':00')::timestamp) AT TIME ZONE 'Europe/Rome';
              IF v_at BETWEEN v_past AND v_horizon THEN
                v_event_id := 'e_' || v_therapy.id || '_' || (floor(extract(epoch from v_at) * 1000))::bigint;

                INSERT INTO public.events (id, therapy_id, patient_id, scheduled_at, status, stage, timeline)
                VALUES (
                  v_event_id, v_therapy.id, v_therapy.patient_id, v_at, 'scheduled', 'scheduled',
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
  END IF;

  -- 2a) REMINDER_PRE (Finestra di 20 minuti)
  FOR v_ev IN
    SELECT e.id, e.therapy_id, e.patient_id, e.scheduled_at,
           t.name AS therapy_name, t.dosage, t.reminder_intervals,
           p.user_id AS patient_user_id
    FROM public.events e
    JOIN public.therapies t ON t.id = e.therapy_id
    JOIN public.patients p ON p.id = e.patient_id
    WHERE e.status = 'scheduled'
      AND e.scheduled_at BETWEEN v_now AND (v_now + interval '20 minutes')
      AND p.suspended_at IS NULL
      AND t.suspended_at IS NULL
      AND t.suspended = false
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
        )
        VALUES (
          v_ev.patient_user_id,
          'dose_reminder_pre',
          'low',
          'Promemoria: ' || v_ev.therapy_name,
          'Tra ' || v_before || ' minuti è prevista l''assunzione (' || COALESCE(v_ev.dosage, '') || ')',
          v_ev.patient_id,
          v_ev.therapy_id,
          v_ev.id,
          v_ev.id || ':pre:' || v_before
        )
        ON CONFLICT (target_user_id, dose_key) DO NOTHING;
      END IF;
    END IF;
  END LOOP;

  -- 2b) REMINDER_EXACT (:00)
  FOR v_ev IN
    SELECT e.id, e.therapy_id, e.patient_id, e.scheduled_at,
           t.name AS therapy_name, t.dosage,
           p.user_id AS patient_user_id
    FROM public.events e
    JOIN public.therapies t ON t.id = e.therapy_id
    JOIN public.patients p ON p.id = e.patient_id
    WHERE e.status = 'scheduled'
      AND e.scheduled_at BETWEEN (v_now - interval '1 minute') AND (v_now + interval '1 minute')
      AND p.suspended_at IS NULL
      AND t.suspended_at IS NULL
      AND t.suspended = false
  LOOP
    IF v_ev.patient_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (
        target_user_id, kind, severity, title, message, patient_id, therapy_id, event_id, dose_key
      )
      VALUES (
        v_ev.patient_user_id,
        'dose_reminder_exact',
        'medium',
        'È ora della terapia: ' || v_ev.therapy_name,
        'Assumi adesso ' || COALESCE(v_ev.dosage, ''),
        v_ev.patient_id,
        v_ev.therapy_id,
        v_ev.id,
        v_ev.id || ':exact:0'
      )
      ON CONFLICT (target_user_id, dose_key) DO NOTHING;
    END IF;
  END LOOP;

  -- 2c) REMINDER_POST
  FOR v_ev IN
    SELECT e.id, e.therapy_id, e.patient_id, e.scheduled_at,
           t.name AS therapy_name, t.dosage, t.reminder_intervals,
           p.user_id AS patient_user_id
    FROM public.events e
    JOIN public.therapies t ON t.id = e.therapy_id
    JOIN public.patients p ON p.id = e.patient_id
    WHERE e.status = 'scheduled'
      AND e.scheduled_at BETWEEN (v_now - interval '45 minutes') AND v_now
      AND p.suspended_at IS NULL
      AND t.suspended_at IS NULL
      AND t.suspended = false
  LOOP
    v_post_min := 15;
    IF v_ev.reminder_intervals IS NOT NULL AND jsonb_array_length(v_ev.reminder_intervals) > 0 THEN
      SELECT COALESCE(NULLIF(ABS((jsonb_array_elements_text(v_ev.reminder_intervals))::int), 0), 15)
      INTO v_post_min
      LIMIT 1;
    END IF;

    v_elapsed_min := extract(epoch from (v_now - v_ev.scheduled_at)) / 60.0;
    IF v_elapsed_min >= v_post_min AND v_elapsed_min < (v_post_min + 2) THEN
      IF v_ev.patient_user_id IS NOT NULL THEN
        INSERT INTO public.notifications (
          target_user_id, kind, severity, title, message, patient_id, therapy_id, event_id, dose_key
        )
        VALUES (
          v_ev.patient_user_id,
          'dose_reminder_post',
          'high',
          'Dose in ritardo: ' || v_ev.therapy_name,
          'Non risulta confermata la dose delle ' || to_char(v_ev.scheduled_at AT TIME ZONE 'Europe/Rome', 'HH24:MI'),
          v_ev.patient_id,
          v_ev.therapy_id,
          v_ev.id,
          v_ev.id || ':post:' || v_post_min
        )
        ON CONFLICT (target_user_id, dose_key) DO NOTHING;
      END IF;
    END IF;
  END LOOP;

  -- 3) AUTO-MISSED
  FOR v_ev IN
    SELECT e.id, e.therapy_id, e.patient_id, e.scheduled_at,
           COALESCE(t.timeout_minutes, 180) AS timeout_minutes
    FROM public.events e
    JOIN public.therapies t ON t.id = e.therapy_id
    JOIN public.patients p ON p.id = e.patient_id
    WHERE e.status = 'scheduled'
      AND e.scheduled_at < (v_now - interval '30 minutes')
      AND p.suspended_at IS NULL
      AND t.suspended_at IS NULL
      AND t.suspended = false
  LOOP
    v_timeout_min := GREATEST(30, v_ev.timeout_minutes);
    v_hard_deadline := v_ev.scheduled_at + make_interval(mins => v_timeout_min);

    IF v_now >= v_hard_deadline THEN
      UPDATE public.events
      SET status = 'missed',
          stage = 'missed',
          timeline = COALESCE(timeline, '[]'::jsonb) || jsonb_build_object(
            'at', to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'kind', 'auto_missed',
            'message', 'Dose scaduta automaticamente'
          )
      WHERE id = v_ev.id AND status = 'scheduled';
    END IF;
  END LOOP;

END;
$$;

-- ----------------------------------------------------------------------------
-- Pulizia: run_dose_scheduler() era una versione precedente della stessa
-- logica (stesso bug di fuso, dichiarato esplicitamente nel suo commento:
-- "le ore in times sono UTC"), mai collegata a nessun cron job (l'unico
-- job attivo, 'familymed-dose-scheduler', chiama process_dose_schedule())
-- e mai chiamata dal client. Rimossa per evitare che in futuro qualcuno la
-- usi per sbaglio pensando sia quella in uso.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.run_dose_scheduler();

-- ============================================================================
-- Verifica dopo l'applicazione (sostituisci l'id con una terapia reale):
--
--   SELECT therapy_id, scheduled_at, scheduled_at AT TIME ZONE 'Europe/Rome' AS ora_italia
--   FROM public.events
--   WHERE therapy_id = '<id_terapia>' AND status = 'scheduled'
--   ORDER BY scheduled_at LIMIT 5;
--
-- La colonna ora_italia deve mostrare esattamente l'orario impostato nel
-- form della terapia. Le dosi già generate PRIMA di questa migration
-- restano con l'orario sbagliato: elimina gli eventi 'scheduled' futuri
-- della terapia interessata, li rigenera il cron entro un minuto con
-- l'orario corretto.
--
--   DELETE FROM public.events WHERE status = 'scheduled' AND scheduled_at > now();
-- ============================================================================