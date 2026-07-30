-- =====================================================================
--  MIGRATION_famiglia_audit_log.sql  (v2 — "solo ciò che serve")
--  Registro attività (audit log) sicurezza + GDPR attorno a un paziente.
--
--  PRINCIPIO: si registra SOLO ciò che è necessario per sicurezza e
--  accountability GDPR (art. 5.2 / 32), niente cronaca clinica.
--
--  REGISTRATO (eventi rari, alto valore):
--    - therapy_created / therapy_updated / therapy_deleted  (dato sanitario)
--    - member_added / member_removed                        (accesso ai dati)
--    - primary_changed                                      (privilegi)
--    - invite_created / invite_redeemed                     (accesso ai dati)
--    - patient_viewed                                       (accesso, max 1/24h per utente)
--    - data_exported / account_deleted                      (diritti GDPR)
--
--  NON registrato (rumore ad alto volume, già presente in `events`):
--    - conferme/rimandi/salti/dimenticanze delle dosi
--    - variazioni automatiche di scorte (pills_remaining)
--
--  EGRESS: tutte le scritture avvengono da trigger SECURITY DEFINER lato
--  DB (zero traffico client). Il client legge solo la pagina "Gruppo di
--  lavoro", paginata. Retention 180 giorni.
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

-- Indice mirato per il dedup degli accessi (patient_viewed): evita scan
-- sull'intera tabella ad ogni apertura di scheda paziente.
CREATE INDEX IF NOT EXISTS idx_audit_log_view_dedup
  ON public.audit_log (patient_id, actor_id, created_at DESC)
  WHERE action = 'patient_viewed';

-- Bonifica completa per audit_log preesistenti/legacy:
-- - vecchie colonne tecniche (es. table_name) non devono bloccare i nuovi log
-- - vecchi CHECK su action non devono rifiutare le nuove azioni
-- - meta/summary/action/created_at devono avere default sicuri
DO $$
DECLARE r record;
BEGIN
  UPDATE public.audit_log
    SET action = coalesce(action, 'legacy_event'),
        summary = coalesce(summary, 'Evento registrato'),
        meta = coalesce(meta, '{}'::jsonb),
        created_at = coalesce(created_at, now());

  FOR r IN
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='audit_log'
      AND is_nullable='NO'
      AND column_name NOT IN ('id','action','summary','meta','created_at')
  LOOP
    EXECUTE format('ALTER TABLE public.audit_log ALTER COLUMN %I DROP NOT NULL', r.column_name);
  END LOOP;

  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'audit_log'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%action%'
  LOOP
    EXECUTE format('ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.audit_log ALTER COLUMN action SET DEFAULT 'legacy_event';
ALTER TABLE public.audit_log ALTER COLUMN action SET NOT NULL;
ALTER TABLE public.audit_log ALTER COLUMN summary SET DEFAULT 'Evento registrato';
ALTER TABLE public.audit_log ALTER COLUMN summary SET NOT NULL;
ALTER TABLE public.audit_log ALTER COLUMN meta SET DEFAULT '{}'::jsonb;
ALTER TABLE public.audit_log ALTER COLUMN meta SET NOT NULL;
ALTER TABLE public.audit_log ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.audit_log ALTER COLUMN created_at SET NOT NULL;

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
-- Nessuna policy INSERT/UPDATE/DELETE: l'audit si scrive solo via funzioni
-- SECURITY DEFINER (bypassano RLS) → i client non possono manomettere lo storico.

-- 3) HELPER: nome umano di un utente -----------------------------------
CREATE OR REPLACE FUNCTION public.audit_actor_name(_uid uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(nullif(trim(name), ''), email, 'Utente')
  FROM public.profiles WHERE id = _uid
$$;

-- 4) TRIGGER: therapies (dato sanitario — INSERT / UPDATE / DELETE) ----
--    Le variazioni automatiche di scorte NON vengono registrate.
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
    IF NEW.name      IS DISTINCT FROM OLD.name      THEN v_changed := v_changed || jsonb_build_object('nome',     jsonb_build_array(OLD.name,      NEW.name)); END IF;
    IF NEW.dosage    IS DISTINCT FROM OLD.dosage    THEN v_changed := v_changed || jsonb_build_object('dosaggio', jsonb_build_array(OLD.dosage,    NEW.dosage)); END IF;
    IF NEW.quantity  IS DISTINCT FROM OLD.quantity  THEN v_changed := v_changed || jsonb_build_object('quantità', jsonb_build_array(OLD.quantity,  NEW.quantity)); END IF;
    IF NEW.times     IS DISTINCT FROM OLD.times     THEN v_changed := v_changed || jsonb_build_object('orari',    jsonb_build_array(OLD.times,     NEW.times)); END IF;
    IF NEW.suspended IS DISTINCT FROM OLD.suspended THEN v_changed := v_changed || jsonb_build_object('sospesa',  jsonb_build_array(OLD.suspended, NEW.suspended)); END IF;
    IF NEW.active    IS DISTINCT FROM OLD.active    THEN v_changed := v_changed || jsonb_build_object('attiva',   jsonb_build_array(OLD.active,    NEW.active)); END IF;
    IF NEW.end_date  IS DISTINCT FROM OLD.end_date  THEN v_changed := v_changed || jsonb_build_object('fine',     jsonb_build_array(OLD.end_date,  NEW.end_date)); END IF;
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
-- UPDATE limitato alle sole colonne "di merito": un cambio di
-- pills_remaining (scorte, molto frequente) non sveglia nemmeno il trigger.
CREATE TRIGGER trg_audit_therapies
AFTER INSERT OR DELETE OR UPDATE OF name, dosage, quantity, times, suspended, active, end_date
ON public.therapies
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_therapies();

-- 5) NIENTE audit sulle dosi -------------------------------------------
--    Le conferme/rimandi/salti sono cronaca clinica ad alto volume, già
--    tracciata in public.events: registrarla di nuovo raddoppierebbe
--    scritture e storage senza valore per sicurezza/GDPR.
DROP TRIGGER IF EXISTS trg_audit_events ON public.events;
DROP FUNCTION IF EXISTS public.trg_audit_events();

-- Pulizia dello storico già accumulato con la versione precedente
DELETE FROM public.audit_log WHERE action LIKE 'dose_%';

-- 6) TRIGGER: membri del gruppo (chi ha accesso ai dati) ---------------
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
            v_member || ' ha ottenuto accesso ai dati del paziente');
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

-- 7) TRIGGER: inviti (creazione + utilizzo) ---------------------------
CREATE OR REPLACE FUNCTION public.trg_audit_family_invites()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_name text; v_user text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_name := coalesce(public.audit_actor_name(NEW.created_by), 'Un caregiver');
    INSERT INTO public.audit_log(patient_id, actor_id, actor_name, action, entity_type, entity_id, summary)
    VALUES (NEW.patient_id, NEW.created_by, v_name, 'invite_created', 'invite', NEW.id::text,
            v_name || ' ha generato un codice invito');
  ELSIF NEW.used_by IS NOT NULL AND OLD.used_by IS DISTINCT FROM NEW.used_by THEN
    v_user := coalesce(public.audit_actor_name(NEW.used_by), 'Un utente');
    INSERT INTO public.audit_log(patient_id, actor_id, actor_name, action, entity_type, entity_id, summary)
    VALUES (NEW.patient_id, NEW.used_by, v_user, 'invite_redeemed', 'invite', NEW.id::text,
            v_user || ' ha utilizzato un codice invito');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_audit_family_invites ON public.family_invites;
CREATE TRIGGER trg_audit_family_invites
AFTER INSERT OR UPDATE OF used_by ON public.family_invites
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_family_invites();

-- 8) TRIGGER: cambio caregiver principale (privilegi) ------------------
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

-- 9) RPC: log_patient_view — accesso ai dati sanitari ------------------
--    Dedup 24h per (paziente, attore): una riga al giorno per utente,
--    sufficiente a dimostrare "chi ha consultato cosa" senza gonfiare
--    tabella ed egress.
CREATE OR REPLACE FUNCTION public.log_patient_view(_patient_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_recent boolean;
BEGIN
  IF auth.uid() IS NULL OR _patient_id IS NULL THEN RETURN; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.audit_log
    WHERE patient_id = _patient_id
      AND actor_id   = auth.uid()
      AND action     = 'patient_viewed'
      AND created_at > now() - interval '24 hours'
  ) INTO v_recent;
  IF v_recent THEN RETURN; END IF;

  INSERT INTO public.audit_log(patient_id, actor_id, actor_name, action, entity_type, entity_id, summary)
  VALUES (_patient_id, auth.uid(),
          coalesce(public.audit_actor_name(auth.uid()), 'Utente'),
          'patient_viewed', 'patient', _patient_id,
          coalesce(public.audit_actor_name(auth.uid()), 'Utente') || ' ha consultato i dati del paziente');
END; $$;

REVOKE ALL ON FUNCTION public.log_patient_view(text) FROM public;
GRANT EXECUTE ON FUNCTION public.log_patient_view(text) TO authenticated;

-- 10) RPC: eventi GDPR (export dati / cancellazione account) ----------
--     Da chiamare dalle rispettive RPC GDPR o dal client dopo l'azione.
CREATE OR REPLACE FUNCTION public.log_gdpr_event(_action text, _patient_id text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_name text; v_summary text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  IF _action NOT IN ('data_exported','account_deleted') THEN RETURN; END IF;
  v_name := coalesce(public.audit_actor_name(auth.uid()), 'Utente');
  v_summary := CASE _action
    WHEN 'data_exported'   THEN v_name || ' ha esportato i propri dati (portabilità GDPR)'
    ELSE                        v_name || ' ha richiesto la cancellazione dell''account'
  END;
  INSERT INTO public.audit_log(patient_id, actor_id, actor_name, action, entity_type, entity_id, summary)
  VALUES (_patient_id, auth.uid(), v_name, _action, 'account', auth.uid()::text, v_summary);
END; $$;

REVOKE ALL ON FUNCTION public.log_gdpr_event(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.log_gdpr_event(text, text) TO authenticated;

-- 11) CLEANUP periodico (retention 180 giorni) ------------------------
CREATE OR REPLACE FUNCTION public.cleanup_audit_log()
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path = public AS $$
  DELETE FROM public.audit_log WHERE created_at < now() - interval '180 days';
$$;

-- Suggerito: pianificare la pulizia con pg_cron (una volta al giorno).
-- Se pg_cron è disponibile nel tuo progetto Supabase:
--
--   SELECT cron.schedule('audit_log_cleanup', '0 3 * * *',
--     $$SELECT public.cleanup_audit_log();$$);
