
-- 1) handle_dose_taken: gestisce sia INSERT che UPDATE
CREATE OR REPLACE FUNCTION public.handle_dose_taken()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_therapy public.therapies%rowtype;
  v_patient public.patients%rowtype;
  v_caregiver uuid;
  v_remaining int;
  v_kind text;
  v_hhmm text;
  v_after_snooze boolean;
  v_old_status text;
BEGIN
  v_old_status := CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(OLD.status,'') ELSE '' END;
  IF NEW.status <> 'taken' OR v_old_status = 'taken' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_therapy FROM public.therapies WHERE id = NEW.therapy_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT * INTO v_patient FROM public.patients WHERE id = NEW.patient_id;

  v_after_snooze := (v_old_status = 'snoozed');
  v_kind := CASE WHEN v_after_snooze THEN 'taken_after_snooze' ELSE 'taken' END;
  v_hhmm := to_char(NEW.scheduled_at AT TIME ZONE 'Europe/Rome','HH24:MI');

  UPDATE public.therapies
    SET pills_remaining = greatest(0, pills_remaining - COALESCE(v_therapy.quantity,1))
    WHERE id = NEW.therapy_id
    RETURNING pills_remaining INTO v_remaining;

  INSERT INTO public.stock_movements (therapy_id, delta, reason, event_id)
    VALUES (NEW.therapy_id, -COALESCE(v_therapy.quantity,1), 'intake', NEW.id);

  FOR v_caregiver IN
    SELECT caregiver_id FROM public.caregiver_patients WHERE patient_id = NEW.patient_id
  LOOP
    INSERT INTO public.notifications
      (target_user_id, kind, severity, title, message, patient_id, therapy_id, event_id, dose_key)
    VALUES (
      v_caregiver, v_kind, 'info',
      '👨‍👩‍👧 ' || v_patient.name || ' ha confermato ' || v_therapy.name
        || CASE WHEN v_after_snooze THEN ' (dopo rimando)' ELSE '' END,
      'In risposta alla dose delle ' || v_hhmm
        || ' — confermata alle ' || to_char(COALESCE(NEW.confirmed_at, now()) AT TIME ZONE 'Europe/Rome','HH24:MI'),
      NEW.patient_id, NEW.therapy_id, NEW.id,
      NEW.therapy_id || '@' || NEW.scheduled_at::text || '@' || v_kind || '@cg@' || v_caregiver
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  IF v_remaining <= COALESCE(v_therapy.low_stock_threshold, 10) THEN
    FOR v_caregiver IN
      SELECT caregiver_id FROM public.caregiver_patients WHERE patient_id = NEW.patient_id
    LOOP
      INSERT INTO public.notifications
        (target_user_id, kind, severity, title, message, patient_id, therapy_id, dose_key)
      VALUES (
        v_caregiver, 'low_stock', 'warning',
        'Scorta bassa: ' || v_therapy.name,
        'Restano ' || v_remaining || ' dosi per ' || v_patient.name || '. Programma il riordino.',
        NEW.patient_id, NEW.therapy_id,
        NEW.therapy_id || '@lowstock@' || to_char(now() AT TIME ZONE 'Europe/Rome','YYYY-MM-DD')
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dose_taken ON public.events;
DROP TRIGGER IF EXISTS on_event_taken ON public.events;
DROP TRIGGER IF EXISTS trg_dose_taken_ins ON public.events;
DROP TRIGGER IF EXISTS trg_dose_taken_upd ON public.events;

CREATE TRIGGER trg_dose_taken_ins
AFTER INSERT ON public.events
FOR EACH ROW
WHEN (NEW.status = 'taken')
EXECUTE FUNCTION public.handle_dose_taken();

CREATE TRIGGER trg_dose_taken_upd
AFTER UPDATE OF status ON public.events
FOR EACH ROW
WHEN (NEW.status = 'taken' AND OLD.status IS DISTINCT FROM 'taken')
EXECUTE FUNCTION public.handle_dose_taken();

-- 2) handle_dose_status_change per snoozed/skipped/missed
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
  v_kind text; v_sev text;
  v_cg_title text; v_cg_msg text;
  v_pt_title text; v_pt_msg text;
  v_hhmm text;
  v_snooze_min int;
  v_old_status text;
BEGIN
  v_old_status := CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(OLD.status,'') ELSE '' END;
  IF NEW.status = v_old_status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('snoozed','skipped','missed') THEN RETURN NEW; END IF;

  SELECT * INTO v_therapy FROM public.therapies WHERE id = NEW.therapy_id;
  SELECT * INTO v_patient FROM public.patients  WHERE id = NEW.patient_id;
  v_hhmm := to_char(NEW.scheduled_at AT TIME ZONE 'Europe/Rome','HH24:MI');
  v_snooze_min := COALESCE(v_therapy.snooze_minutes, 10);

  IF NEW.status = 'snoozed' THEN
    v_kind := 'snoozed'; v_sev := 'warning';
    v_cg_title := '👨‍👩‍👧 ' || v_patient.name || ' ha rimandato ' || v_therapy.name;
    v_cg_msg   := 'In risposta alla dose delle ' || v_hhmm
                  || ' — rimandata di ' || v_snooze_min || ' min.';
    v_pt_title := 'Hai rimandato ' || v_therapy.name;
    v_pt_msg   := 'Dose delle ' || v_hhmm || ' rimandata di ' || v_snooze_min || ' min.';
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
$$;

DROP TRIGGER IF EXISTS trg_dose_status_change ON public.events;
DROP TRIGGER IF EXISTS trg_dose_status_change_ins ON public.events;
DROP TRIGGER IF EXISTS trg_dose_status_change_upd ON public.events;

CREATE TRIGGER trg_dose_status_change_ins
AFTER INSERT ON public.events
FOR EACH ROW
WHEN (NEW.status IN ('snoozed','skipped','missed'))
EXECUTE FUNCTION public.handle_dose_status_change();

CREATE TRIGGER trg_dose_status_change_upd
AFTER UPDATE OF status ON public.events
FOR EACH ROW
WHEN (NEW.status IN ('snoozed','skipped','missed') AND OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.handle_dose_status_change();

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dose_key_target_uniq
  ON public.notifications (target_user_id, dose_key)
  WHERE dose_key IS NOT NULL;
