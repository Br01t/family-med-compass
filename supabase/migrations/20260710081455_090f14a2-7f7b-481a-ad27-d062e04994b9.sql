
CREATE OR REPLACE FUNCTION public.handle_dose_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_therapy public.therapies%rowtype;
  v_patient public.patients%rowtype;
  v_caregiver uuid;
  v_kind text; v_sev text;
  v_cg_title text; v_cg_msg text;
  v_pt_title text; v_pt_msg text;
  v_hhmm text;
  v_snooze_min int;
  v_old_status text;
  v_old_snoozed_until timestamptz;
BEGIN
  v_old_status := CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(OLD.status,'') ELSE '' END;
  v_old_snoozed_until := CASE WHEN TG_OP = 'UPDATE' THEN OLD.snoozed_until ELSE NULL END;

  -- Blocco server-side: una dose può essere rimandata UNA sola volta.
  IF NEW.status = 'snoozed'
     AND (v_old_status = 'snoozed' OR v_old_snoozed_until IS NOT NULL) THEN
    RAISE EXCEPTION 'Questa dose è già stata rimandata una volta e non può essere rimandata di nuovo.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = v_old_status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('snoozed','skipped','missed') THEN RETURN NEW; END IF;

  SELECT * INTO v_therapy FROM public.therapies WHERE id = NEW.therapy_id;
  SELECT * INTO v_patient FROM public.patients  WHERE id = NEW.patient_id;
  v_hhmm := to_char(NEW.scheduled_at AT TIME ZONE 'Europe/Rome','HH24:MI');
  -- Il rimando dura ESATTAMENTE il post_reminder_minutes della terapia
  -- (stesso valore usato dal client). Fallback su snooze_minutes o 5.
  v_snooze_min := COALESCE(
    v_therapy.post_reminder_minutes,
    v_therapy.snooze_minutes,
    5
  );

  IF NEW.status = 'snoozed' THEN
    v_kind := 'snoozed'; v_sev := 'warning';
    v_cg_title := '👨‍👩‍👧 ' || v_patient.name || ' ha rimandato ' || v_therapy.name;
    v_cg_msg   := 'In risposta alla dose delle ' || v_hhmm
                  || ' — rimandata di ' || v_snooze_min || ' min (unico rimando consentito).';
    v_pt_title := 'Hai rimandato ' || v_therapy.name;
    v_pt_msg   := 'Dose delle ' || v_hhmm || ' rimandata di ' || v_snooze_min
                  || ' min. Non potrai rimandarla ancora.';
  ELSIF NEW.status = 'skipped' THEN
    v_kind := 'skipped'; v_sev := 'alert';
    v_cg_title := '👨‍👩‍👧 ' || v_patient.name || ' ha rifiutato ' || v_therapy.name;
    v_cg_msg   := 'In risposta alla dose delle ' || v_hhmm || ' — saltata.';
    v_pt_title := 'Hai saltato ' || v_therapy.name;
    v_pt_msg   := 'La dose delle ' || v_hhmm
                  || ' è stata segnata come saltata. Probabilmente verrai contattato da un familiare.';
  ELSE
    v_kind := 'missed'; v_sev := 'alert';
    v_cg_title := '👨‍👩‍👧 ' || v_patient.name || ' non ha preso ' || v_therapy.name;
    v_cg_msg   := 'Dose delle ' || v_hhmm || ' segnata come dimenticata dopo il tempo massimo.';
    v_pt_title := 'Cura dimenticata: ' || v_therapy.name;
    v_pt_msg   := 'La dose delle ' || v_hhmm
                  || ' è stata segnata come dimenticata. Probabilmente verrai contattato da un familiare.';
  END IF;

  FOR v_caregiver IN
    SELECT caregiver_id FROM public.caregiver_patients WHERE patient_id = NEW.patient_id
  LOOP
    INSERT INTO public.notifications
      (target_user_id, kind, severity, title, message, patient_id, therapy_id, event_id, dose_key)
    VALUES (
      v_caregiver, v_kind, v_sev, v_cg_title, v_cg_msg,
      NEW.patient_id, NEW.therapy_id, NEW.id,
      NEW.therapy_id || '@' || NEW.scheduled_at::text || '@' || v_kind || '@cg@' || v_caregiver
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  IF v_patient.user_id IS NOT NULL THEN
    INSERT INTO public.notifications
      (target_user_id, kind, severity, title, message, patient_id, therapy_id, event_id, dose_key)
    VALUES (
      v_patient.user_id, v_kind, v_sev, v_pt_title, v_pt_msg,
      NEW.patient_id, NEW.therapy_id, NEW.id,
      NEW.therapy_id || '@' || NEW.scheduled_at::text || '@' || v_kind || '@patient'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;
