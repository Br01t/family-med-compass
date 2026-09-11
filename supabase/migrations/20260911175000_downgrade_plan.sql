-- ============================================================
-- DOWNGRADE PIANO DI ABBONAMENTO
-- Strategia: i dati in eccesso vengono sospesi (suspended_at) e
-- rimangono conservati per 30 giorni (1 mese). Durante questo periodo
-- l'utente può fare re-upgrade e ritrovarli tutti intatti.
-- Dopo 30 giorni un cron job leggero elimina i dati in eccesso.
-- I caregiver in eccesso perdono l'accesso tramite RLS (suspended_at).
-- Tutto ottimizzato al massimo per restare nel piano Free di Supabase:
--   - 1 RPC read-only per il controllo di fattibilità e impatto (check_downgrade_impact)
--   - 1 RPC transazionale atomica per eseguire il downgrade (perform_downgrade)
--   - Cancellazione immediata di scheduled events futuri per evitare carichi sul scheduler
--   - process_dose_schedule() protetto per non generare notifiche o broadcast realtime inutili
--   - Re-upgrade automatico trasparente integrato nel trigger dei piani
--   - Pulizia automatica eventi > 30gg per il piano Free per non saturare lo storage di 500MB
-- ============================================================

-- ============================================================
-- 1. SCHEMA: colonne di sospensione
-- ============================================================

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.patients.suspended_at IS
  'Impostato dal downgrade del piano. Il paziente resta nel DB per 30 giorni (leggibile solo dal titolare), poi viene eliminato dal cron downgrade-suspended-patients-cleanup.';

ALTER TABLE public.therapies
  ADD COLUMN IF NOT EXISTS suspended_at   timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS suspended_reason text        DEFAULT NULL;

COMMENT ON COLUMN public.therapies.suspended_at IS
  'Impostato dal downgrade (terapie in eccesso). Eliminata dopo 30 giorni dal cron downgrade-suspended-therapies-cleanup.';
COMMENT ON COLUMN public.therapies.suspended_reason IS
  'Motivo della sospensione: "downgrade" oppure NULL per sospensioni manuali.';

ALTER TABLE public.caregiver_patients
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.caregiver_patients.suspended_at IS
  'Impostato dal downgrade (caregiver in eccesso). Il caregiver perde accesso via RLS ma può rientrare se il titolare fa upgrade entro 30 giorni.';


-- ============================================================
-- 2. FUNZIONI HELPER & FUNZIONI BASE AGGIORNATE
-- ============================================================

-- Helper: il paziente è sospeso?
CREATE OR REPLACE FUNCTION public.patient_is_suspended(_patient_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT suspended_at IS NOT NULL
  FROM public.patients
  WHERE id = _patient_id
  LIMIT 1
$$;

ALTER FUNCTION public.patient_is_suspended(text) OWNER TO postgres;

-- Aggiornamento is_caregiver_of per escludere caregiver e pazienti sospesi
CREATE OR REPLACE FUNCTION public.is_caregiver_of("_patient_id" text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.caregiver_patients cp
    JOIN public.patients p ON p.id = cp.patient_id
    WHERE cp.patient_id = _patient_id
      AND cp.caregiver_id = auth.uid()
      AND cp.suspended_at IS NULL
      AND p.suspended_at IS NULL
  );
$$;

ALTER FUNCTION public.is_caregiver_of(text) OWNER TO postgres;


-- Aggiornamento check_therapy_limit: non contare le terapie sospese da downgrade
CREATE OR REPLACE FUNCTION public.check_therapy_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_plan text;
  v_active_count int;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.active = false OR OLD.active = NEW.active) THEN
    RETURN NEW;
  END IF;

  v_plan := public.get_patient_owner_plan(NEW.patient_id);

  IF v_plan IN ('pro', 'max') THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_active_count
  FROM public.therapies
  WHERE patient_id = NEW.patient_id
    AND active = true
    AND suspended_at IS NULL;

  IF v_active_count >= 3 THEN
    RAISE EXCEPTION 'Limite di 3 terapie attive raggiunto per il piano Free. Passa a Pro o Max per terapie illimitate.';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.check_therapy_limit() OWNER TO postgres;


-- ============================================================
-- 3. AGGIORNAMENTO RLS
-- ============================================================

-- --- patients: silo read ---
DROP POLICY IF EXISTS "patients: silo read" ON public.patients;
CREATE POLICY "patients: silo read"
  ON public.patients FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR owner_user_id = auth.uid()
    OR public.is_caregiver_of(id)
  );

-- --- cp: family peers read ---
DROP POLICY IF EXISTS "cp: family peers read" ON public.caregiver_patients;
CREATE POLICY "cp: family peers read"
  ON public.caregiver_patients FOR SELECT TO authenticated
  USING (
    (caregiver_id = auth.uid() AND suspended_at IS NULL)
    OR public.owns_patient(patient_id)
    OR (public.is_caregiver_of(patient_id) AND suspended_at IS NULL)
  );

-- --- cp: read own ---
DROP POLICY IF EXISTS "cp: read own" ON public.caregiver_patients;
CREATE POLICY "cp: read own"
  ON public.caregiver_patients FOR SELECT TO authenticated
  USING (
    caregiver_id = auth.uid()
    OR public.owns_patient(patient_id)
  );

-- --- therapies: read linked ---
DROP POLICY IF EXISTS "therapies: read linked" ON public.therapies;
CREATE POLICY "therapies: read linked"
  ON public.therapies FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = therapies.patient_id
        AND (
          p.owner_user_id = auth.uid()
          OR (
            therapies.suspended_at IS NULL
            AND p.suspended_at IS NULL
            AND (
              p.user_id = auth.uid()
              OR public.is_caregiver_of(p.id)
            )
          )
        )
    )
  );

-- --- therapies: insert primary ---
DROP POLICY IF EXISTS "therapies: insert primary" ON public.therapies;
CREATE POLICY "therapies: insert primary"
  ON public.therapies FOR INSERT TO authenticated
  WITH CHECK (
    public.is_primary_of(patient_id)
    AND NOT public.patient_is_suspended(patient_id)
  );

-- --- therapies: update primary ---
DROP POLICY IF EXISTS "therapies: update primary" ON public.therapies;
CREATE POLICY "therapies: update primary"
  ON public.therapies FOR UPDATE TO authenticated
  USING (
    public.is_primary_of(patient_id)
    AND NOT public.patient_is_suspended(patient_id)
    AND therapies.suspended_at IS NULL
  )
  WITH CHECK (
    public.is_primary_of(patient_id)
    AND NOT public.patient_is_suspended(patient_id)
  );

-- --- events: read linked (con blocco storico >7gg per piano Free) ---
DROP POLICY IF EXISTS "events: read linked" ON public.events;
CREATE POLICY "events: read linked"
  ON public.events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = events.patient_id
        AND (
          p.owner_user_id = auth.uid()
          OR p.user_id = auth.uid()
          OR public.is_caregiver_of(p.id)
        )
    )
    AND (
      public.get_patient_owner_plan(events.patient_id) IN ('pro', 'max')
      OR events.scheduled_at >= (now() - interval '7 days')
    )
  );

-- --- events: update linked ---
DROP POLICY IF EXISTS "events: update linked" ON public.events;
CREATE POLICY "events: update linked"
  ON public.events FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = events.patient_id
        AND (
          p.owner_user_id = auth.uid()
          OR p.user_id = auth.uid()
          OR public.is_caregiver_of(p.id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = events.patient_id
        AND (
          p.owner_user_id = auth.uid()
          OR p.user_id = auth.uid()
          OR public.is_caregiver_of(p.id)
        )
    )
  );

-- --- notifications: read own or caregiver of patient ---
DROP POLICY IF EXISTS "notifications: read own or caregiver of patient" ON public.notifications;
CREATE POLICY "notifications: read own or caregiver of patient"
  ON public.notifications FOR SELECT TO authenticated
  USING (
    target_user_id = auth.uid()
    OR (
      patient_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.patients p
        WHERE p.id = notifications.patient_id
          AND (
            p.owner_user_id = auth.uid()
            OR p.user_id = auth.uid()
            OR public.is_caregiver_of(p.id)
          )
      )
    )
  );


-- ============================================================
-- 4. OTTIMIZZAZIONE GENERATORE DOSI: process_dose_schedule()
--    Ignora terapie e pazienti sospesi, non genera eventi inutili.
-- ============================================================

CREATE OR REPLACE FUNCTION public.process_dose_schedule()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
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
  -- 1) Generazione dosi future (-30min -> +24h) solo per terapie e pazienti ATTIVI e NON SOSPESI
  FOR v_therapy IN
    SELECT t.id, t.patient_id, t.times, t.recurrence, t.start_date, t.end_date
    FROM public.therapies t
    JOIN public.patients p ON p.id = t.patient_id
    WHERE t.active = true
      AND t.suspended = false
      AND t.suspended_at IS NULL
      AND p.suspended_at IS NULL
      AND t.times IS NOT NULL
      AND jsonb_array_length(t.times) > 0
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
          FOR v_time_str IN SELECT jsonb_array_elements_text(v_therapy.times) LOOP
            v_at := (v_curr_date || ' ' || v_time_str || ':00')::timestamptz;
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

  -- 2b) DUE
  FOR v_ev IN
    SELECT e.id, e.therapy_id, e.patient_id, e.scheduled_at,
           t.name AS therapy_name, t.dosage, t.quantity,
           p.user_id AS patient_user_id
    FROM public.events e
    JOIN public.therapies t ON t.id = e.therapy_id
    JOIN public.patients p ON p.id = e.patient_id
    WHERE e.status = 'scheduled'
      AND e.scheduled_at BETWEEN (v_now - interval '60 seconds') AND (v_now + interval '90 seconds')
      AND p.suspended_at IS NULL
      AND t.suspended_at IS NULL
      AND t.suspended = false
  LOOP
    UPDATE public.events SET stage = 'due' WHERE id = v_ev.id AND status = 'scheduled';

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

  -- 2c) REMINDER_POST
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
      AND p.suspended_at IS NULL
      AND t.suspended_at IS NULL
      AND t.suspended = false
  LOOP
    v_post_min := GREATEST(1, COALESCE(v_ev.post_reminder_minutes, 5));
    v_elapsed_min := extract(epoch from (v_now - v_ev.scheduled_at)) / 60.0;

    IF v_elapsed_min >= v_post_min AND v_elapsed_min <= (v_post_min + 2) THEN
      UPDATE public.events SET stage = 'reminder_post' WHERE id = v_ev.id AND status = 'scheduled';

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

  -- 2d) FINAL_DUE
  FOR v_ev IN
    SELECT e.id, e.therapy_id, e.patient_id, e.scheduled_at, e.stage, e.final_due_at,
           t.name AS therapy_name, p.user_id AS patient_user_id
    FROM public.events e
    JOIN public.therapies t ON t.id = e.therapy_id
    JOIN public.patients p ON p.id = e.patient_id
    WHERE e.status = 'snoozed'
      AND e.snoozed_until IS NOT NULL
      AND e.snoozed_until <= (v_now + interval '60 seconds')
      AND e.final_due_at IS NULL
      AND e.stage NOT IN ('final_due', 'missed')
      AND p.suspended_at IS NULL
      AND t.suspended_at IS NULL
      AND t.suspended = false
  LOOP
    UPDATE public.events SET stage = 'final_due', final_due_at = v_now WHERE id = v_ev.id AND status = 'snoozed';

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

  -- 2e) MISSED
  FOR v_ev IN
    SELECT e.id, e.therapy_id, e.patient_id, e.scheduled_at, e.snoozed_until, t.timeout_minutes
    FROM public.events e
    JOIN public.therapies t ON t.id = e.therapy_id
    JOIN public.patients p ON p.id = e.patient_id
    WHERE e.status IN ('scheduled', 'snoozed')
      AND e.scheduled_at <= (v_now - interval '5 minutes')
      AND p.suspended_at IS NULL
      AND t.suspended_at IS NULL
  LOOP
    v_timeout_min := COALESCE(v_ev.timeout_minutes, 10);
    v_hard_deadline := CASE
      WHEN v_ev.snoozed_until IS NOT NULL THEN v_ev.snoozed_until
      ELSE v_ev.scheduled_at + (v_timeout_min || ' minutes')::interval
    END;

    IF v_now >= v_hard_deadline THEN
      UPDATE public.events
      SET status = 'missed', stage = 'missed',
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

ALTER FUNCTION public.process_dose_schedule() OWNER TO postgres;


-- ============================================================
-- 5. RPC: check_downgrade_impact
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_downgrade_impact(_new_plan text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid              uuid := auth.uid();
  v_current_plan     text;
  v_plan_order       int;
  v_new_plan_order   int;
  v_patient_limit    int;
  v_therapy_limit    int;
  v_caregiver_extra_limit int;
  v_patients         jsonb;
  v_therapies_map    jsonb;
  v_caregivers_map   jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT subscription_plan_own INTO v_current_plan
  FROM public.profiles WHERE id = v_uid;

  v_current_plan := COALESCE(v_current_plan, 'free');

  v_plan_order := CASE v_current_plan WHEN 'free' THEN 0 WHEN 'pro' THEN 1 WHEN 'max' THEN 2 ELSE 0 END;
  v_new_plan_order := CASE _new_plan WHEN 'free' THEN 0 WHEN 'pro' THEN 1 WHEN 'max' THEN 2 ELSE 0 END;

  IF v_new_plan_order >= v_plan_order THEN
    RAISE EXCEPTION 'Not a downgrade: % -> %', v_current_plan, _new_plan;
  END IF;

  v_patient_limit := CASE _new_plan WHEN 'free' THEN 1 WHEN 'pro' THEN 2 WHEN 'max' THEN 10 ELSE 1 END;
  v_therapy_limit := CASE _new_plan WHEN 'free' THEN 3 ELSE -1 END;
  v_caregiver_extra_limit := CASE _new_plan WHEN 'free' THEN 0 WHEN 'pro' THEN 4 WHEN 'max' THEN 9 ELSE 0 END;

  -- Lista pazienti attivi di proprietà del titolare
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'birth_year', p.birth_year
    ) ORDER BY p.name
  )
  INTO v_patients
  FROM public.patients p
  WHERE p.owner_user_id = v_uid
    AND p.suspended_at IS NULL;

  -- Terapie attive per paziente
  IF v_therapy_limit >= 0 THEN
    SELECT jsonb_object_agg(
      p.id,
      (
        SELECT jsonb_agg(
          jsonb_build_object('id', t.id, 'name', t.name, 'active', t.active)
          ORDER BY t.active DESC, t.name
        )
        FROM public.therapies t
        WHERE t.patient_id = p.id
          AND t.suspended_at IS NULL
      )
    )
    INTO v_therapies_map
    FROM public.patients p
    WHERE p.owner_user_id = v_uid
      AND p.suspended_at IS NULL;
  ELSE
    v_therapies_map := '{}'::jsonb;
  END IF;

  -- Caregiver extra per paziente (escluso titolare)
  SELECT jsonb_object_agg(
    p.id,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', cp.caregiver_id::text,
          'name', COALESCE(cg.name, cp.caregiver_id::text)
        ) ORDER BY cp.created_at ASC
      )
      FROM public.caregiver_patients cp
      LEFT JOIN public.caregivers cg ON cg.id = cp.caregiver_id
      WHERE cp.patient_id = p.id
        AND cp.caregiver_id <> v_uid
        AND cp.suspended_at IS NULL
    ), '[]'::jsonb)
  )
  INTO v_caregivers_map
  FROM public.patients p
  WHERE p.owner_user_id = v_uid
    AND p.suspended_at IS NULL;

  RETURN jsonb_build_object(
    'current_plan',          v_current_plan,
    'new_plan',              _new_plan,
    'patient_limit',         v_patient_limit,
    'therapy_limit',         v_therapy_limit,
    'caregiver_extra_limit', v_caregiver_extra_limit,
    'patients',              COALESCE(v_patients, '[]'::jsonb),
    'therapies_per_patient', COALESCE(v_therapies_map, '{}'::jsonb),
    'caregivers_per_patient',COALESCE(v_caregivers_map, '{}'::jsonb)
  );
END;
$$;

ALTER FUNCTION public.check_downgrade_impact(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.check_downgrade_impact(text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_downgrade_impact(text) TO authenticated;


-- ============================================================
-- 6. RPC: perform_downgrade
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


-- ============================================================
-- 7. RE-UPGRADE TRIGGER: ripristino automatico entro 30 giorni
-- ============================================================

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
        AND cp.suspended_at IS NULL;
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


-- ============================================================
-- 8. CRON: cleanup notturno
-- ============================================================

-- Pazienti sospesi da > 30 giorni
SELECT cron.schedule(
  'downgrade-suspended-patients-cleanup',
  '10 3 * * *',
  $$
    DELETE FROM public.patients
    WHERE suspended_at IS NOT NULL
      AND suspended_at < now() - interval '30 days';
  $$
);

-- Terapie sospese da > 30 giorni
SELECT cron.schedule(
  'downgrade-suspended-therapies-cleanup',
  '12 3 * * *',
  $$
    DELETE FROM public.therapies
    WHERE suspended_at IS NOT NULL
      AND suspended_at < now() - interval '30 days'
      AND suspended_reason = 'downgrade';
  $$
);

-- Caregiver sospesi da > 30 giorni
SELECT cron.schedule(
  'downgrade-suspended-caregivers-cleanup',
  '14 3 * * *',
  $$
    DELETE FROM public.caregiver_patients
    WHERE suspended_at IS NOT NULL
      AND suspended_at < now() - interval '30 days';
  $$
);

-- Pulizia storico eventi > 30 giorni per utenti del piano Free (risparmio storage 500MB)
SELECT cron.schedule(
  'free-events-cleanup-daily',
  '16 3 * * *',
  $$
    DELETE FROM public.events
    WHERE scheduled_at < now() - interval '30 days'
      AND public.get_patient_owner_plan(patient_id) = 'free';
  $$
);


-- ============================================================
-- 9. INDICI per le nuove colonne e query di cron
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_patients_suspended_at
  ON public.patients (suspended_at)
  WHERE suspended_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_therapies_suspended
  ON public.therapies (suspended_at, patient_id)
  WHERE suspended_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_caregiver_patients_suspended
  ON public.caregiver_patients (suspended_at, caregiver_id)
  WHERE suspended_at IS NOT NULL;
