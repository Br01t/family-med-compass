-- =====================================================================
--  MIGRATION_famiglia_audit_log.sql
--  Registro attività (audit log) della "famiglia" attorno a un paziente
--  + RPC log_patient_view (già usato da src/lib/supabase-service.ts)
--  + Cleanup periodico
--
--  OBIETTIVO EGRESS:
--    - Tutti gli inserimenti nell'audit avvengono lato DB tramite trigger
--      SECURITY DEFINER → zero traffico client per la registrazione.
--    - Il client legge solo la lista paginata quando l'utente apre la
--      schermata "Gruppo di lavoro".
--    - Retention 90 giorni (cron giornaliero).
-- =====================================================================

-- 1) TABELLA -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   text REFERENCES public.patients(id) ON DELETE CASCADE,
  actor_id     uuid,
  actor_name   text,
  action       text NOT NULL,
  entity_type  text,
  entity_id    text,
  summary      text NOT NULL,
  meta         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Se la tabella esisteva già con schema diverso, aggiungi le colonne mancanti
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS actor_id    uuid;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS actor_name  text;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS entity_type text;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS entity_id   text;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS summary     text;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS meta        jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS patient_id  text;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS action      text;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS created_at  timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_audit_log_patient_created
  ON public.audit_log (patient_id, created_at DESC);

-- 2) GRANTS + RLS ------------------------------------------------------
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL    ON public.audit_log TO service_role;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit: read linked" ON public.audit_log;
CREATE POLICY "audit: read linked" ON public.audit_log
FOR SELECT TO authenticated
USING (
  patient_id IS NULL OR EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = audit_log.patient_id
      AND (
        p.user_id = auth.uid()
        OR p.owner_user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.caregiver_patients cp
          WHERE cp.patient_id = p.id AND cp.caregiver_id = auth.uid()
        )
      )
  )
);
-- Nessuna policy INSERT/UPDATE/DELETE: l'audit si scrive solo via trigger
-- SECURITY DEFINER (bypassa RLS) → i client non possono manomettere lo storico.

-- 3) HELPER: nome umano di un utente -----------------------------------
CREATE OR REPLACE FUNCTION public.audit_actor_name(_uid uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(nullif(trim(name), ''), email, 'Utente')
  FROM public.profiles WHERE id = _uid
$$;

-- 4) TRIGGER: therapies (INSERT / UPDATE / DELETE) ---------------------
CREATE OR REPLACE FUNCTION public.trg_audit_therapies()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_name  text := coalesce(public.audit_actor_name(auth.uid()), 'Sistema');
  v_changed jsonb := '{}'::jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log(patient_id, actor_id, actor_name, action, entity_type, entity_id, summary)
    VALUES (NEW.patient_id, v_actor, v_name, 'therapy_created', 'therapy', NEW.id,
            v_name || ' ha aggiunto la terapia "' || NEW.name || '"');
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.dosage         IS DISTINCT FROM OLD.dosage         THEN v_changed := v_changed || jsonb_build_object('dosaggio', jsonb_build_array(OLD.dosage,         NEW.dosage)); END IF;
    IF NEW.quantity       IS DISTINCT FROM OLD.quantity       THEN v_changed := v_changed || jsonb_build_object('quantità', jsonb_build_array(OLD.quantity,       NEW.quantity)); END IF;
    IF NEW.times          IS DISTINCT FROM OLD.times          THEN v_changed := v_changed || jsonb_build_object('orari',    jsonb_build_array(OLD.times,          NEW.times)); END IF;
    IF NEW.suspended      IS DISTINCT FROM OLD.suspended      THEN v_changed := v_changed || jsonb_build_object('sospesa',  jsonb_build_array(OLD.suspended,      NEW.suspended)); END IF;
    IF NEW.pills_remaining IS DISTINCT FROM OLD.pills_remaining THEN v_changed := v_changed || jsonb_build_object('scorte',jsonb_build_array(OLD.pills_remaining, NEW.pills_remaining)); END IF;
    IF v_changed = '{}'::jsonb THEN RETURN NEW; END IF;
    INSERT INTO public.audit_log(patient_id, actor_id, actor_name, action, entity_type, entity_id, summary, meta)
    VALUES (NEW.patient_id, v_actor, v_name, 'therapy_updated', 'therapy', NEW.id,
            v_name || ' ha modificato la terapia "' || NEW.name || '"', v_changed);
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log(patient_id, actor_id, actor_name, action, entity_type, entity_id, summary)
    VALUES (OLD.patient_id, v_actor, v_name, 'therapy_deleted', 'therapy', OLD.id,
            v_name || ' ha eliminato la terapia "' || OLD.name || '"');
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_audit_therapies ON public.therapies;
CREATE TRIGGER trg_audit_therapies
AFTER INSERT OR UPDATE OR DELETE ON public.therapies
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_therapies();

-- 5) TRIGGER: events (cambi di stato dose) -----------------------------
CREATE OR REPLACE FUNCTION public.trg_audit_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_actor  uuid := auth.uid();
  v_name   text := coalesce(public.audit_actor_name(auth.uid()), 'Sistema');
  v_th     public.therapies%rowtype;
  v_hhmm   text;
  v_summary text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = COALESCE(OLD.status, '') THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('taken','snoozed','missed','skipped') THEN RETURN NEW; END IF;

  SELECT * INTO v_th FROM public.therapies WHERE id = NEW.therapy_id;
  v_hhmm := to_char(NEW.scheduled_at AT TIME ZONE 'Europe/Rome','HH24:MI');

  v_summary := CASE NEW.status
    WHEN 'taken'   THEN v_name || ' ha confermato ' || v_th.name || ' delle ' || v_hhmm
    WHEN 'snoozed' THEN v_name || ' ha rimandato ' || v_th.name || ' delle ' || v_hhmm
    WHEN 'skipped' THEN v_name || ' ha saltato ' || v_th.name || ' delle ' || v_hhmm
    WHEN 'missed'  THEN v_th.name || ' delle ' || v_hhmm || ' non è stata assunta (dimenticata)'
  END;

  INSERT INTO public.audit_log(patient_id, actor_id, actor_name, action, entity_type, entity_id, summary)
  VALUES (NEW.patient_id, v_actor, v_name, 'dose_' || NEW.status, 'event', NEW.id, v_summary);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_audit_events ON public.events;
CREATE TRIGGER trg_audit_events
AFTER INSERT OR UPDATE OF status ON public.events
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_events();

-- 6) TRIGGER: membri del gruppo (caregiver_patients) -------------------
CREATE OR REPLACE FUNCTION public.trg_audit_caregiver_patients()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_name  text := coalesce(public.audit_actor_name(auth.uid()), 'Sistema');
  v_member text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_member := coalesce(public.audit_actor_name(NEW.caregiver_id), 'Un caregiver');
    INSERT INTO public.audit_log(patient_id, actor_id, actor_name, action, entity_type, entity_id, summary)
    VALUES (NEW.patient_id, v_actor, v_name, 'member_added', 'caregiver', NEW.caregiver_id::text,
            v_member || ' è entrato nel gruppo di cura');
  ELSIF TG_OP = 'DELETE' THEN
    v_member := coalesce(public.audit_actor_name(OLD.caregiver_id), 'Un caregiver');
    INSERT INTO public.audit_log(patient_id, actor_id, actor_name, action, entity_type, entity_id, summary)
    VALUES (OLD.patient_id, v_actor, v_name, 'member_removed', 'caregiver', OLD.caregiver_id::text,
            CASE WHEN v_actor = OLD.caregiver_id
                 THEN v_member || ' ha lasciato il gruppo'
                 ELSE v_member || ' è stato rimosso dal gruppo' END);
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_audit_caregiver_patients ON public.caregiver_patients;
CREATE TRIGGER trg_audit_caregiver_patients
AFTER INSERT OR DELETE ON public.caregiver_patients
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_caregiver_patients();

-- 7) TRIGGER: creazione codici invito ---------------------------------
CREATE OR REPLACE FUNCTION public.trg_audit_family_invites()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_name text;
BEGIN
  v_name := coalesce(public.audit_actor_name(NEW.created_by), 'Un caregiver');
  INSERT INTO public.audit_log(patient_id, actor_id, actor_name, action, entity_type, entity_id, summary)
  VALUES (NEW.patient_id, NEW.created_by, v_name, 'invite_created', 'invite', NEW.id::text,
          v_name || ' ha generato un codice invito');
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_audit_family_invites ON public.family_invites;
CREATE TRIGGER trg_audit_family_invites
AFTER INSERT ON public.family_invites
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_family_invites();

-- 8) TRIGGER: cambio caregiver principale -----------------------------
CREATE OR REPLACE FUNCTION public.trg_audit_patient_primary()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_name  text := coalesce(public.audit_actor_name(auth.uid()), 'Sistema');
  v_new   text;
BEGIN
  IF NEW.primary_caregiver_id IS DISTINCT FROM OLD.primary_caregiver_id THEN
    v_new := coalesce(public.audit_actor_name(NEW.primary_caregiver_id), '—');
    INSERT INTO public.audit_log(patient_id, actor_id, actor_name, action, entity_type, entity_id, summary)
    VALUES (NEW.id, v_actor, v_name, 'primary_changed', 'patient', NEW.id,
            v_name || ' ha nominato ' || v_new || ' caregiver principale');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_audit_patient_primary ON public.patients;
CREATE TRIGGER trg_audit_patient_primary
AFTER UPDATE OF primary_caregiver_id ON public.patients
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_patient_primary();

-- 9) RPC: log_patient_view (già usata dal client) ---------------------
CREATE OR REPLACE FUNCTION public.log_patient_view(_patient_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_recent boolean;
BEGIN
  IF auth.uid() IS NULL OR _patient_id IS NULL THEN RETURN; END IF;

  -- Dedup lato server: max 1 riga per (paziente, attore) ogni 30 minuti.
  SELECT EXISTS (
    SELECT 1 FROM public.audit_log
    WHERE patient_id = _patient_id
      AND actor_id   = auth.uid()
      AND action     = 'patient_viewed'
      AND created_at > now() - interval '30 minutes'
  ) INTO v_recent;
  IF v_recent THEN RETURN; END IF;

  INSERT INTO public.audit_log(patient_id, actor_id, actor_name, action, entity_type, entity_id, summary)
  VALUES (_patient_id, auth.uid(),
          coalesce(public.audit_actor_name(auth.uid()), 'Utente'),
          'patient_viewed', 'patient', _patient_id,
          coalesce(public.audit_actor_name(auth.uid()), 'Utente') || ' ha aperto la scheda paziente');
END; $$;

REVOKE ALL ON FUNCTION public.log_patient_view(text) FROM public;
GRANT EXECUTE ON FUNCTION public.log_patient_view(text) TO authenticated;

-- 10) CLEANUP periodico (retention 90 giorni) -------------------------
CREATE OR REPLACE FUNCTION public.cleanup_audit_log()
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path = public AS $$
  DELETE FROM public.audit_log WHERE created_at < now() - interval '90 days';
$$;

-- Suggerito: pianificare la pulizia con pg_cron (una volta al giorno).
-- Se pg_cron è disponibile nel tuo progetto Supabase:
--
--   SELECT cron.schedule('audit_log_cleanup', '0 3 * * *',
--     $$SELECT public.cleanup_audit_log();$$);
