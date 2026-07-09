-- Rimuove il trigger duplicato che causava doppie notifiche e doppio decremento scorte
DROP TRIGGER IF EXISTS on_event_taken ON public.events;

-- Assicura che esista solo il trigger v2 corretto (idempotente)
DROP TRIGGER IF EXISTS trg_dose_taken ON public.events;

-- Ricrea handle_dose_taken v2 (distingue taken vs taken_after_snooze, no low_stock per dose)
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
BEGIN
  IF NEW.status <> 'taken' OR COALESCE(OLD.status,'') = 'taken' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_therapy FROM public.therapies WHERE id = NEW.therapy_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT * INTO v_patient FROM public.patients WHERE id = NEW.patient_id;

  v_after_snooze := (COALESCE(OLD.status,'') = 'snoozed');
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
        || ' — confermata alle ' || to_char(NEW.confirmed_at AT TIME ZONE 'Europe/Rome','HH24:MI'),
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

-- Un solo trigger, che scatta solo quando status passa a 'taken'
CREATE TRIGGER trg_dose_taken
AFTER UPDATE OF status ON public.events
FOR EACH ROW
WHEN (NEW.status = 'taken' AND (OLD.status IS DISTINCT FROM 'taken'))
EXECUTE FUNCTION public.handle_dose_taken();

-- Indice unico per deduplica notifiche (safety net)
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dose_key_target_uniq
  ON public.notifications (target_user_id, dose_key)
  WHERE dose_key IS NOT NULL;