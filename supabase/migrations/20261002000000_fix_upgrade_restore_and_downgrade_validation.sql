-- ============================================================
-- Fix 1: re-upgrade dopo downgrade falliva ("Limite di 3 terapie attive...")
--        perché il ripristino avveniva prima di aggiornare il piano effettivo.
-- Fix 2: il ripristino dei caregiver sospesi aveva la condizione invertita
--        (suspended_at IS NULL) e non ripristinava mai nulla.
-- Fix 3: perform_downgrade ora valida lato server quanti pazienti / terapie /
--        caregiver si possono mantenere nel nuovo piano.
-- ============================================================

CREATE OR REPLACE FUNCTION public.perform_downgrade(
  _new_plan           text,
  _keep_patient_ids   text[],
  _keep_therapy_ids   jsonb,                        -- {"patient_id": ["therapy_id", ...]}
  _keep_caregiver_ids jsonb DEFAULT '{}'::jsonb     -- {"patient_id": ["caregiver_id", ...]}
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid                  uuid := auth.uid();
  v_current_plan         text;
  v_plan_order           int;
  v_new_plan_order       int;
  v_caregiver_extra_limit int;
  v_therapy_limit        int;
  v_suspended_patients   int := 0;
  v_suspended_therapies  int := 0;
  v_suspended_caregivers int := 0;
  v_patient_id           text;
  v_keep_therapy_arr     text[];
  v_keep_caregiver_arr   uuid[];
  v_suspended_patient_ids text[];
  v_patient_limit        int;
  v_kept_active_therapies int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT COALESCE(subscription_plan_own, 'free') INTO v_current_plan
  FROM public.profiles WHERE id = v_uid;

  v_plan_order     := CASE v_current_plan WHEN 'free' THEN 0 WHEN 'pro' THEN 1 WHEN 'max' THEN 2 ELSE 0 END;
  v_new_plan_order := CASE _new_plan WHEN 'free' THEN 0 WHEN 'pro' THEN 1 WHEN 'max' THEN 2 ELSE 0 END;

  IF v_new_plan_order >= v_plan_order THEN
    RAISE EXCEPTION 'Not a downgrade: % -> %', v_current_plan, _new_plan;
  END IF;

  v_caregiver_extra_limit := CASE _new_plan WHEN 'free' THEN 0 WHEN 'pro' THEN 4 WHEN 'max' THEN 9 ELSE 0 END;
  v_therapy_limit         := CASE _new_plan WHEN 'free' THEN 3 ELSE -1 END;
  v_patient_limit         := CASE _new_plan WHEN 'free' THEN 1 WHEN 'pro' THEN 2 WHEN 'max' THEN 10 ELSE 1 END;

  -- 0. Validazione server-side: il client non può dichiarare di "tenere"
  --    più record di quanti il nuovo piano ne consente.
  IF (SELECT count(*) FROM public.patients
       WHERE owner_user_id = v_uid
         AND suspended_at IS NULL
         AND id = ANY(COALESCE(_keep_patient_ids, ARRAY[]::text[]))) > v_patient_limit THEN
    RAISE EXCEPTION 'Downgrade non valido: il piano % consente al massimo % pazienti', _new_plan, v_patient_limit;
  END IF;

  IF v_therapy_limit >= 0 THEN
    FOR v_patient_id IN
      SELECT id FROM public.patients
      WHERE owner_user_id = v_uid
        AND suspended_at IS NULL
        AND id = ANY(COALESCE(_keep_patient_ids, ARRAY[]::text[]))
    LOOP
      SELECT count(*) INTO v_kept_active_therapies
      FROM public.therapies t
      WHERE t.patient_id = v_patient_id
        AND t.active = true
        AND t.suspended_at IS NULL
        AND t.id IN (
          SELECT jsonb_array_elements_text(COALESCE(_keep_therapy_ids->v_patient_id, '[]'::jsonb))
        );
      IF v_kept_active_therapies > v_therapy_limit THEN
        RAISE EXCEPTION 'Downgrade non valido: il piano % consente al massimo % terapie attive per paziente', _new_plan, v_therapy_limit;
      END IF;
    END LOOP;
  END IF;

  IF v_caregiver_extra_limit > 0 AND _keep_caregiver_ids IS NOT NULL THEN
    FOR v_patient_id IN SELECT jsonb_object_keys(_keep_caregiver_ids) LOOP
      IF jsonb_array_length(_keep_caregiver_ids->v_patient_id) > v_caregiver_extra_limit THEN
        RAISE EXCEPTION 'Downgrade non valido: il piano % consente al massimo % caregiver aggiuntivi per paziente', _new_plan, v_caregiver_extra_limit;
      END IF;
    END LOOP;
  END IF;

  -- 1. Pazienti sospesi: raccogli gli ID prima di aggiornare
  SELECT array_agg(id) INTO v_suspended_patient_ids
  FROM public.patients
  WHERE owner_user_id = v_uid
    AND suspended_at IS NULL
    AND id <> ALL(COALESCE(_keep_patient_ids, ARRAY[]::text[]));

  IF v_suspended_patient_ids IS NOT NULL AND array_length(v_suspended_patient_ids, 1) > 0 THEN
    UPDATE public.patients
    SET suspended_at = now()
    WHERE id = ANY(v_suspended_patient_ids);

    GET DIAGNOSTICS v_suspended_patients = ROW_COUNT;

    -- Cancella subito gli eventi futuri dei pazienti sospesi
    DELETE FROM public.events
    WHERE patient_id = ANY(v_suspended_patient_ids)
      AND status = 'scheduled'
      AND scheduled_at >= now();
  END IF;

  -- 2. Terapie dei pazienti mantenuti
  IF v_therapy_limit >= 0 THEN
    FOR v_patient_id IN
      SELECT id FROM public.patients
      WHERE owner_user_id = v_uid
        AND suspended_at IS NULL
        AND id = ANY(COALESCE(_keep_patient_ids, ARRAY[]::text[]))
    LOOP
      v_keep_therapy_arr := ARRAY(
        SELECT jsonb_array_elements_text(
          COALESCE(_keep_therapy_ids->v_patient_id, '[]'::jsonb)
        )
      );

      -- Sospendi terapie non incluse
      UPDATE public.therapies
      SET suspended_at     = now(),
          suspended_reason = 'downgrade',
          suspended        = true,
          active           = false
      WHERE patient_id    = v_patient_id
        AND suspended_at IS NULL
        AND id <> ALL(v_keep_therapy_arr);

      GET DIAGNOSTICS v_suspended_therapies = ROW_COUNT;

      -- Cancella gli eventi futuri delle terapie sospese
      DELETE FROM public.events
      WHERE therapy_id IN (
        SELECT id FROM public.therapies
        WHERE patient_id = v_patient_id
          AND suspended_reason = 'downgrade'
          AND suspended_at >= (now() - interval '5 seconds')
      )
      AND status = 'scheduled'
      AND scheduled_at >= now();
    END LOOP;
  END IF;

  -- 3. Caregiver sui pazienti mantenuti
  IF v_caregiver_extra_limit = 0 THEN
    -- In Free nessun caregiver extra consentito
    UPDATE public.caregiver_patients cp
    SET suspended_at = now()
    FROM public.patients p
    WHERE cp.patient_id = p.id
      AND p.owner_user_id = v_uid
      AND p.id = ANY(COALESCE(_keep_patient_ids, ARRAY[]::text[]))
      AND cp.caregiver_id <> v_uid
      AND cp.suspended_at IS NULL;

    GET DIAGNOSTICS v_suspended_caregivers = ROW_COUNT;
  ELSE
    -- Passaggio con caregiver extra consentiti (es. Max -> Pro, 4 consentiti)
    FOR v_patient_id IN
      SELECT id FROM public.patients
      WHERE owner_user_id = v_uid
        AND id = ANY(COALESCE(_keep_patient_ids, ARRAY[]::text[]))
    LOOP
      IF _keep_caregiver_ids ? v_patient_id THEN
        v_keep_caregiver_arr := ARRAY(
          SELECT jsonb_array_elements_text(_keep_caregiver_ids->v_patient_id)::uuid
        );

        UPDATE public.caregiver_patients
        SET suspended_at = now()
        WHERE patient_id = v_patient_id
          AND caregiver_id <> v_uid
          AND suspended_at IS NULL
          AND caregiver_id <> ALL(v_keep_caregiver_arr);
      ELSE
        -- Fallback: tieni i v_caregiver_extra_limit più vecchi
        UPDATE public.caregiver_patients
        SET suspended_at = now()
        WHERE patient_id = v_patient_id
          AND caregiver_id <> v_uid
          AND suspended_at IS NULL
          AND caregiver_id NOT IN (
            SELECT caregiver_id
            FROM public.caregiver_patients
            WHERE patient_id = v_patient_id
              AND caregiver_id <> v_uid
              AND suspended_at IS NULL
            ORDER BY created_at ASC
            LIMIT v_caregiver_extra_limit
          );
      END IF;

      v_suspended_caregivers := v_suspended_caregivers + (
        SELECT count(*) FROM public.caregiver_patients
        WHERE patient_id = v_patient_id
          AND suspended_at >= (now() - interval '5 seconds')
      );
    END LOOP;
  END IF;

  -- 4. Aggiorna il piano del profilo (il trigger DB propagherà il piano ai membri)
  UPDATE public.profiles
  SET subscription_plan_own = _new_plan
  WHERE id = v_uid;

  RETURN jsonb_build_object(
    'ok',                   true,
    'new_plan',             _new_plan,
    'suspended_patients',   v_suspended_patients,
    'suspended_therapies',  v_suspended_therapies,
    'suspended_caregivers', v_suspended_caregivers,
    'cleanup_after_days',   30
  );
END;
$$;

ALTER FUNCTION public.perform_downgrade(text, text[], jsonb, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.perform_downgrade(text, text[], jsonb, jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.perform_downgrade(text, text[], jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_cascade_plan_on_own_plan_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r RECORD;
  v_old_order int;
  v_new_order int;
BEGIN
  IF NEW.subscription_plan_own IS DISTINCT FROM OLD.subscription_plan_own THEN
    v_old_order := CASE COALESCE(OLD.subscription_plan_own, 'free') WHEN 'free' THEN 0 WHEN 'pro' THEN 1 WHEN 'max' THEN 2 ELSE 0 END;
    v_new_order := CASE COALESCE(NEW.subscription_plan_own, 'free') WHEN 'free' THEN 0 WHEN 'pro' THEN 1 WHEN 'max' THEN 2 ELSE 0 END;

    -- Il piano effettivo va aggiornato PRIMA del ripristino: i trigger sui
    -- limiti (check_therapy_limit, ...) leggono subscription_plan, che altrimenti
    -- sarebbe ancora quello vecchio e bloccherebbe il ripristino.
    PERFORM public.sync_effective_plan(NEW.id);

    -- Se è un UPGRADE, ripristina i record sospesi durante il downgrade
    IF v_new_order > v_old_order THEN
      -- Ripristina pazienti sospesi
      UPDATE public.patients
      SET suspended_at = NULL
      WHERE owner_user_id = NEW.id
        AND suspended_at IS NOT NULL;

      -- Ripristina terapie sospese per downgrade
      UPDATE public.therapies t
      SET suspended_at     = NULL,
          suspended_reason = NULL,
          suspended        = false,
          active           = true
      FROM public.patients p
      WHERE t.patient_id = p.id
        AND p.owner_user_id = NEW.id
        AND t.suspended_reason = 'downgrade';

      -- Ripristina caregiver sospesi
      UPDATE public.caregiver_patients cp
      SET suspended_at = NULL
      FROM public.patients p
      WHERE cp.patient_id = p.id
        AND p.owner_user_id = NEW.id
        AND cp.suspended_at IS NOT NULL;
    END IF;

    -- Propaga il piano effettivo a tutti i collegati
    PERFORM public.sync_effective_plan(NEW.id);

    FOR r IN
      SELECT DISTINCT cp.caregiver_id AS uid
      FROM public.caregiver_patients cp
      JOIN public.patients p ON p.id = cp.patient_id
      WHERE COALESCE(p.owner_user_id, p.primary_caregiver_id) = NEW.id
        AND cp.caregiver_id <> NEW.id
    LOOP
      PERFORM public.sync_effective_plan(r.uid);
    END LOOP;

    FOR r IN
      SELECT p.user_id AS uid
      FROM public.patients p
      WHERE COALESCE(p.owner_user_id, p.primary_caregiver_id) = NEW.id
        AND p.user_id IS NOT NULL
        AND p.user_id <> NEW.id
    LOOP
      PERFORM public.sync_effective_plan(r.uid);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.trg_cascade_plan_on_own_plan_change() OWNER TO postgres;