


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";








ALTER SCHEMA "public" OWNER TO "postgres";


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."app_role" AS ENUM (
    'caregiver',
    'paziente'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_audit_row_capture"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_patient_id text;
  v_record_id text;
  v_old jsonb := '{}'::jsonb;
  v_new jsonb := '{}'::jsonb;
  v_changed text[];
  v_detail jsonb;
  -- Solo questi campi (piccoli e significativi) vengono salvati con
  -- valore prima/dopo. Tutto il resto compare solo come nome campo
  -- in changed_fields, senza contenuto.
  v_allowlist text[] := ARRAY[
    'name', 'dosage', 'quantity', 'category', 'active', 'suspended',
    'start_date', 'end_date', 'status', 'confirmed_by',
    'primary_caregiver_id', 'owner_user_id', 'user_id', 'birth_year'
  ];
  -- Colonne che cambiano per effetto di automatismi di sistema
  -- (non azioni umane) e che sono già tracciate altrove: se sono
  -- le UNICHE a cambiare, non si scrive nessuna riga.
  v_noise_only text[] := ARRAY['pills_remaining'];
  v_key text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  ELSE
    v_new := to_jsonb(NEW);
  END IF;

  IF TG_TABLE_NAME = 'patients' THEN
    v_record_id := COALESCE(NEW.id, OLD.id);
    v_patient_id := v_record_id;
  ELSIF TG_TABLE_NAME IN ('therapies', 'events') THEN
    v_record_id := COALESCE(NEW.id, OLD.id);
    v_patient_id := COALESCE(NEW.patient_id, OLD.patient_id);
  ELSIF TG_TABLE_NAME = 'caregiver_patients' THEN
    v_patient_id := COALESCE(NEW.patient_id, OLD.patient_id);
    v_record_id := COALESCE(NEW.caregiver_id, OLD.caregiver_id)::text || ':' || v_patient_id;
  ELSE
    v_record_id := COALESCE((to_jsonb(COALESCE(NEW, OLD)) ->> 'id'), 'unknown');
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(k ORDER BY k) INTO v_changed
    FROM jsonb_object_keys(v_new) AS k
    WHERE (v_new -> k) IS DISTINCT FROM (v_old -> k);

    IF v_changed IS NULL THEN
      RETURN COALESCE(NEW, OLD); -- nessun campo realmente cambiato: non scrivere nulla
    END IF;

    IF v_changed <@ v_noise_only THEN
      RETURN COALESCE(NEW, OLD); -- solo automatismi di sistema (es. scarico magazzino): skip
    END IF;

    v_detail := '{}'::jsonb;
    FOREACH v_key IN ARRAY v_changed LOOP
      IF v_key = ANY (v_allowlist) THEN
        v_detail := v_detail || jsonb_build_object(
          v_key, jsonb_build_object('da', v_old -> v_key, 'a', v_new -> v_key)
        );
      END IF;
      -- campi fuori allowlist: restano solo in changed_fields, senza valore
    END LOOP;
    IF v_detail = '{}'::jsonb THEN
      v_detail := NULL;
    END IF;
  ELSE
    -- INSERT/DELETE: nessun dump di riga, il contenuto è già nella
    -- tabella (o non lo è più, per le DELETE). Evita di duplicare
    -- dati sanitari nel log.
    v_detail := NULL;
  END IF;

  INSERT INTO public.audit_log (patient_id, table_name, record_id, action, actor_id, changed_fields, detail)
  VALUES (v_patient_id, TG_TABLE_NAME, v_record_id, TG_OP, auth.uid(), v_changed, v_detail);

  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."_audit_row_capture"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_get_notes_encryption_key"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public, vault'
    AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'therapy_notes_key' LIMIT 1;
$$;


ALTER FUNCTION "public"."_get_notes_encryption_key"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_actor_name"("_uid" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT coalesce(nullif(trim(name), ''), email, 'Utente')
  FROM public.profiles WHERE id = _uid
$$;


ALTER FUNCTION "public"."audit_actor_name"("_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_caregiver_invite_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_plan text;
  v_current_count int;
  v_max_allowed int;
BEGIN
  SELECT subscription_plan INTO v_plan
  FROM public.profiles
  WHERE id = (
    SELECT owner_id FROM public.patients WHERE id = NEW.patient_id
  );

  v_plan := COALESCE(v_plan, 'free');

  SELECT COUNT(*) INTO v_current_count
  FROM public.caregiver_patients
  WHERE patient_id = NEW.patient_id;

  v_max_allowed := CASE v_plan
    WHEN 'max' THEN 10
    WHEN 'pro' THEN 5
    ELSE 1
  END;

  IF v_current_count >= v_max_allowed THEN
    RAISE EXCEPTION 'Limite caregiver per questo paziente raggiunto per il piano % (Max % persone). Passa a Pro o Max per collaborare con altre persone.', v_plan, v_max_allowed;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_caregiver_invite_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_patient_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_plan text;
  v_current_count int;
  v_max_allowed int;
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(subscription_plan, 'free') INTO v_plan
  FROM public.profiles WHERE id = NEW.user_id;

  SELECT COUNT(*) INTO v_current_count
  FROM public.patients WHERE user_id = NEW.user_id;

  v_max_allowed := CASE v_plan
    WHEN 'max' THEN 10
    WHEN 'pro' THEN 2
    ELSE 1
  END;

  IF v_current_count >= v_max_allowed THEN
    RAISE EXCEPTION 'Limite pazienti raggiunto per il piano % (Max: %). Passa a Pro o Max.', v_plan, v_max_allowed;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_patient_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_therapy_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
  WHERE patient_id = NEW.patient_id AND active = true;

  IF v_active_count >= 3 THEN
    RAISE EXCEPTION 'Limite di 3 terapie attive raggiunto per il piano Free. Passa a Pro o Max per terapie illimitate.';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_therapy_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_audit_log"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  DELETE FROM public.audit_log WHERE created_at < now() - interval '180 days';
$$;


ALTER FUNCTION "public"."cleanup_audit_log"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_expired_events"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Elimina gli eventi storici più vecchi di 180 giorni
  DELETE FROM public.events
  WHERE scheduled_at < now() - interval '180 days';
END;
$$;


ALTER FUNCTION "public"."cleanup_expired_events"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_expired_records"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- 1) Elimina eventi di assunzione più vecchi di 180 giorni
  DELETE FROM public.events
  WHERE scheduled_at < now() - interval '180 days';

  -- 2) Elimina notifiche già lette più vecchie di 30 giorni
  DELETE FROM public.notifications
  WHERE read = true AND created_at < now() - interval '30 days';
END;
$$;


ALTER FUNCTION "public"."cleanup_expired_records"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_vital_signs"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- A) Downsampling a 1 lettura/giorno per la fascia 90–97 giorni fa.
  --    Si tiene solo la misurazione più recente del giorno per
  --    (paziente, tipo); le altre dello stesso giorno si eliminano.
  WITH ranked AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY patient_id, kind, (measured_at AT TIME ZONE 'UTC')::date
             ORDER BY measured_at DESC
           ) AS rn
    FROM public.vital_signs
    WHERE measured_at < now() - interval '90 days'
      AND measured_at >= now() - interval '97 days'
  )
  DELETE FROM public.vital_signs v
  USING ranked r
  WHERE v.id = r.id AND r.rn > 1;

  -- B) Cancellazione definitiva oltre il tetto del piano.
  DELETE FROM public.vital_signs v
  WHERE measured_at < now() - (
    CASE public.patient_plan(v.patient_id)
      WHEN 'max' THEN interval '60 months'
      ELSE interval '24 months' -- pro (e free residuo da eventuali downgrade)
    END
  );
END;
$$;


ALTER FUNCTION "public"."cleanup_vital_signs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."compute_effective_plan"("_uid" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT CASE
    WHEN bool_or(plan = 'max') THEN 'max'
    WHEN bool_or(plan = 'pro') THEN 'pro'
    ELSE 'free'
  END
  FROM (
    -- il proprio piano posseduto
    SELECT COALESCE(pr.subscription_plan_own, 'free') AS plan
    FROM public.profiles pr WHERE pr.id = _uid
    UNION ALL
    -- famiglie in cui è caregiver invitato (non titolare di se stesso)
    SELECT COALESCE(owner_pr.subscription_plan_own, 'free')
    FROM public.caregiver_patients cp
    JOIN public.patients p ON p.id = cp.patient_id
    JOIN public.profiles owner_pr
      ON owner_pr.id = COALESCE(p.owner_user_id, p.primary_caregiver_id)
    WHERE cp.caregiver_id = _uid
      AND COALESCE(p.owner_user_id, p.primary_caregiver_id) IS DISTINCT FROM _uid
    UNION ALL
    -- è lui stesso il paziente, gestito da un titolare diverso da sé
    SELECT COALESCE(owner_pr.subscription_plan_own, 'free')
    FROM public.patients p
    JOIN public.profiles owner_pr
      ON owner_pr.id = COALESCE(p.owner_user_id, p.primary_caregiver_id)
    WHERE p.user_id = _uid
      AND COALESCE(p.owner_user_id, p.primary_caregiver_id) IS DISTINCT FROM _uid
  ) candidates(plan)
$$;


ALTER FUNCTION "public"."compute_effective_plan"("_uid" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."family_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "patient_id" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval) NOT NULL,
    "max_uses" integer DEFAULT 1 NOT NULL,
    "uses" integer DEFAULT 0 NOT NULL,
    "used_by" "uuid",
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."family_invites" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_family_invite"("_patient_id" "text", "_ttl_minutes" integer DEFAULT 1440, "_max_uses" integer DEFAULT 1) RETURNS "public"."family_invites"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row public.family_invites;
  v_code text;
  v_attempt int := 0;
begin
  if not exists (
    select 1 from public.patients p
    where p.id = _patient_id
      and (
        p.user_id = auth.uid()
        or p.owner_user_id = auth.uid()
        or (p.owner_user_id is null and p.primary_caregiver_id = auth.uid())
      )
  ) then
    raise exception 'Non autorizzato a creare inviti per questo paziente' using errcode = '42501';
  end if;

  if _ttl_minutes is null or _ttl_minutes <= 0 then _ttl_minutes := 1440; end if;
  if _max_uses is null or _max_uses <= 0 then _max_uses := 1; end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := upper(translate(
      substr(encode(gen_random_bytes(8), 'base64'), 1, 6),
      '01OIl+/=', 'ABCDEFGH'
    ));
    begin
      insert into public.family_invites (code, patient_id, created_by, expires_at, max_uses)
      values (v_code, _patient_id, auth.uid(), now() + make_interval(mins => _ttl_minutes), _max_uses)
      returning * into v_row;
      exit;
    exception when unique_violation then
      if v_attempt > 8 then raise; end if;
    end;
  end loop;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."create_family_invite"("_patient_id" "text", "_ttl_minutes" integer, "_max_uses" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decrypt_therapy_note"("_therapy_id" "text") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public, extensions'
    AS $$
DECLARE
  v_enc bytea;
  v_patient_id text;
  v_key text;
BEGIN
  SELECT notes_enc, patient_id INTO v_enc, v_patient_id
  FROM public.therapies WHERE id = _therapy_id;

  IF v_enc IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT (public.owns_patient(v_patient_id) OR public.is_caregiver_of(v_patient_id)) THEN
    RAISE EXCEPTION 'Non autorizzato a leggere questa nota' USING ERRCODE = '42501';
  END IF;

  v_key := public._get_notes_encryption_key();
  IF v_key IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN pgp_sym_decrypt(v_enc, v_key);
END;
$$;


ALTER FUNCTION "public"."decrypt_therapy_note"("_therapy_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_my_account"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_uid uuid := auth.uid();
  v_patient_id text;
begin
  if v_uid is null then
    raise exception 'Non autenticato' using errcode = '42501';
  end if;

  -- Notifiche destinate a me
  delete from public.notifications where target_user_id = v_uid;

  -- Inviti famiglia creati da me (non ancora usati o già usati)
  delete from public.family_invites where created_by = v_uid or used_by = v_uid;

  -- Link caregiver -> paziente in cui sono caregiver
  delete from public.caregiver_patients where caregiver_id = v_uid;

  -- Pazienti di cui sono OWNER (paziente registrato o creato da caregiver)
  for v_patient_id in
    select id from public.patients
    where user_id = v_uid or owner_user_id = v_uid
  loop
    delete from public.stock_movements
      where therapy_id in (select id from public.therapies where patient_id = v_patient_id);
    delete from public.events where patient_id = v_patient_id;
    delete from public.therapies where patient_id = v_patient_id;
    delete from public.caregiver_patients where patient_id = v_patient_id;
    delete from public.family_invites where patient_id = v_patient_id;
    delete from public.notifications where patient_id = v_patient_id;
    delete from public.patients where id = v_patient_id;
  end loop;

  -- Pazienti "gestiti" senza owner in cui ero primary caregiver
  for v_patient_id in
    select id from public.patients
    where owner_user_id is null and primary_caregiver_id = v_uid
  loop
    if not exists (
      select 1 from public.caregiver_patients where patient_id = v_patient_id
    ) then
      delete from public.stock_movements
        where therapy_id in (select id from public.therapies where patient_id = v_patient_id);
      delete from public.events where patient_id = v_patient_id;
      delete from public.therapies where patient_id = v_patient_id;
      delete from public.family_invites where patient_id = v_patient_id;
      delete from public.notifications where patient_id = v_patient_id;
      delete from public.patients where id = v_patient_id;
    else
      update public.patients set primary_caregiver_id = null where id = v_patient_id;
    end if;
  end loop;

  -- Ruoli, caregiver row, profilo
  delete from public.user_roles where user_id = v_uid;
  delete from public.caregivers where id = v_uid;
  delete from public.profiles where id = v_uid;

  -- Consensi GDPR (se la tabella esiste)
  begin
    execute 'delete from public.user_consents where user_id = $1' using v_uid;
  exception when undefined_table then
    null;
  end;

  -- Infine, elimina la riga in auth.users (richiede owner=postgres)
  delete from auth.users where id = v_uid;
end;
$_$;


ALTER FUNCTION "public"."delete_my_account"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."delete_my_account"() IS 'GDPR Right to Erasure: cancella definitivamente l''account e tutti i dati collegati dell''utente autenticato.';



CREATE OR REPLACE FUNCTION "public"."encrypt_therapy_note"("_plain" "text") RETURNS "bytea"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public, extensions'
    AS $$
DECLARE
  v_key text;
BEGIN
  IF _plain IS NULL OR _plain = '' THEN
    RETURN NULL;
  END IF;
  v_key := public._get_notes_encryption_key();
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'Chiave "therapy_notes_key" non presente in Vault.';
  END IF;
  RETURN pgp_sym_encrypt(_plain, v_key);
END;
$$;


ALTER FUNCTION "public"."encrypt_therapy_note"("_plain" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."export_my_data"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
  v_retention_cutoff timestamptz := now() - interval '180 days';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non autenticato' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'exported_at', now(),
    'user_id', v_uid,
    'retention_note', 'Gli eventi/notifiche mostrati coprono gli ultimi 180 giorni (policy di retention automatica del servizio).',
    'profile', (
      SELECT to_jsonb(p) FROM public.profiles p WHERE p.id = v_uid
    ),
    'roles', (
      SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
      FROM public.user_roles r WHERE r.user_id = v_uid
    ),
    'consents', (
      SELECT coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
      FROM public.user_consents c WHERE c.user_id = v_uid
    ),
    'caregiver_record', (
      SELECT to_jsonb(c) FROM public.caregivers c WHERE c.id = v_uid
    ),
    'patients_owned', (
      SELECT coalesce(jsonb_agg(to_jsonb(pt)), '[]'::jsonb)
      FROM public.patients pt
      WHERE pt.user_id = v_uid
         OR pt.owner_user_id = v_uid
         OR (pt.owner_user_id IS NULL AND pt.primary_caregiver_id = v_uid)
    ),
    'caregiver_links', (
      SELECT coalesce(jsonb_agg(to_jsonb(cp)), '[]'::jsonb)
      FROM public.caregiver_patients cp
      WHERE cp.caregiver_id = v_uid
         OR cp.patient_id IN (SELECT id FROM public.patients WHERE user_id = v_uid)
    ),
    'therapies', (
      SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
      FROM public.therapies t
      WHERE t.patient_id IN (
        SELECT id FROM public.patients
        WHERE user_id = v_uid OR owner_user_id = v_uid
           OR (owner_user_id IS NULL AND primary_caregiver_id = v_uid)
        UNION
        SELECT patient_id FROM public.caregiver_patients WHERE caregiver_id = v_uid
      )
    ),
    'events', (
      -- Limitato agli ultimi 180 giorni (coerente con il cron di retention)
      SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.scheduled_at DESC), '[]'::jsonb)
      FROM public.events e
      WHERE e.scheduled_at >= v_retention_cutoff
        AND e.patient_id IN (
          SELECT id FROM public.patients
          WHERE user_id = v_uid OR owner_user_id = v_uid
             OR (owner_user_id IS NULL AND primary_caregiver_id = v_uid)
          UNION
          SELECT patient_id FROM public.caregiver_patients WHERE caregiver_id = v_uid
        )
    ),
    'notifications', (
      SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY n.created_at DESC), '[]'::jsonb)
      FROM public.notifications n
      WHERE n.target_user_id = v_uid
        AND n.created_at >= v_retention_cutoff
    ),
    'family_invites_created', (
      SELECT coalesce(jsonb_agg(to_jsonb(fi)), '[]'::jsonb)
      FROM public.family_invites fi WHERE fi.created_by = v_uid
    ),
    'stock_movements', (
      SELECT coalesce(jsonb_agg(to_jsonb(sm)), '[]'::jsonb)
      FROM public.stock_movements sm
      WHERE sm.therapy_id IN (
        SELECT t.id FROM public.therapies t
        WHERE t.patient_id IN (
          SELECT id FROM public.patients
          WHERE user_id = v_uid OR owner_user_id = v_uid
             OR (owner_user_id IS NULL AND primary_caregiver_id = v_uid)
        )
      )
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."export_my_data"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."export_my_data"() IS 'GDPR Data Portability (art. 20): restituisce tutti i dati personali dell''utente autenticato in formato JSON. Gli eventi e le notifiche sono limitati agli ultimi 180 giorni (coerente con la retention automatica del servizio).';



CREATE OR REPLACE FUNCTION "public"."get_family_group_data"("_patient_id" "text", "_audit_limit" integer DEFAULT 31) RETURNS TABLE("members" "jsonb", "invites" "jsonb", "audit_log" "jsonb")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_is_linked boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = _patient_id
      AND (
        p.user_id = auth.uid()
        OR p.owner_user_id = auth.uid()
        OR public.is_caregiver_of(_patient_id)
      )
  ) INTO v_is_linked;

  IF NOT v_is_linked THEN
    RAISE EXCEPTION 'Non autorizzato a leggere il gruppo di cura di questo paziente'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'caregiver_id', cp.caregiver_id,
        'relationship', cp.relationship,
        'created_at',   cp.created_at,
        'name',         c.name,
        'relation',     c.relation,
        'photo',        c.photo
      )), '[]'::jsonb)
      FROM public.caregiver_patients cp
      LEFT JOIN public.caregivers c ON c.id = cp.caregiver_id
      WHERE cp.patient_id = _patient_id
    ) AS members,
    (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id',          fi.id,
        'code',        fi.code,
        'patient_id',  fi.patient_id,
        'created_by',  fi.created_by,
        'expires_at',  fi.expires_at,
        'max_uses',    fi.max_uses,
        'uses',        fi.uses,
        'used_by',     fi.used_by,
        'used_at',     fi.used_at,
        'created_at',  fi.created_at
      ) ORDER BY fi.created_at DESC), '[]'::jsonb)
      FROM public.family_invites fi
      WHERE fi.patient_id = _patient_id
        AND (
          fi.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.patients p
            WHERE p.id = fi.patient_id
              AND (p.user_id = auth.uid() OR p.owner_user_id = auth.uid())
          )
        )
    ) AS invites,
    (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id',          al.id,
        'patient_id',  al.patient_id,
        'actor_id',    al.actor_id,
        'actor_name',  al.actor_name,
        'action',      al.action,
        'entity_type', al.entity_type,
        'entity_id',   al.entity_id,
        'summary',     al.summary,
        'meta',        al.meta,
        'created_at',  al.created_at
      ) ORDER BY al.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT *
        FROM public.audit_log
        WHERE patient_id = _patient_id
        ORDER BY created_at DESC
        LIMIT _audit_limit
      ) al
    ) AS audit_log;
END;
$$;


ALTER FUNCTION "public"."get_family_group_data"("_patient_id" "text", "_audit_limit" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_family_group_data"("_patient_id" "text", "_audit_limit" integer) IS 'Round-trip unico per la pagina Gruppo di cura: membri + inviti + audit log in una sola chiamata RPC. SECURITY DEFINER con autorizzazione replicata manualmente (vedi commenti).';



CREATE OR REPLACE FUNCTION "public"."get_my_caregiver_stats"() RETURNS TABLE("patients_count" integer, "active_alerts" integer, "low_stock_count" integer, "low_stock_names" "text"[], "adherence_7d" integer, "refreshed_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT patients_count, active_alerts, low_stock_count,
         low_stock_names, adherence_7d, refreshed_at
  FROM public.caregiver_dashboard_stats
  WHERE caregiver_id = auth.uid()
$$;


ALTER FUNCTION "public"."get_my_caregiver_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_caregivers"() RETURNS TABLE("id" "uuid", "name" "text", "relation" "text", "photo" "text", "notify" "jsonb")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_role app_role;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non autenticato' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_role
  FROM public.user_roles
  WHERE user_id = v_uid
  LIMIT 1;

  IF v_role = 'paziente' THEN
    -- Paziente: vede i caregiver collegati tramite caregiver_patients del suo patient record
    RETURN QUERY
      SELECT c.id, c.name, c.relation, c.photo, c.notify
      FROM public.caregivers c
      INNER JOIN public.caregiver_patients cp ON cp.caregiver_id = c.id
      INNER JOIN public.patients p ON p.id = cp.patient_id
      WHERE p.user_id = v_uid;
  ELSE
    -- Caregiver: vede solo se stesso
    RETURN QUERY
      SELECT c.id, c.name, c.relation, c.photo, c.notify
      FROM public.caregivers c
      WHERE c.id = v_uid;
  END IF;
END;
$$;


ALTER FUNCTION "public"."get_my_caregivers"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_my_caregivers"() IS 'Restituisce i caregiver visibili all''utente autenticato in base al ruolo. Per i pazienti: tutti i caregiver collegati. Per i caregiver: solo se stessi. Sostituisce 2 query sequenziali (caregiver_patients + caregivers) con 1 sola chiamata.';



CREATE OR REPLACE FUNCTION "public"."get_my_patients"() RETURNS TABLE("id" "text", "name" "text", "birth_year" integer, "photo" "text", "user_id" "uuid", "owner_user_id" "uuid", "primary_caregiver_id" "uuid")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_role app_role;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non autenticato' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_role
  FROM public.user_roles
  WHERE user_id = v_uid
  LIMIT 1;

  IF v_role = 'caregiver' THEN
    RETURN QUERY
      SELECT p.id, p.name, p.birth_year, p.photo, p.user_id, p.owner_user_id, p.primary_caregiver_id
      FROM public.patients p
      INNER JOIN public.caregiver_patients cp ON cp.patient_id = p.id
      WHERE cp.caregiver_id = v_uid;
  ELSE
    RETURN QUERY
      SELECT p.id, p.name, p.birth_year, p.photo, p.user_id, p.owner_user_id, p.primary_caregiver_id
      FROM public.patients p
      WHERE p.user_id = v_uid;
  END IF;
END;
$$;


ALTER FUNCTION "public"."get_my_patients"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_my_patients"() IS 'Restituisce i pazienti visibili all''utente autenticato. Riscritta in SQL puro per evitare ambiguità 42702 su user_id in PL/pgSQL. Visibili: pazienti dove auth.uid() è caregiver collegato, paziente stesso, o titolare.';



CREATE OR REPLACE FUNCTION "public"."get_patient_dose_history"("p_patient_id" "text", "p_days" integer DEFAULT 30) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_since timestamptz := now() - (GREATEST(p_days, 1) || ' days')::interval;
  v_result jsonb;
BEGIN
  -- Stessa regola di visibilità delle altre RPC/RLS dell'app: solo il
  -- paziente stesso o un caregiver collegato può leggere lo storico.
  IF NOT EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = p_patient_id
      AND (
        p.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.caregiver_patients cp
          WHERE cp.patient_id = p.id AND cp.caregiver_id = auth.uid()
        )
      )
  ) THEN
    RAISE EXCEPTION 'not authorized for this patient';
  END IF;

  WITH ev AS (
    SELECT
      e.id,
      e.therapy_id,
      e.status,
      e.scheduled_at,
      e.confirmed_at,
      t.name AS therapy_name,
      COALESCE(t.timeout_minutes, 10) AS timeout_minutes
    FROM public.events e
    JOIN public.therapies t ON t.id = e.therapy_id
    WHERE e.patient_id = p_patient_id
      AND e.scheduled_at >= v_since
      AND e.scheduled_at <= now()
  ),
  -- "In ritardo": presa ma confermata oltre il timeout, oppure già
  -- segnata "missed"/"late" a monte — stessa regola di wasTakenLate()
  -- nel client (src/lib/therapy.ts).
  ev_flagged AS (
    SELECT
      *,
      (status = 'skipped') AS is_skipped,
      (status = 'taken') AS is_taken,
      (
        status = 'late'
        OR (
          status = 'taken'
          AND confirmed_at IS NOT NULL
          AND EXTRACT(EPOCH FROM (confirmed_at - scheduled_at)) / 60 >= timeout_minutes
        )
      ) AS is_late
    FROM ev
  ),
  per_day AS (
    SELECT
      (scheduled_at AT TIME ZONE 'Europe/Rome')::date AS day,
      count(*)::int AS scheduled,
      count(*) FILTER (WHERE is_taken)::int AS taken
    FROM ev_flagged
    GROUP BY 1
  ),
  per_therapy AS (
    SELECT
      therapy_id,
      therapy_name,
      count(*)::int AS scheduled,
      count(*) FILTER (WHERE is_taken)::int AS taken,
      count(*) FILTER (WHERE is_late)::int AS late,
      count(*) FILTER (WHERE is_skipped)::int AS skipped
    FROM ev_flagged
    GROUP BY therapy_id, therapy_name
  ),
  totals AS (
    SELECT
      count(*)::int AS scheduled,
      count(*) FILTER (WHERE is_taken)::int AS taken,
      count(*) FILTER (WHERE is_late)::int AS late,
      count(*) FILTER (WHERE is_skipped)::int AS skipped,
      COALESCE(ROUND(
        AVG(EXTRACT(EPOCH FROM (confirmed_at - scheduled_at)) / 60)
          FILTER (WHERE is_taken AND confirmed_at IS NOT NULL AND confirmed_at >= scheduled_at)
      ), 0)::int AS avg_delay
    FROM ev_flagged
  )
  SELECT jsonb_build_object(
    'bars', COALESCE(
      (SELECT jsonb_agg(
         jsonb_build_object('date', day, 'scheduled', scheduled, 'taken', taken)
         ORDER BY day
       ) FROM per_day),
      '[]'::jsonb
    ),
    'perTherapy', COALESCE(
      (SELECT jsonb_agg(
         jsonb_build_object(
           'therapyId', therapy_id,
           'name', therapy_name,
           'scheduled', scheduled,
           'taken', taken,
           'late', late,
           'skipped', skipped
         )
         ORDER BY scheduled DESC
       ) FROM per_therapy),
      '[]'::jsonb
    ),
    'totals', (
      SELECT jsonb_build_object(
        'scheduled', scheduled,
        'taken', taken,
        'late', late,
        'skipped', skipped,
        'avgDelay', avg_delay
      ) FROM totals
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."get_patient_dose_history"("p_patient_id" "text", "p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_patient_owner_plan"("p_patient_id" "text") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(pr.subscription_plan, 'free')
  FROM public.patients p
  JOIN public.profiles pr ON pr.id = COALESCE(p.user_id, p.owner_user_id)
  WHERE p.id = p_patient_id
  LIMIT 1;
$$;


ALTER FUNCTION "public"."get_patient_owner_plan"("p_patient_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_dose_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
  v_old_snoozed_until timestamptz;
  v_event_at timestamptz;
BEGIN
  v_old_status := CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(OLD.status,'') ELSE '' END;
  v_old_snoozed_until := CASE WHEN TG_OP = 'UPDATE' THEN OLD.snoozed_until ELSE NULL END;

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
  v_snooze_min := COALESCE(v_therapy.post_reminder_minutes, v_therapy.snooze_minutes, 5);

  IF NEW.status = 'snoozed' THEN
    v_kind := 'snoozed'; v_sev := 'warning';
    v_event_at := now();
    v_cg_title := '👨‍👩‍👧 ' || v_patient.name || ' ha rimandato ' || v_therapy.name;
    v_cg_msg   := 'In risposta alla dose delle ' || v_hhmm
                  || ' — rimandata di ' || v_snooze_min || ' min (unico rimando consentito).';
    v_pt_title := 'Hai rimandato ' || v_therapy.name;
    v_pt_msg   := 'Dose delle ' || v_hhmm || ' rimandata di ' || v_snooze_min
                  || ' min. Non potrai rimandarla ancora.';
  ELSIF NEW.status = 'skipped' THEN
    v_kind := 'skipped'; v_sev := 'alert';
    v_event_at := now();
    v_cg_title := '👨‍👩‍👧 ' || v_patient.name || ' ha saltato ' || v_therapy.name;
    v_cg_msg   := 'In risposta alla dose delle ' || v_hhmm || ' — saltata.';
    v_pt_title := 'Hai saltato ' || v_therapy.name;
    v_pt_msg   := 'La dose delle ' || v_hhmm
                  || ' è stata segnata come saltata. Un familiare potrebbe scriverti per sapere come stai.';
  ELSE
    -- missed: usa orario in cui la dose è EFFETTIVAMENTE diventata mancata
    -- (scheduled_at + tempo massimo consentito), non l'istante del batch job.
    v_kind := 'missed'; v_sev := 'alert';
    v_event_at := NEW.scheduled_at + make_interval(mins => COALESCE(v_therapy.timeout_minutes, 10));
    IF v_event_at > now() THEN v_event_at := now(); END IF;
    v_cg_title := '👨‍👩‍👧 ' || v_patient.name || ' non ha preso ' || v_therapy.name;
    v_cg_msg   := 'Dose delle ' || v_hhmm || ' segnata come non confermata dopo il tempo massimo.';
    v_pt_title := 'Dose non confermata: ' || v_therapy.name;
    v_pt_msg   := 'La dose delle ' || v_hhmm
                  || ' non risulta confermata. Un familiare potrebbe scriverti per sapere come stai.';
  END IF;

  FOR v_caregiver IN
    SELECT caregiver_id FROM public.caregiver_patients WHERE patient_id = NEW.patient_id
  LOOP
    INSERT INTO public.notifications
      (target_user_id, kind, severity, title, message, patient_id, therapy_id, event_id, dose_key, created_at)
    VALUES (
      v_caregiver, v_kind, v_sev, v_cg_title, v_cg_msg,
      NEW.patient_id, NEW.therapy_id, NEW.id,
      NEW.therapy_id || '@' || NEW.scheduled_at::text || '@' || v_kind || '@cg@' || v_caregiver,
      v_event_at
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  IF v_patient.user_id IS NOT NULL THEN
    INSERT INTO public.notifications
      (target_user_id, kind, severity, title, message, patient_id, therapy_id, event_id, dose_key, created_at)
    VALUES (
      v_patient.user_id, v_kind, v_sev, v_pt_title, v_pt_msg,
      NEW.patient_id, NEW.therapy_id, NEW.id,
      NEW.therapy_id || '@' || NEW.scheduled_at::text || '@' || v_kind || '@patient',
      v_event_at
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_dose_status_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_dose_taken"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
  v_taken_at timestamptz;
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
  v_taken_at := COALESCE(NEW.confirmed_at, now());

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
      (target_user_id, kind, severity, title, message, patient_id, therapy_id, event_id, dose_key, created_at)
    VALUES (
      v_caregiver, v_kind, 'info',
      '👨‍👩‍👧 ' || v_patient.name || ' ha confermato ' || v_therapy.name
        || CASE WHEN v_after_snooze THEN ' (dopo rimando)' ELSE '' END,
      'In risposta alla dose delle ' || v_hhmm
        || ' — confermata alle ' || to_char(v_taken_at AT TIME ZONE 'Europe/Rome','HH24:MI'),
      NEW.patient_id, NEW.therapy_id, NEW.id,
      NEW.therapy_id || '@' || NEW.scheduled_at::text || '@' || v_kind || '@cg@' || v_caregiver,
      v_taken_at
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  IF v_remaining <= COALESCE(v_therapy.low_stock_threshold, 10) THEN
    FOR v_caregiver IN
      SELECT caregiver_id FROM public.caregiver_patients WHERE patient_id = NEW.patient_id
    LOOP
      INSERT INTO public.notifications
        (target_user_id, kind, severity, title, message, patient_id, therapy_id, dose_key, created_at)
      VALUES (
        v_caregiver, 'low_stock', 'warning',
        'Scorta bassa: ' || v_therapy.name,
        'Restano ' || v_remaining || ' dosi per ' || v_patient.name || '. Programma il riordino.',
        NEW.patient_id, NEW.therapy_id,
        NEW.therapy_id || '@lowstock@' || to_char(now() AT TIME ZONE 'Europe/Rome','YYYY-MM-DD'),
        now()
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_dose_taken"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_name text;
  v_role app_role;
  v_patient_id text;
begin
  v_name := coalesce(new.raw_user_meta_data->>'name', new.email);
  v_role := coalesce((new.raw_user_meta_data->>'role')::app_role, 'caregiver');

  insert into public.profiles (id, email, name, role)
  values (new.id, new.email, v_name, v_role)
  on conflict (id) do update set email = excluded.email, name = excluded.name, role = excluded.role;

  insert into public.user_roles (user_id, role)
  values (new.id, v_role)
  on conflict do nothing;

  if v_role = 'caregiver' then
    insert into public.caregivers (id, name)
    values (new.id, v_name)
    on conflict (id) do nothing;
  end if;

  if v_role = 'paziente' then
    v_patient_id := 'p_' || new.id::text;
    insert into public.patients (id, name, user_id)
    values (v_patient_id, v_name, new.id)
    on conflict (id) do nothing;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;


ALTER FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_caregiver_of"("_patient_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.caregiver_patients cp
    where cp.patient_id = _patient_id
      and cp.caregiver_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_caregiver_of"("_patient_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_caregiver_of"("_patient_id" "text") IS 'True se l''utente corrente è un caregiver collegato a _patient_id. SECURITY DEFINER per evitare ricorsione RLS con la policy "patients: silo read".';



CREATE OR REPLACE FUNCTION "public"."is_primary_of"("_patient_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = _patient_id
      AND (
        p.owner_user_id = auth.uid()
        OR (p.owner_user_id IS NULL AND p.primary_caregiver_id = auth.uid())
      )
  );
$$;


ALTER FUNCTION "public"."is_primary_of"("_patient_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_gdpr_event"("_action" "text", "_patient_id" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."log_gdpr_event"("_action" "text", "_patient_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_patient_view"("_patient_id" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_recent boolean;
BEGIN
  IF auth.uid() IS NULL OR _patient_id IS NULL THEN RETURN; END IF;
  IF public.patient_plan(_patient_id) <> 'max' THEN RETURN; END IF;

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


ALTER FUNCTION "public"."log_patient_view"("_patient_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owns_patient"("_patient_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.patients p
    where p.id = _patient_id
      and p.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."owns_patient"("_patient_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."owns_patient"("_patient_id" "text") IS 'True se l''utente corrente è il paziente titolare di _patient_id. SECURITY DEFINER per evitare ricorsione RLS con la policy "cp: read own".';



CREATE OR REPLACE FUNCTION "public"."patient_plan"("_patient_id" "text") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(pr.subscription_plan, 'free')
  FROM public.patients p
  LEFT JOIN public.profiles pr
    ON pr.id = COALESCE(p.owner_user_id, p.primary_caregiver_id, p.user_id)
  WHERE p.id = _patient_id
$$;


ALTER FUNCTION "public"."patient_plan"("_patient_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_dose_schedule"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
  -- Generazione dosi future mancanti (-30min -> +24h)
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
    WHERE e.status IN ('scheduled', 'snoozed')
      AND e.scheduled_at <= (v_now - interval '5 minutes')
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


ALTER FUNCTION "public"."process_dose_schedule"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."redeem_family_invite"("_code" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_invite public.family_invites;
begin
  if not public.has_role(auth.uid(), 'caregiver') then
    raise exception 'Solo un caregiver può usare un codice invito' using errcode = '42501';
  end if;

  select * into v_invite from public.family_invites
    where code = upper(trim(_code)) for update;

  if not found then
    raise exception 'Codice non valido' using errcode = 'P0002';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'Codice scaduto' using errcode = 'P0003';
  end if;
  if v_invite.uses >= v_invite.max_uses then
    raise exception 'Codice già utilizzato' using errcode = 'P0004';
  end if;

  insert into public.caregiver_patients (caregiver_id, patient_id)
    values (auth.uid(), v_invite.patient_id)
    on conflict do nothing;

  -- Se il paziente non ha owner e nessun primario ancora, questo caregiver diventa primario
  update public.patients
    set primary_caregiver_id = auth.uid()
    where id = v_invite.patient_id
      and owner_user_id is null
      and primary_caregiver_id is null;

  update public.family_invites
    set uses = uses + 1,
        used_by = auth.uid(),
        used_at = now()
    where id = v_invite.id;

  return v_invite.patient_id;
end;
$$;


ALTER FUNCTION "public"."redeem_family_invite"("_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_caregiver_dashboard_stats"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.caregiver_dashboard_stats;
EXCEPTION WHEN OTHERS THEN
  REFRESH MATERIALIZED VIEW public.caregiver_dashboard_stats;
END;
$$;


ALTER FUNCTION "public"."refresh_caregiver_dashboard_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_my_caregiver_stats"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Solo caregiver possono farlo (evita abusi)
  IF NOT public.has_role(auth.uid(), 'caregiver') THEN
    RAISE EXCEPTION 'Solo un caregiver può aggiornare le statistiche'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.refresh_caregiver_dashboard_stats();
END;
$$;


ALTER FUNCTION "public"."refresh_my_caregiver_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_patient_history"("_patient_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_events_deleted    int;
  v_notif_deleted     int;
  v_stock_deleted     int;
BEGIN
  -- ---- Autorizzazione: solo il caregiver primario ----
  IF NOT public.is_primary_of(_patient_id) THEN
    RAISE EXCEPTION 'Solo il caregiver primario può azzerare lo storico del paziente'
      USING ERRCODE = '42501';
  END IF;

  -- ---- 1. Elimina eventi (storico dosi: prese, saltate, ritardi, snooze) ----
  DELETE FROM public.events
    WHERE patient_id = _patient_id;
  GET DIAGNOSTICS v_events_deleted = ROW_COUNT;

  -- ---- 2. Elimina notifiche del paziente ----
  DELETE FROM public.notifications
    WHERE patient_id = _patient_id;
  GET DIAGNOSTICS v_notif_deleted = ROW_COUNT;

  -- ---- 3. Elimina movimenti di scorta per le terapie del paziente ----
  DELETE FROM public.stock_movements
    WHERE therapy_id IN (
      SELECT id FROM public.therapies WHERE patient_id = _patient_id
    );
  GET DIAGNOSTICS v_stock_deleted = ROW_COUNT;

  -- ---- 4. Ripristina scorte a pieno (packs × pills_per_pack) ----
  UPDATE public.therapies
    SET pills_remaining = packs * pills_per_pack
    WHERE patient_id = _patient_id;

  -- ---- Ritorna riepilogo per audit client-side ----
  RETURN jsonb_build_object(
    'ok',              true,
    'patient_id',      _patient_id,
    'reset_at',        now(),
    'events_deleted',  v_events_deleted,
    'notif_deleted',   v_notif_deleted,
    'stock_deleted',   v_stock_deleted
  );
END;
$$;


ALTER FUNCTION "public"."reset_patient_history"("_patient_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revoke_my_consent"("_kind" "text") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  UPDATE public.user_consents
    SET revoked_at = now()
    WHERE user_id = auth.uid()
      AND kind = _kind
      AND revoked_at IS NULL;
$$;


ALTER FUNCTION "public"."revoke_my_consent"("_kind" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rollup_adherence_monthly"("p_year" integer DEFAULT NULL::integer, "p_month" integer DEFAULT NULL::integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_year integer := COALESCE(p_year, EXTRACT(YEAR FROM (now() - interval '1 month'))::int);
  v_month integer := COALESCE(p_month, EXTRACT(MONTH FROM (now() - interval '1 month'))::int);
  v_start timestamptz := make_date(v_year, v_month, 1)::timestamptz;
  v_end timestamptz := (make_date(v_year, v_month, 1) + interval '1 month')::timestamptz;
BEGIN
  INSERT INTO public.adherence_monthly (
    patient_id, therapy_id, therapy_name, year, month,
    doses_scheduled, doses_taken, doses_missed, doses_skipped, adherence_pct, computed_at
  )
  SELECT
    e.patient_id,
    e.therapy_id,
    COALESCE(t.name, 'Terapia eliminata'),
    v_year,
    v_month,
    count(*) FILTER (WHERE e.status IN ('taken', 'missed', 'skipped')) AS doses_scheduled,
    count(*) FILTER (WHERE e.status = 'taken') AS doses_taken,
    count(*) FILTER (WHERE e.status = 'missed') AS doses_missed,
    count(*) FILTER (WHERE e.status = 'skipped') AS doses_skipped,
    CASE
      WHEN count(*) FILTER (WHERE e.status IN ('taken', 'missed', 'skipped')) > 0
        THEN round(
          100.0 * count(*) FILTER (WHERE e.status = 'taken')
          / count(*) FILTER (WHERE e.status IN ('taken', 'missed', 'skipped')),
          2
        )
      ELSE NULL
    END AS adherence_pct,
    now()
  FROM public.events e
  LEFT JOIN public.therapies t ON t.id = e.therapy_id
  WHERE e.scheduled_at >= v_start AND e.scheduled_at < v_end
  GROUP BY e.patient_id, e.therapy_id, t.name
  ON CONFLICT (patient_id, therapy_id, year, month) DO UPDATE SET
    therapy_name = EXCLUDED.therapy_name,
    doses_scheduled = EXCLUDED.doses_scheduled,
    doses_taken = EXCLUDED.doses_taken,
    doses_missed = EXCLUDED.doses_missed,
    doses_skipped = EXCLUDED.doses_skipped,
    adherence_pct = EXCLUDED.adherence_pct,
    computed_at = now();
END;
$$;


ALTER FUNCTION "public"."rollup_adherence_monthly"("p_year" integer, "p_month" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_dose_scheduler"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_now      timestamptz := now();
  v_horizon  timestamptz := v_now + interval '24 hours';
  v_past     timestamptz := v_now - interval '30 minutes';
  ev         record;
  v_before   int;
  v_diff_min numeric;
  v_diff_ms  numeric;
  v_elapsed  numeric;
  v_post_min int;
  v_timeout_min int;
  v_hard_deadline timestamptz;
  v_snooze_deadline timestamptz;
BEGIN
  -- ============================================================
  -- 1) Genera dosi future mancanti (equivalente a buildDoseTimes()
  --    + upsert events nella Edge Function). Set-based invece che
  --    a loop: un giorno per riga (generate_series) incrociato con
  --    gli orari (unnest(times)), filtrato con la stessa logica di
  --    scheduledOnDate() per ogni recurrence.kind.
  --    NOTA: le ore in `times` sono UTC (stesso comportamento di
  --    dt.setUTCHours nella versione JS) — nessuna conversione di
  --    fuso qui, solo nei messaggi di notifica più sotto.
  -- ============================================================
  INSERT INTO public.events (id, therapy_id, patient_id, scheduled_at, status, stage, timeline)
  SELECT
    'e_' || t.id || '_' || (extract(epoch FROM ts.dt)::bigint * 1000),
    t.id, t.patient_id, ts.dt, 'scheduled', 'scheduled',
    jsonb_build_array(jsonb_build_object('at', ts.dt, 'kind', 'scheduled', 'message', 'Dose programmata'))
  FROM public.therapies t
  CROSS JOIN LATERAL generate_series(v_past::date, v_horizon::date, interval '1 day') AS day_ts
  CROSS JOIN LATERAL unnest(t.times) AS tm(hhmm)
  CROSS JOIN LATERAL (
    SELECT (day_ts::date::timestamp
            + (split_part(tm.hhmm, ':', 1)::int || ' hours')::interval
            + (split_part(tm.hhmm, ':', 2)::int || ' minutes')::interval
           ) AT TIME ZONE 'UTC' AS dt
  ) ts
  WHERE t.active AND NOT t.suspended
    AND day_ts::date >= t.start_date
    AND (t.end_date IS NULL OR day_ts::date <= t.end_date)
    AND ts.dt BETWEEN v_past AND v_horizon
    AND (
      COALESCE(t.recurrence->>'kind', 'daily') = 'daily'
      OR (t.recurrence->>'kind' = 'weekdays' AND extract(dow FROM day_ts) BETWEEN 1 AND 5)
      OR (t.recurrence->>'kind' = 'weekend'  AND extract(dow FROM day_ts) IN (0, 6))
      OR (t.recurrence->>'kind' = 'every_x_days'
          AND mod((day_ts::date - t.start_date), GREATEST(1, (t.recurrence->>'x')::int)) = 0)
      OR (t.recurrence->>'kind' = 'specific_days'
          AND (t.recurrence->'days') @> to_jsonb(extract(dow FROM day_ts)::int))
    )
  ON CONFLICT (therapy_id, scheduled_at) DO NOTHING;

  -- ============================================================
  -- 2) REMINDER_PRE + DUE + REMINDER_POST — una sola scansione,
  --    stessa idea della versione ottimizzata della Edge Function:
  --    un cursore, tre controlli indipendenti per evento (nessuna
  --    condizione diversa da index.ts).
  -- ============================================================
  FOR ev IN
    SELECT e.id, e.scheduled_at, e.stage,
           t.name AS th_name, t.dosage AS th_dosage, t.quantity AS th_quantity,
           t.post_reminder_minutes, t.reminder_intervals,
           p.name AS pt_name, p.user_id AS pt_user_id,
           e.patient_id, e.therapy_id
    FROM public.events e
    JOIN public.therapies t ON t.id = e.therapy_id
    JOIN public.patients  p ON p.id = e.patient_id
    WHERE e.status = 'scheduled'
      AND e.scheduled_at BETWEEN v_past AND v_horizon
  LOOP
    -- reminder_pre: finestra (before-2, before] minuti prima, come in JS
    v_before := GREATEST(1, ABS(COALESCE(
      (SELECT x FROM unnest(ev.reminder_intervals) AS x WHERE x <> 0 LIMIT 1), 10)));
    v_diff_min := extract(epoch FROM (ev.scheduled_at - v_now)) / 60;
    IF NOT (v_diff_min > v_before OR v_diff_min <= GREATEST(0, v_before - 2)) THEN
      IF ev.pt_user_id IS NOT NULL THEN
        INSERT INTO public.notifications
          (target_user_id, kind, severity, title, message, patient_id, therapy_id, event_id, dose_key, created_at)
        VALUES (
          ev.pt_user_id, 'reminder_pre', 'info',
          '💊 Tra ' || v_before || ' min: ' || COALESCE(ev.th_name, 'farmaco'),
          'Alle ' || to_char(ev.scheduled_at AT TIME ZONE 'Europe/Rome', 'HH24:MI') || ' — ' || COALESCE(ev.th_dosage, ''),
          ev.patient_id, ev.therapy_id, ev.id,
          ev.therapy_id || '@' || extract(epoch FROM ev.scheduled_at)::bigint || '@reminder_pre@patient',
          v_now
        ) ON CONFLICT DO NOTHING;
      END IF;
    END IF;

    -- due (±90s) — filtro esplicito qui perché la query sopra copre
    -- una finestra più ampia (stesso motivo del fix nella Edge Function)
    v_diff_ms := extract(epoch FROM (ev.scheduled_at - v_now)) * 1000;
    IF v_diff_ms BETWEEN -60000 AND 90000 THEN
      UPDATE public.events SET stage = 'due' WHERE id = ev.id AND status = 'scheduled';
      IF ev.pt_user_id IS NOT NULL THEN
        INSERT INTO public.notifications
          (target_user_id, kind, severity, title, message, patient_id, therapy_id, event_id, dose_key, created_at)
        VALUES (
          ev.pt_user_id, 'due', 'warning',
          '💊 È ora: ' || COALESCE(ev.th_name, 'farmaco'),
          COALESCE(ev.th_quantity::text, '1') || ' unità — ' || COALESCE(ev.th_dosage, ''),
          ev.patient_id, ev.therapy_id, ev.id,
          ev.therapy_id || '@' || extract(epoch FROM ev.scheduled_at)::bigint || '@due@patient',
          v_now
        ) ON CONFLICT DO NOTHING;
      END IF;
    END IF;

    -- reminder_post
    v_post_min := GREATEST(1, COALESCE(ev.post_reminder_minutes, 5));
    v_elapsed := extract(epoch FROM (v_now - ev.scheduled_at)) / 60;
    IF v_elapsed >= v_post_min AND v_elapsed <= v_post_min + 2
       AND ev.stage NOT IN ('reminder_post', 'final_due', 'missed') THEN
      UPDATE public.events SET stage = 'reminder_post' WHERE id = ev.id AND status = 'scheduled';
      IF ev.pt_user_id IS NOT NULL THEN
        INSERT INTO public.notifications
          (target_user_id, kind, severity, title, message, patient_id, therapy_id, event_id, dose_key, created_at)
        VALUES (
          ev.pt_user_id, 'reminder_post', 'warning',
          '💊 Non hai ancora preso ' || COALESCE(ev.th_name, 'il farmaco'),
          'Erano le ' || to_char(ev.scheduled_at AT TIME ZONE 'Europe/Rome', 'HH24:MI') || '. Conferma o rimanda.',
          ev.patient_id, ev.therapy_id, ev.id,
          ev.therapy_id || '@' || extract(epoch FROM ev.scheduled_at)::bigint || '@reminder_post@patient',
          v_now
        ) ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END LOOP;

  -- ============================================================
  -- 3) FINAL_DUE: snoozed alla scadenza del rimando. Non tocca la
  --    colonna status → il trigger trg_dose_status_change (che è
  --    AFTER UPDATE OF status) non scatta, quindi qui l'insert
  --    manuale della notifica resta necessario, come in index.ts.
  -- ============================================================
  FOR ev IN
    SELECT e.id, e.scheduled_at, e.stage, e.final_due_at,
           t.name AS th_name,
           p.user_id AS pt_user_id,
           e.patient_id, e.therapy_id
    FROM public.events e
    JOIN public.therapies t ON t.id = e.therapy_id
    JOIN public.patients  p ON p.id = e.patient_id
    WHERE e.status = 'snoozed'
      AND e.snoozed_until IS NOT NULL
      AND e.snoozed_until <= v_now + interval '60 seconds'
  LOOP
    IF ev.stage IN ('final_due', 'missed') OR ev.final_due_at IS NOT NULL THEN
      CONTINUE;
    END IF;
    UPDATE public.events SET stage = 'final_due', final_due_at = v_now WHERE id = ev.id AND status = 'snoozed';
    IF ev.pt_user_id IS NOT NULL THEN
      INSERT INTO public.notifications
        (target_user_id, kind, severity, title, message, patient_id, therapy_id, event_id, dose_key, created_at)
      VALUES (
        ev.pt_user_id, 'final_due', 'warning',
        'Ultima chiamata: ' || COALESCE(ev.th_name, 'farmaco'),
        'Conferma la dose delle ' || to_char(ev.scheduled_at AT TIME ZONE 'Europe/Rome', 'HH24:MI') || '. Non puoi più rimandare.',
        ev.patient_id, ev.therapy_id, ev.id,
        ev.therapy_id || '@' || extract(epoch FROM ev.scheduled_at)::bigint || '@final_due@patient',
        v_now
      ) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  -- ============================================================
  -- 4) MISSED — solo l'UPDATE. Le notifiche (paziente + tutti i
  --    caregiver) le crea da sola trg_dose_status_change, che
  --    scatta su questo stesso UPDATE (status -> 'missed').
  -- ============================================================
  FOR ev IN
    SELECT e.id, e.scheduled_at, e.snoozed_until,
           t.timeout_minutes, t.post_reminder_minutes
    FROM public.events e
    JOIN public.therapies t ON t.id = e.therapy_id
    WHERE e.status IN ('scheduled', 'snoozed')
      AND e.scheduled_at <= v_now - interval '5 minutes'
  LOOP
    v_timeout_min := COALESCE(ev.timeout_minutes, 10);
    v_post_min := GREATEST(1, COALESCE(ev.post_reminder_minutes, 5));
    v_snooze_deadline := ev.snoozed_until;
    v_hard_deadline := COALESCE(v_snooze_deadline, ev.scheduled_at + make_interval(mins => v_timeout_min));
    IF v_now < v_hard_deadline THEN
      CONTINUE;
    END IF;

    UPDATE public.events
      SET status = 'missed',
          stage = 'missed',
          timeline = jsonb_build_array(jsonb_build_object(
            'at', v_now, 'kind', 'missed', 'message', 'Dose non confermata entro il tempo massimo'))
      WHERE id = ev.id AND status IN ('scheduled', 'snoozed');
    -- trg_dose_status_change gestisce le notifiche da qui in poi.
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."run_dose_scheduler"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_effective_plan"("_uid" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_plan text;
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;
  v_plan := public.compute_effective_plan(_uid);
  UPDATE public.profiles
  SET subscription_plan = v_plan
  WHERE id = _uid AND subscription_plan IS DISTINCT FROM v_plan;
END;
$$;


ALTER FUNCTION "public"."sync_effective_plan"("_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_family_of_patient"("_patient_id" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE r RECORD;
BEGIN
  -- il paziente stesso, se ha un account proprio
  PERFORM public.sync_effective_plan(
    (SELECT user_id FROM public.patients WHERE id = _patient_id)
  );
  -- tutti i caregiver collegati a questo paziente
  FOR r IN
    SELECT caregiver_id AS uid FROM public.caregiver_patients WHERE patient_id = _patient_id
  LOOP
    PERFORM public.sync_effective_plan(r.uid);
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."sync_family_of_patient"("_patient_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_audit_caregiver_patients"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_name  text := coalesce(public.audit_actor_name(auth.uid()), 'Sistema');
  v_member text;
  v_patient_id text := COALESCE(NEW.patient_id, OLD.patient_id);
BEGIN
  IF public.patient_plan(v_patient_id) <> 'max' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

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


ALTER FUNCTION "public"."trg_audit_caregiver_patients"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_audit_patient_primary"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_name  text := coalesce(public.audit_actor_name(auth.uid()), 'Sistema');
  v_new   text;
BEGIN
  IF NEW.primary_caregiver_id IS DISTINCT FROM OLD.primary_caregiver_id THEN
    IF public.patient_plan(NEW.id) <> 'max' THEN
      RETURN NEW;
    END IF;
    v_new := coalesce(public.audit_actor_name(NEW.primary_caregiver_id), '—');
    INSERT INTO public.audit_log(patient_id, actor_id, actor_name, action, entity_type, entity_id, summary)
    VALUES (NEW.id, v_actor, v_name, 'primary_changed', 'patient', NEW.id,
            v_name || ' ha nominato ' || v_new || ' caregiver principale');
  END IF;
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."trg_audit_patient_primary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_audit_therapies"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_name  text := coalesce(public.audit_actor_name(auth.uid()), 'Sistema');
  v_changed jsonb := '{}'::jsonb;
  v_patient_id text := COALESCE(NEW.patient_id, OLD.patient_id);
BEGIN
  IF public.patient_plan(v_patient_id) <> 'max' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

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


ALTER FUNCTION "public"."trg_audit_therapies"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_cascade_plan_on_own_plan_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE r RECORD;
BEGIN
  IF NEW.subscription_plan_own IS DISTINCT FROM OLD.subscription_plan_own THEN
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


ALTER FUNCTION "public"."trg_cascade_plan_on_own_plan_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_sync_plan_on_membership_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.sync_effective_plan(NEW.caregiver_id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.sync_effective_plan(OLD.caregiver_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."trg_sync_plan_on_membership_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_sync_plan_on_patient_owner_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
     OR NEW.primary_caregiver_id IS DISTINCT FROM OLD.primary_caregiver_id THEN
    PERFORM public.sync_family_of_patient(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_sync_plan_on_patient_owner_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."vital_signs_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."vital_signs_touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wellness_symptom_correlation"("_patient_id" "text", "_days" integer DEFAULT 30, "_window_hours" integer DEFAULT 6) RETURNS TABLE("therapy_id" "text", "therapy_name" "text", "doses_taken" bigint, "notes_after" bigint, "top_symptoms" "text"[])
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  WITH taken AS (
    SELECT e.id, e.therapy_id, COALESCE(e.confirmed_at, e.scheduled_at) AS at
    FROM public.events e
    WHERE e.patient_id = _patient_id
      AND e.status = 'taken'
      AND COALESCE(e.confirmed_at, e.scheduled_at) >= now() - make_interval(days => _days)
  ),
  notes AS (
    SELECT w.id, w.occurred_at, w.symptoms, w.therapy_id
    FROM public.wellness_notes w
    WHERE w.patient_id = _patient_id
      AND w.occurred_at >= now() - make_interval(days => _days)
  ),
  matched AS (
    SELECT t.therapy_id, n.symptoms
    FROM taken t
    JOIN notes n
      ON n.occurred_at >= t.at
     AND n.occurred_at <= t.at + make_interval(hours => _window_hours)
     AND (n.therapy_id IS NULL OR n.therapy_id = t.therapy_id)
  )
  SELECT
    th.id,
    th.name,
    (SELECT count(*) FROM taken t WHERE t.therapy_id = th.id),
    (SELECT count(*) FROM matched m WHERE m.therapy_id = th.id),
    COALESCE((
      SELECT array_agg(s ORDER BY c DESC)
      FROM (
        SELECT unnest(m.symptoms) AS s, count(*) AS c
        FROM matched m
        WHERE m.therapy_id = th.id
        GROUP BY 1
        ORDER BY 2 DESC
        LIMIT 5
      ) q
    ), '{}')
  FROM public.therapies th
  WHERE th.patient_id = _patient_id
  ORDER BY 4 DESC, 2;
$$;


ALTER FUNCTION "public"."wellness_symptom_correlation"("_patient_id" "text", "_days" integer, "_window_hours" integer) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."adherence_monthly" (
    "patient_id" "text" NOT NULL,
    "therapy_id" "text" NOT NULL,
    "therapy_name" "text" NOT NULL,
    "year" integer NOT NULL,
    "month" integer NOT NULL,
    "doses_scheduled" integer DEFAULT 0 NOT NULL,
    "doses_taken" integer DEFAULT 0 NOT NULL,
    "doses_missed" integer DEFAULT 0 NOT NULL,
    "doses_skipped" integer DEFAULT 0 NOT NULL,
    "adherence_pct" numeric(5,2),
    "computed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "adherence_monthly_month_check" CHECK ((("month" >= 1) AND ("month" <= 12)))
);


ALTER TABLE "public"."adherence_monthly" OWNER TO "postgres";


COMMENT ON TABLE "public"."adherence_monthly" IS 'Riepilogo mensile di aderenza per paziente/terapia, calcolato prima che il dettaglio in events venga cancellato a 180gg (events-cleanup-daily). Conservato senza scadenza: è lo storico "a lungo termine" del piano a pagamento.';



CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patient_id" "text",
    "table_name" "text",
    "record_id" "text",
    "action" "text" DEFAULT 'legacy_event'::"text" NOT NULL,
    "actor_id" "uuid",
    "actor_role" "text",
    "changed_fields" "text"[],
    "detail" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actor_name" "text",
    "entity_type" "text",
    "entity_id" "text",
    "summary" "text" DEFAULT 'Evento registrato'::"text" NOT NULL,
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."audit_log" IS 'Log di controllo GDPR (art. 5.2 accountability). Immutabile: solo INSERT via trigger/RPC SECURITY DEFINER. Righe volutamente compatte per limitare il consumo di storage sul piano Free.';



CREATE TABLE IF NOT EXISTS "public"."caregiver_patients" (
    "caregiver_id" "uuid" NOT NULL,
    "patient_id" "text" NOT NULL,
    "relationship" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."caregiver_patients" OWNER TO "postgres";


COMMENT ON TABLE "public"."caregiver_patients" IS 'INSERT: solo RPC redeem_family_invite (SECURITY DEFINER). SELECT: caregiver self o paziente owner. UPDATE: caregiver self (relationship). DELETE: caregiver self o primario che rimuove secondari.';



CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "text" NOT NULL,
    "therapy_id" "text" NOT NULL,
    "patient_id" "text" NOT NULL,
    "scheduled_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "confirmed_at" timestamp with time zone,
    "confirmed_by" "text",
    "snooze_count" integer DEFAULT 0,
    "snoozed_until" timestamp with time zone,
    "note" "text",
    "timeline" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "stage" "text" DEFAULT 'scheduled'::"text",
    "final_due_at" timestamp with time zone
);


ALTER TABLE "public"."events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "name" "text",
    "role" "public"."app_role" DEFAULT 'caregiver'::"public"."app_role" NOT NULL,
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "subscription_plan" "text" DEFAULT 'free'::"text" NOT NULL,
    "subscription_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "subscription_plan_own" "text" DEFAULT 'free'::"text" NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."subscription_plan" IS 'Piano EFFETTIVO (letto ovunque nell''app per il gating): il migliore tra subscription_plan_own e i piani dei gruppi famiglia di cui questo utente fa parte. Mantenuto sincronizzato da trigger — non scrivere qui direttamente, scrivere subscription_plan_own.';



COMMENT ON COLUMN "public"."profiles"."subscription_plan_own" IS 'Piano effettivamente acquistato da QUESTO utente (scritto solo dalla pagina Abbonamento). Non usare per il gating: usare subscription_plan.';



CREATE TABLE IF NOT EXISTS "public"."therapies" (
    "id" "text" NOT NULL,
    "patient_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "dosage" "text",
    "quantity" integer DEFAULT 1,
    "category" "text",
    "color" "text",
    "icon" "text",
    "notes" "text",
    "start_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "end_date" "date",
    "times" "text"[] DEFAULT '{}'::"text"[],
    "recurrence" "jsonb" DEFAULT '{"kind": "daily"}'::"jsonb" NOT NULL,
    "timeout_minutes" integer DEFAULT 10,
    "snooze_minutes" integer DEFAULT 10,
    "reminder_intervals" integer[] DEFAULT '{10}'::integer[],
    "post_reminder_minutes" integer DEFAULT 5,
    "packs" integer DEFAULT 0,
    "pills_per_pack" integer DEFAULT 0,
    "pills_remaining" integer DEFAULT 0,
    "low_stock_threshold" integer DEFAULT 10,
    "active" boolean DEFAULT true,
    "suspended" boolean DEFAULT false,
    "photo_drug" "text",
    "photo_package" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes_enc" "bytea",
    CONSTRAINT "therapies_photo_drug_not_base64" CHECK ((("photo_drug" IS NULL) OR ("photo_drug" !~~ 'data:%'::"text"))),
    CONSTRAINT "therapies_photo_package_not_base64" CHECK ((("photo_package" IS NULL) OR ("photo_package" !~~ 'data:%'::"text")))
);


ALTER TABLE "public"."therapies" OWNER TO "postgres";


COMMENT ON COLUMN "public"."therapies"."notes_enc" IS 'Note cifrate (AES-256 via pgcrypto + Supabase Vault). Opt-in: vedi encrypt_therapy_note()/decrypt_therapy_note().';



CREATE MATERIALIZED VIEW "public"."caregiver_dashboard_stats" AS
 WITH "cg" AS (
         SELECT DISTINCT "caregiver_patients"."caregiver_id"
           FROM "public"."caregiver_patients"
        ), "pats" AS (
         SELECT "cp"."caregiver_id",
            "cp"."patient_id"
           FROM "public"."caregiver_patients" "cp"
        ), "alerts" AS (
         SELECT "p"."caregiver_id",
            ("count"(*))::integer AS "active_alerts"
           FROM ((("pats" "p"
             JOIN "public"."profiles" "pr" ON (("pr"."id" = "p"."caregiver_id")))
             JOIN "public"."events" "e" ON (("e"."patient_id" = "p"."patient_id")))
             JOIN "public"."therapies" "t" ON (("t"."id" = "e"."therapy_id")))
          WHERE (("e"."status" = ANY (ARRAY['missed'::"text", 'skipped'::"text"])) AND (COALESCE("e"."note", ''::"text") !~~ '%caregiver_ack%'::"text") AND (COALESCE("e"."note", ''::"text") !~~ '%CG_ACK%'::"text") AND (COALESCE("t"."active", true) = true) AND (COALESCE("t"."suspended", false) = false) AND (((COALESCE("pr"."subscription_plan", 'free'::"text") = 'free'::"text") AND ("e"."scheduled_at" >= ("now"() - '7 days'::interval))) OR ((COALESCE("pr"."subscription_plan", 'free'::"text") = ANY (ARRAY['pro'::"text", 'max'::"text"])) AND ("e"."scheduled_at" >= ("now"() - '180 days'::interval)))) AND ("e"."scheduled_at" <= "now"()))
          GROUP BY "p"."caregiver_id"
        ), "low_stock" AS (
         SELECT "p"."caregiver_id",
            ("count"(*))::integer AS "low_stock_count",
            "array_agg"("t"."name" ORDER BY "t"."name") AS "low_stock_names"
           FROM ("pats" "p"
             JOIN "public"."therapies" "t" ON (("t"."patient_id" = "p"."patient_id")))
          WHERE (("t"."pills_remaining" <= COALESCE("t"."low_stock_threshold", 10)) AND (COALESCE("t"."active", true) = true) AND (COALESCE("t"."suspended", false) = false))
          GROUP BY "p"."caregiver_id"
        ), "adh" AS (
         SELECT "p"."caregiver_id",
                CASE
                    WHEN ("count"(*) = 0) THEN 100
                    ELSE ("round"(((100.0 * ("sum"(
                    CASE
                        WHEN ("e"."status" = 'taken'::"text") THEN 1
                        ELSE 0
                    END))::numeric) / ("count"(*))::numeric)))::integer
                END AS "adherence_7d"
           FROM ("pats" "p"
             JOIN "public"."events" "e" ON (("e"."patient_id" = "p"."patient_id")))
          WHERE (("e"."scheduled_at" >= ("now"() - '7 days'::interval)) AND ("e"."scheduled_at" <= "now"()))
          GROUP BY "p"."caregiver_id"
        ), "pcount" AS (
         SELECT "pats"."caregiver_id",
            ("count"(*))::integer AS "patients_count"
           FROM "pats"
          GROUP BY "pats"."caregiver_id"
        )
 SELECT "cg"."caregiver_id",
    COALESCE("pcount"."patients_count", 0) AS "patients_count",
    COALESCE("alerts"."active_alerts", 0) AS "active_alerts",
    COALESCE("low_stock"."low_stock_count", 0) AS "low_stock_count",
    COALESCE("low_stock"."low_stock_names", ARRAY[]::"text"[]) AS "low_stock_names",
    COALESCE("adh"."adherence_7d", 100) AS "adherence_7d",
    "now"() AS "refreshed_at"
   FROM (((("cg"
     LEFT JOIN "pcount" ON (("pcount"."caregiver_id" = "cg"."caregiver_id")))
     LEFT JOIN "alerts" ON (("alerts"."caregiver_id" = "cg"."caregiver_id")))
     LEFT JOIN "low_stock" ON (("low_stock"."caregiver_id" = "cg"."caregiver_id")))
     LEFT JOIN "adh" ON (("adh"."caregiver_id" = "cg"."caregiver_id")))
  WITH NO DATA;


ALTER MATERIALIZED VIEW "public"."caregiver_dashboard_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."caregivers" (
    "id" "uuid" NOT NULL,
    "name" "text",
    "relation" "text",
    "photo" "text",
    "notify" "jsonb" DEFAULT '{"push": true, "email": false, "whatsapp": false}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."caregivers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "target_user_id" "uuid" NOT NULL,
    "kind" "text" DEFAULT 'info'::"text" NOT NULL,
    "severity" "text" DEFAULT 'info'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text",
    "patient_id" "text",
    "therapy_id" "text",
    "event_id" "text",
    "dose_key" "text",
    "read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


COMMENT ON TABLE "public"."notifications" IS 'INSERT: solo trigger SECURITY DEFINER (handle_dose_taken, handle_dose_status_change, process_dose_schedule) — service_role. SELECT: target_user_id = auth.uid() o caregiver del paziente. UPDATE: solo mark-as-read (target_user_id = auth.uid()). DELETE: solo cron giornaliero o RPC delete_my_account.';



CREATE TABLE IF NOT EXISTS "public"."patient_medical_profiles" (
    "patient_id" "text" NOT NULL,
    "blood_type" "text",
    "allergies" "text"[] DEFAULT '{}'::"text"[],
    "diagnoses" "text",
    "emergency_contacts" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "notes" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    CONSTRAINT "patient_medical_profiles_blood_type_check" CHECK ((("blood_type" = ANY (ARRAY['A+'::"text", 'A-'::"text", 'B+'::"text", 'B-'::"text", 'AB+'::"text", 'AB-'::"text", '0+'::"text", '0-'::"text"])) OR ("blood_type" IS NULL)))
);


ALTER TABLE "public"."patient_medical_profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."patient_medical_profiles" IS 'Scheda clinica di emergenza: una riga per paziente. Dati sensibili GDPR.';



COMMENT ON COLUMN "public"."patient_medical_profiles"."allergies" IS 'Array di allergie/intolleranze farmacologiche. Array vuoto = nessuna allergia nota.';



COMMENT ON COLUMN "public"."patient_medical_profiles"."diagnoses" IS 'Riepilogo patologie e note diagnostiche. NULL o stringa vuota = nessuna patologia registrata.';



COMMENT ON COLUMN "public"."patient_medical_profiles"."emergency_contacts" IS 'Array JSON di contatti emergenza: [{name: string, role: string, phone: string}]';



CREATE TABLE IF NOT EXISTS "public"."patients" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "photo" "text",
    "birth_year" integer,
    "user_id" "uuid",
    "owner_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "primary_caregiver_id" "uuid"
);


ALTER TABLE "public"."patients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "therapy_id" "text" NOT NULL,
    "delta" integer NOT NULL,
    "reason" "text" NOT NULL,
    "event_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."stock_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_consents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "version" "text" DEFAULT '2026-07-20'::"text" NOT NULL,
    "granted" boolean NOT NULL,
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revoked_at" timestamp with time zone,
    "user_agent" "text",
    "ip_hash" "text",
    "patient_id" "text",
    CONSTRAINT "user_consents_kind_check" CHECK (("kind" = ANY (ARRAY['terms_privacy'::"text", 'health_data'::"text", 'caregiver_authorization'::"text"]))),
    CONSTRAINT "user_consents_patient_id_required" CHECK (((("kind" = 'caregiver_authorization'::"text") AND ("patient_id" IS NOT NULL)) OR ("kind" <> 'caregiver_authorization'::"text")))
);


ALTER TABLE "public"."user_consents" OWNER TO "postgres";


COMMENT ON COLUMN "public"."user_consents"."patient_id" IS 'Valorizzato solo per kind=''caregiver_authorization'': collega la dichiarazione di autorizzazione al paziente specifico per cui il caregiver dichiara di avere titolo.';



CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vital_signs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patient_id" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "value_primary" numeric(6,2),
    "value_secondary" numeric(6,2),
    "pulse" integer,
    "unit" "text",
    "measured_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "vital_signs_bp_check" CHECK ((("kind" <> 'blood_pressure'::"text") OR (("value_primary" IS NOT NULL) AND ("value_secondary" IS NOT NULL)))),
    CONSTRAINT "vital_signs_kind_check" CHECK (("kind" = ANY (ARRAY['blood_pressure'::"text", 'glycemia'::"text", 'weight'::"text", 'saturation'::"text"]))),
    CONSTRAINT "vital_signs_value_check" CHECK (("value_primary" IS NOT NULL))
);


ALTER TABLE "public"."vital_signs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wellness_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patient_id" "text" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "mood" smallint,
    "symptoms" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "severity" "text",
    "note" "text",
    "therapy_id" "text",
    "event_id" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "wellness_notes_mood_check" CHECK ((("mood" IS NULL) OR (("mood" >= 1) AND ("mood" <= 5)))),
    CONSTRAINT "wellness_notes_not_empty" CHECK ((("mood" IS NOT NULL) OR ("array_length"("symptoms", 1) IS NOT NULL) OR (("note" IS NOT NULL) AND ("length"("btrim"("note")) > 0)))),
    CONSTRAINT "wellness_notes_severity_check" CHECK ((("severity" IS NULL) OR ("severity" = ANY (ARRAY['lieve'::"text", 'moderata'::"text", 'severa'::"text"]))))
);


ALTER TABLE "public"."wellness_notes" OWNER TO "postgres";


ALTER TABLE ONLY "public"."adherence_monthly"
    ADD CONSTRAINT "adherence_monthly_pkey" PRIMARY KEY ("patient_id", "therapy_id", "year", "month");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."caregiver_patients"
    ADD CONSTRAINT "caregiver_patients_pkey" PRIMARY KEY ("caregiver_id", "patient_id");



ALTER TABLE ONLY "public"."caregivers"
    ADD CONSTRAINT "caregivers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_therapy_id_scheduled_at_key" UNIQUE ("therapy_id", "scheduled_at");



ALTER TABLE ONLY "public"."family_invites"
    ADD CONSTRAINT "family_invites_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."family_invites"
    ADD CONSTRAINT "family_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patient_medical_profiles"
    ADD CONSTRAINT "patient_medical_profiles_pkey" PRIMARY KEY ("patient_id");



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."therapies"
    ADD CONSTRAINT "therapies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_consents"
    ADD CONSTRAINT "user_consents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE ("user_id", "role");



ALTER TABLE ONLY "public"."vital_signs"
    ADD CONSTRAINT "vital_signs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wellness_notes"
    ADD CONSTRAINT "wellness_notes_pkey" PRIMARY KEY ("id");



CREATE INDEX "adherence_monthly_patient_idx" ON "public"."adherence_monthly" USING "btree" ("patient_id", "year", "month");



CREATE UNIQUE INDEX "caregiver_dashboard_stats_pk" ON "public"."caregiver_dashboard_stats" USING "btree" ("caregiver_id");



CREATE INDEX "cp_caregiver_idx" ON "public"."caregiver_patients" USING "btree" ("caregiver_id");



CREATE INDEX "cp_patient_idx" ON "public"."caregiver_patients" USING "btree" ("patient_id");



CREATE INDEX "events_patient_idx" ON "public"."events" USING "btree" ("patient_id");



CREATE INDEX "events_scheduled_idx" ON "public"."events" USING "btree" ("scheduled_at");



CREATE INDEX "events_status_idx" ON "public"."events" USING "btree" ("status");



CREATE INDEX "family_invites_code_idx" ON "public"."family_invites" USING "btree" ("code");



CREATE INDEX "family_invites_patient_idx" ON "public"."family_invites" USING "btree" ("patient_id");



CREATE INDEX "idx_audit_log_actor_created" ON "public"."audit_log" USING "btree" ("actor_id", "created_at" DESC);



CREATE INDEX "idx_audit_log_patient_created" ON "public"."audit_log" USING "btree" ("patient_id", "created_at" DESC);



CREATE INDEX "idx_audit_log_table_record" ON "public"."audit_log" USING "btree" ("table_name", "record_id");



CREATE INDEX "idx_audit_log_view_dedup" ON "public"."audit_log" USING "btree" ("patient_id", "actor_id", "created_at" DESC) WHERE ("action" = 'patient_viewed'::"text");



CREATE INDEX "idx_caregiver_patients_caregiver" ON "public"."caregiver_patients" USING "btree" ("caregiver_id");



CREATE INDEX "idx_events_patient_scheduled" ON "public"."events" USING "btree" ("patient_id", "scheduled_at" DESC);



CREATE INDEX "idx_events_pending_ack" ON "public"."events" USING "btree" ("patient_id", "scheduled_at" DESC) WHERE (("status" = ANY (ARRAY['missed'::"text", 'skipped'::"text"])) AND (("note" IS NULL) OR (("note" !~~ '%caregiver_ack%'::"text") AND ("note" !~~ '%CG_ACK%'::"text"))));



CREATE INDEX "idx_events_therapy_scheduled" ON "public"."events" USING "btree" ("therapy_id", "scheduled_at" DESC);



CREATE INDEX "idx_notifications_target_created" ON "public"."notifications" USING "btree" ("target_user_id", "created_at" DESC);



CREATE INDEX "idx_profiles_subscription_plan" ON "public"."profiles" USING "btree" ("id", "subscription_plan");



CREATE INDEX "idx_stock_movements_therapy_created" ON "public"."stock_movements" USING "btree" ("therapy_id", "created_at" DESC);



CREATE INDEX "idx_therapies_patient" ON "public"."therapies" USING "btree" ("patient_id");



CREATE UNIQUE INDEX "notifications_dose_key_idx" ON "public"."notifications" USING "btree" ("target_user_id", "dose_key") WHERE ("dose_key" IS NOT NULL);



CREATE UNIQUE INDEX "notifications_dose_key_target_uniq" ON "public"."notifications" USING "btree" ("target_user_id", "dose_key") WHERE ("dose_key" IS NOT NULL);



CREATE INDEX "notifications_target_created_idx" ON "public"."notifications" USING "btree" ("target_user_id", "created_at" DESC);



CREATE INDEX "notifications_target_idx" ON "public"."notifications" USING "btree" ("target_user_id", "read");



CREATE INDEX "patients_owner_idx" ON "public"."patients" USING "btree" ("owner_user_id");



CREATE INDEX "patients_primary_caregiver_idx" ON "public"."patients" USING "btree" ("primary_caregiver_id");



CREATE INDEX "patients_user_id_idx" ON "public"."patients" USING "btree" ("user_id");



CREATE INDEX "stock_therapy_idx" ON "public"."stock_movements" USING "btree" ("therapy_id");



CREATE INDEX "therapies_patient_idx" ON "public"."therapies" USING "btree" ("patient_id");



CREATE INDEX "user_consents_patient_idx" ON "public"."user_consents" USING "btree" ("patient_id", "kind") WHERE ("patient_id" IS NOT NULL);



CREATE INDEX "user_consents_user_kind_idx" ON "public"."user_consents" USING "btree" ("user_id", "kind", "granted_at" DESC);



CREATE INDEX "vital_signs_patient_kind_measured_idx" ON "public"."vital_signs" USING "btree" ("patient_id", "kind", "measured_at" DESC);



CREATE INDEX "vital_signs_patient_measured_idx" ON "public"."vital_signs" USING "btree" ("patient_id", "measured_at" DESC);



CREATE INDEX "wellness_notes_patient_occurred_idx" ON "public"."wellness_notes" USING "btree" ("patient_id", "occurred_at" DESC);



CREATE INDEX "wellness_notes_therapy_idx" ON "public"."wellness_notes" USING "btree" ("therapy_id", "occurred_at" DESC) WHERE ("therapy_id" IS NOT NULL);



CREATE OR REPLACE TRIGGER "trg_audit_caregiver_patients" AFTER INSERT OR DELETE ON "public"."caregiver_patients" FOR EACH ROW EXECUTE FUNCTION "public"."trg_audit_caregiver_patients"();



CREATE OR REPLACE TRIGGER "trg_audit_events_status" AFTER UPDATE OF "status" ON "public"."events" FOR EACH ROW WHEN (("old"."status" IS DISTINCT FROM "new"."status")) EXECUTE FUNCTION "public"."_audit_row_capture"();



CREATE OR REPLACE TRIGGER "trg_audit_patient_primary" AFTER UPDATE OF "primary_caregiver_id" ON "public"."patients" FOR EACH ROW EXECUTE FUNCTION "public"."trg_audit_patient_primary"();



CREATE OR REPLACE TRIGGER "trg_audit_patients" AFTER INSERT OR DELETE OR UPDATE ON "public"."patients" FOR EACH ROW EXECUTE FUNCTION "public"."_audit_row_capture"();



CREATE OR REPLACE TRIGGER "trg_audit_therapies" AFTER INSERT OR DELETE OR UPDATE OF "name", "dosage", "quantity", "times", "suspended", "active", "end_date" ON "public"."therapies" FOR EACH ROW EXECUTE FUNCTION "public"."trg_audit_therapies"();



CREATE OR REPLACE TRIGGER "trg_cascade_plan_on_own_plan_change" AFTER UPDATE OF "subscription_plan_own" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."trg_cascade_plan_on_own_plan_change"();



CREATE OR REPLACE TRIGGER "trg_dose_status_change" AFTER INSERT OR UPDATE OF "status" ON "public"."events" FOR EACH ROW EXECUTE FUNCTION "public"."handle_dose_status_change"();



CREATE OR REPLACE TRIGGER "trg_dose_status_change_ins" AFTER INSERT ON "public"."events" FOR EACH ROW WHEN (("new"."status" = ANY (ARRAY['snoozed'::"text", 'skipped'::"text", 'missed'::"text"]))) EXECUTE FUNCTION "public"."handle_dose_status_change"();



CREATE OR REPLACE TRIGGER "trg_dose_status_change_upd" AFTER UPDATE OF "status" ON "public"."events" FOR EACH ROW WHEN ((("new"."status" = ANY (ARRAY['snoozed'::"text", 'skipped'::"text", 'missed'::"text"])) AND ("old"."status" IS DISTINCT FROM "new"."status"))) EXECUTE FUNCTION "public"."handle_dose_status_change"();



CREATE OR REPLACE TRIGGER "trg_dose_taken" AFTER INSERT OR UPDATE OF "status" ON "public"."events" FOR EACH ROW EXECUTE FUNCTION "public"."handle_dose_taken"();



CREATE OR REPLACE TRIGGER "trg_dose_taken_ins" AFTER INSERT ON "public"."events" FOR EACH ROW WHEN (("new"."status" = 'taken'::"text")) EXECUTE FUNCTION "public"."handle_dose_taken"();



CREATE OR REPLACE TRIGGER "trg_dose_taken_upd" AFTER UPDATE OF "status" ON "public"."events" FOR EACH ROW WHEN ((("new"."status" = 'taken'::"text") AND ("old"."status" IS DISTINCT FROM 'taken'::"text"))) EXECUTE FUNCTION "public"."handle_dose_taken"();



CREATE OR REPLACE TRIGGER "trg_medical_profile_updated_at" BEFORE UPDATE ON "public"."patient_medical_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_sync_plan_caregiver_patients" AFTER INSERT OR DELETE ON "public"."caregiver_patients" FOR EACH ROW EXECUTE FUNCTION "public"."trg_sync_plan_on_membership_change"();



CREATE OR REPLACE TRIGGER "trg_sync_plan_patients" AFTER INSERT OR UPDATE OF "owner_user_id", "primary_caregiver_id" ON "public"."patients" FOR EACH ROW EXECUTE FUNCTION "public"."trg_sync_plan_on_patient_owner_change"();



CREATE OR REPLACE TRIGGER "trg_vital_signs_updated_at" BEFORE UPDATE ON "public"."vital_signs" FOR EACH ROW EXECUTE FUNCTION "public"."vital_signs_touch_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_check_caregiver_invite_limit" BEFORE INSERT ON "public"."caregiver_patients" FOR EACH ROW EXECUTE FUNCTION "public"."check_caregiver_invite_limit"();



CREATE OR REPLACE TRIGGER "trigger_check_patient_limit" BEFORE INSERT ON "public"."patients" FOR EACH ROW EXECUTE FUNCTION "public"."check_patient_limit"();



CREATE OR REPLACE TRIGGER "trigger_check_therapy_limit" BEFORE INSERT OR UPDATE ON "public"."therapies" FOR EACH ROW EXECUTE FUNCTION "public"."check_therapy_limit"();



CREATE OR REPLACE TRIGGER "wellness_notes_set_updated_at" BEFORE UPDATE ON "public"."wellness_notes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."adherence_monthly"
    ADD CONSTRAINT "adherence_monthly_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."caregiver_patients"
    ADD CONSTRAINT "caregiver_patients_caregiver_id_fkey" FOREIGN KEY ("caregiver_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."caregiver_patients"
    ADD CONSTRAINT "caregiver_patients_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."caregivers"
    ADD CONSTRAINT "caregivers_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_therapy_id_fkey" FOREIGN KEY ("therapy_id") REFERENCES "public"."therapies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."family_invites"
    ADD CONSTRAINT "family_invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."family_invites"
    ADD CONSTRAINT "family_invites_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."family_invites"
    ADD CONSTRAINT "family_invites_used_by_fkey" FOREIGN KEY ("used_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_therapy_id_fkey" FOREIGN KEY ("therapy_id") REFERENCES "public"."therapies"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."patient_medical_profiles"
    ADD CONSTRAINT "patient_medical_profiles_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_medical_profiles"
    ADD CONSTRAINT "patient_medical_profiles_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_primary_caregiver_id_fkey" FOREIGN KEY ("primary_caregiver_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_therapy_id_fkey" FOREIGN KEY ("therapy_id") REFERENCES "public"."therapies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."therapies"
    ADD CONSTRAINT "therapies_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_consents"
    ADD CONSTRAINT "user_consents_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_consents"
    ADD CONSTRAINT "user_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vital_signs"
    ADD CONSTRAINT "vital_signs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vital_signs"
    ADD CONSTRAINT "vital_signs_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wellness_notes"
    ADD CONSTRAINT "wellness_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."wellness_notes"
    ADD CONSTRAINT "wellness_notes_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."wellness_notes"
    ADD CONSTRAINT "wellness_notes_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wellness_notes"
    ADD CONSTRAINT "wellness_notes_therapy_id_fkey" FOREIGN KEY ("therapy_id") REFERENCES "public"."therapies"("id") ON DELETE SET NULL;



ALTER TABLE "public"."adherence_monthly" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "adherence_monthly: read if linked to patient" ON "public"."adherence_monthly" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."patients" "p"
  WHERE (("p"."id" = "adherence_monthly"."patient_id") AND (("p"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."caregiver_patients" "cp"
          WHERE (("cp"."patient_id" = "p"."id") AND ("cp"."caregiver_id" = "auth"."uid"())))))))));



CREATE POLICY "audit: read linked" ON "public"."audit_log" FOR SELECT TO "authenticated" USING ((("patient_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."patients" "p"
  WHERE (("p"."id" = "audit_log"."patient_id") AND (("p"."user_id" = "auth"."uid"()) OR ("p"."owner_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."caregiver_patients" "cp"
          WHERE (("cp"."patient_id" = "p"."id") AND ("cp"."caregiver_id" = "auth"."uid"()))))))))));



ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_log: read linked" ON "public"."audit_log" FOR SELECT TO "authenticated" USING ((("actor_id" = "auth"."uid"()) OR (("patient_id" IS NOT NULL) AND ("public"."owns_patient"("patient_id") OR "public"."is_caregiver_of"("patient_id")))));



ALTER TABLE "public"."caregiver_patients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."caregivers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "caregivers: family peers read" ON "public"."caregivers" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."caregiver_patients" "cp1"
     JOIN "public"."caregiver_patients" "cp2" ON (("cp1"."patient_id" = "cp2"."patient_id")))
  WHERE (("cp1"."caregiver_id" = "auth"."uid"()) AND ("cp2"."caregiver_id" = "caregivers"."id")))));



CREATE POLICY "caregivers: patient can read linked" ON "public"."caregivers" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."caregiver_patients" "cp"
     JOIN "public"."patients" "p" ON (("p"."id" = "cp"."patient_id")))
  WHERE (("cp"."caregiver_id" = "caregivers"."id") AND ("p"."user_id" = "auth"."uid"())))));



CREATE POLICY "caregivers: self read" ON "public"."caregivers" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "caregivers: self update" ON "public"."caregivers" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "caregivers: self upsert" ON "public"."caregivers" FOR INSERT TO "authenticated" WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "cp: caregiver can unfollow" ON "public"."caregiver_patients" FOR DELETE TO "authenticated" USING (("caregiver_id" = "auth"."uid"()));



CREATE POLICY "cp: caregiver can update own" ON "public"."caregiver_patients" FOR UPDATE TO "authenticated" USING (("caregiver_id" = "auth"."uid"())) WITH CHECK (("caregiver_id" = "auth"."uid"()));



CREATE POLICY "cp: family peers read" ON "public"."caregiver_patients" FOR SELECT TO "authenticated" USING ((("caregiver_id" = "auth"."uid"()) OR "public"."owns_patient"("patient_id") OR "public"."is_caregiver_of"("patient_id")));



CREATE POLICY "cp: primary can remove secondary" ON "public"."caregiver_patients" FOR DELETE TO "authenticated" USING (("public"."is_primary_of"("patient_id") AND ("caregiver_id" <> "auth"."uid"())));



CREATE POLICY "cp: read own" ON "public"."caregiver_patients" FOR SELECT TO "authenticated" USING ((("caregiver_id" = "auth"."uid"()) OR "public"."owns_patient"("patient_id")));



ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "events: delete primary" ON "public"."events" FOR DELETE TO "authenticated" USING ("public"."is_primary_of"("patient_id"));



CREATE POLICY "events: insert primary" ON "public"."events" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_primary_of"("patient_id"));



CREATE POLICY "events: read linked" ON "public"."events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."patients" "p"
  WHERE (("p"."id" = "events"."patient_id") AND (("p"."user_id" = "auth"."uid"()) OR ("p"."owner_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."caregiver_patients" "cp"
          WHERE (("cp"."patient_id" = "p"."id") AND ("cp"."caregiver_id" = "auth"."uid"())))))))));



CREATE POLICY "events: update linked" ON "public"."events" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."patients" "p"
  WHERE (("p"."id" = "events"."patient_id") AND (("p"."user_id" = "auth"."uid"()) OR ("p"."owner_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."caregiver_patients" "cp"
          WHERE (("cp"."patient_id" = "p"."id") AND ("cp"."caregiver_id" = "auth"."uid"()))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."patients" "p"
  WHERE (("p"."id" = "events"."patient_id") AND (("p"."user_id" = "auth"."uid"()) OR ("p"."owner_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."caregiver_patients" "cp"
          WHERE (("cp"."patient_id" = "p"."id") AND ("cp"."caregiver_id" = "auth"."uid"())))))))));



ALTER TABLE "public"."family_invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invites: owner or primary delete" ON "public"."family_invites" FOR DELETE TO "authenticated" USING ((("created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."patients" "p"
  WHERE (("p"."id" = "family_invites"."patient_id") AND (("p"."user_id" = "auth"."uid"()) OR ("p"."owner_user_id" = "auth"."uid"()) OR (("p"."owner_user_id" IS NULL) AND ("p"."primary_caregiver_id" = "auth"."uid"()))))))));



CREATE POLICY "invites: owner or primary read" ON "public"."family_invites" FOR SELECT TO "authenticated" USING ((("created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."patients" "p"
  WHERE (("p"."id" = "family_invites"."patient_id") AND (("p"."user_id" = "auth"."uid"()) OR ("p"."owner_user_id" = "auth"."uid"()) OR (("p"."owner_user_id" IS NULL) AND ("p"."primary_caregiver_id" = "auth"."uid"()))))))));



CREATE POLICY "medical_profile: delete primary" ON "public"."patient_medical_profiles" FOR DELETE TO "authenticated" USING ("public"."is_primary_of"("patient_id"));



CREATE POLICY "medical_profile: insert primary" ON "public"."patient_medical_profiles" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_primary_of"("patient_id"));



CREATE POLICY "medical_profile: read linked" ON "public"."patient_medical_profiles" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."patients" "p"
  WHERE (("p"."id" = "patient_medical_profiles"."patient_id") AND (("p"."user_id" = "auth"."uid"()) OR ("p"."owner_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."caregiver_patients" "cp"
          WHERE (("cp"."patient_id" = "p"."id") AND ("cp"."caregiver_id" = "auth"."uid"())))))))));



CREATE POLICY "medical_profile: update primary" ON "public"."patient_medical_profiles" FOR UPDATE TO "authenticated" USING ("public"."is_primary_of"("patient_id")) WITH CHECK ("public"."is_primary_of"("patient_id"));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications: mark own read" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("target_user_id" = "auth"."uid"())) WITH CHECK (("target_user_id" = "auth"."uid"()));



CREATE POLICY "notifications: read own or caregiver of patient" ON "public"."notifications" FOR SELECT TO "authenticated" USING ((("target_user_id" = "auth"."uid"()) OR (("patient_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."patients" "p"
  WHERE (("p"."id" = "notifications"."patient_id") AND (("p"."user_id" = "auth"."uid"()) OR ("p"."owner_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."caregiver_patients" "cp"
          WHERE (("cp"."patient_id" = "p"."id") AND ("cp"."caregiver_id" = "auth"."uid"())))))))))));



ALTER TABLE "public"."patient_medical_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."patients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "patients: insert self or as caregiver" ON "public"."patients" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) OR ("public"."has_role"("auth"."uid"(), 'caregiver'::"public"."app_role") AND (("owner_user_id" IS NULL) OR ("owner_user_id" = "auth"."uid"())))));



CREATE POLICY "patients: primary or self delete" ON "public"."patients" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_primary_of"("id")));



CREATE POLICY "patients: primary or self update" ON "public"."patients" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_primary_of"("id"))) WITH CHECK ((("user_id" = "auth"."uid"()) OR "public"."is_primary_of"("id")));



CREATE POLICY "patients: silo read" ON "public"."patients" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("owner_user_id" = "auth"."uid"()) OR "public"."is_caregiver_of"("id")));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles: caregiver can read followed patients" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."caregiver_patients" "cp"
     JOIN "public"."patients" "p" ON (("p"."id" = "cp"."patient_id")))
  WHERE (("cp"."caregiver_id" = "auth"."uid"()) AND ("p"."user_id" = "profiles"."id")))));



CREATE POLICY "profiles: self read" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "profiles: self update" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "profiles: self upsert" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "stock: insert primary" ON "public"."stock_movements" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."therapies" "t"
  WHERE (("t"."id" = "stock_movements"."therapy_id") AND "public"."is_primary_of"("t"."patient_id")))));



CREATE POLICY "stock: read se accesso alla terapia" ON "public"."stock_movements" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."therapies" "t"
     JOIN "public"."patients" "p" ON (("p"."id" = "t"."patient_id")))
  WHERE (("t"."id" = "stock_movements"."therapy_id") AND (("p"."user_id" = "auth"."uid"()) OR ("p"."owner_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."caregiver_patients" "cp"
          WHERE (("cp"."patient_id" = "p"."id") AND ("cp"."caregiver_id" = "auth"."uid"())))))))));



ALTER TABLE "public"."stock_movements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."therapies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "therapies: delete primary" ON "public"."therapies" FOR DELETE TO "authenticated" USING ("public"."is_primary_of"("patient_id"));



CREATE POLICY "therapies: insert primary" ON "public"."therapies" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_primary_of"("patient_id"));



CREATE POLICY "therapies: read linked" ON "public"."therapies" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."patients" "p"
  WHERE (("p"."id" = "therapies"."patient_id") AND (("p"."user_id" = "auth"."uid"()) OR ("p"."owner_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."caregiver_patients" "cp"
          WHERE (("cp"."patient_id" = "p"."id") AND ("cp"."caregiver_id" = "auth"."uid"())))))))));



CREATE POLICY "therapies: update primary" ON "public"."therapies" FOR UPDATE TO "authenticated" USING ("public"."is_primary_of"("patient_id")) WITH CHECK ("public"."is_primary_of"("patient_id"));



CREATE POLICY "user inserts own consents" ON "public"."user_consents" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "user reads own consents" ON "public"."user_consents" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."user_consents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_roles: self insert" ON "public"."user_roles" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND ("role" = ANY (ARRAY['caregiver'::"public"."app_role", 'paziente'::"public"."app_role"]))));



CREATE POLICY "user_roles: self read" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_roles: self update" ON "public"."user_roles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK ((("auth"."uid"() = "user_id") AND ("role" = ANY (ARRAY['caregiver'::"public"."app_role", 'paziente'::"public"."app_role"]))));



ALTER TABLE "public"."vital_signs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vital_signs: delete primary" ON "public"."vital_signs" FOR DELETE TO "authenticated" USING (("public"."is_primary_of"("patient_id") OR ("created_by" = "auth"."uid"())));



CREATE POLICY "vital_signs: insert linked" ON "public"."vital_signs" FOR INSERT TO "authenticated" WITH CHECK ((("public"."get_patient_owner_plan"("patient_id") = ANY (ARRAY['pro'::"text", 'max'::"text"])) AND (EXISTS ( SELECT 1
   FROM "public"."patients" "p"
  WHERE (("p"."id" = "vital_signs"."patient_id") AND (("p"."user_id" = "auth"."uid"()) OR ("p"."owner_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."caregiver_patients" "cp"
          WHERE (("cp"."patient_id" = "p"."id") AND ("cp"."caregiver_id" = "auth"."uid"()))))))))));



CREATE POLICY "vital_signs: read linked" ON "public"."vital_signs" FOR SELECT TO "authenticated" USING ((("public"."get_patient_owner_plan"("patient_id") = ANY (ARRAY['pro'::"text", 'max'::"text"])) AND (EXISTS ( SELECT 1
   FROM "public"."patients" "p"
  WHERE (("p"."id" = "vital_signs"."patient_id") AND (("p"."user_id" = "auth"."uid"()) OR ("p"."owner_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."caregiver_patients" "cp"
          WHERE (("cp"."patient_id" = "p"."id") AND ("cp"."caregiver_id" = "auth"."uid"()))))))))));



CREATE POLICY "vital_signs: update linked" ON "public"."vital_signs" FOR UPDATE TO "authenticated" USING (("public"."is_primary_of"("patient_id") OR ("created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."patients" "p"
  WHERE (("p"."id" = "vital_signs"."patient_id") AND ("p"."user_id" = "auth"."uid"())))))) WITH CHECK (("public"."is_primary_of"("patient_id") OR ("created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."patients" "p"
  WHERE (("p"."id" = "vital_signs"."patient_id") AND ("p"."user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."wellness_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wellness_notes: delete author" ON "public"."wellness_notes" FOR DELETE TO "authenticated" USING ((("created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."patients" "p"
  WHERE (("p"."id" = "wellness_notes"."patient_id") AND (("p"."user_id" = "auth"."uid"()) OR ("p"."owner_user_id" = "auth"."uid"()) OR ("p"."primary_caregiver_id" = "auth"."uid"())))))));



CREATE POLICY "wellness_notes: insert linked" ON "public"."wellness_notes" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."patients" "p"
  WHERE (("p"."id" = "wellness_notes"."patient_id") AND (("p"."user_id" = "auth"."uid"()) OR ("p"."owner_user_id" = "auth"."uid"()) OR ("p"."primary_caregiver_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."caregiver_patients" "cp"
          WHERE (("cp"."patient_id" = "p"."id") AND ("cp"."caregiver_id" = "auth"."uid"())))))))));



CREATE POLICY "wellness_notes: read linked" ON "public"."wellness_notes" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."patients" "p"
  WHERE (("p"."id" = "wellness_notes"."patient_id") AND (("p"."user_id" = "auth"."uid"()) OR ("p"."owner_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."caregiver_patients" "cp"
          WHERE (("cp"."patient_id" = "p"."id") AND ("cp"."caregiver_id" = "auth"."uid"())))))))) AND (("public"."get_patient_owner_plan"("patient_id") = ANY (ARRAY['pro'::"text", 'max'::"text"])) OR ("occurred_at" >= ("now"() - '7 days'::interval)))));



CREATE POLICY "wellness_notes: update author" ON "public"."wellness_notes" FOR UPDATE TO "authenticated" USING ((("created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."patients" "p"
  WHERE (("p"."id" = "wellness_notes"."patient_id") AND (("p"."user_id" = "auth"."uid"()) OR ("p"."owner_user_id" = "auth"."uid"()) OR ("p"."primary_caregiver_id" = "auth"."uid"()))))))) WITH CHECK ((("created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."patients" "p"
  WHERE (("p"."id" = "wellness_notes"."patient_id") AND (("p"."user_id" = "auth"."uid"()) OR ("p"."owner_user_id" = "auth"."uid"()) OR ("p"."primary_caregiver_id" = "auth"."uid"())))))));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."events";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notifications";






REVOKE USAGE ON SCHEMA "public" FROM PUBLIC;
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";














































































































































































REVOKE ALL ON FUNCTION "public"."_audit_row_capture"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."_get_notes_encryption_key"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."cleanup_vital_signs"() FROM PUBLIC;



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."family_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."family_invites" TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_family_invite"("_patient_id" "text", "_ttl_minutes" integer, "_max_uses" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_family_invite"("_patient_id" "text", "_ttl_minutes" integer, "_max_uses" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."decrypt_therapy_note"("_therapy_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."decrypt_therapy_note"("_therapy_id" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."delete_my_account"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_my_account"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."encrypt_therapy_note"("_plain" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."export_my_data"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."export_my_data"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_family_group_data"("_patient_id" "text", "_audit_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_family_group_data"("_patient_id" "text", "_audit_limit" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_my_caregiver_stats"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_caregiver_stats"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_my_caregivers"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_caregivers"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_my_patients"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_patients"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_patient_dose_history"("p_patient_id" "text", "p_days" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_patient_dose_history"("p_patient_id" "text", "p_days" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."handle_dose_status_change"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."handle_dose_taken"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."is_caregiver_of"("_patient_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_caregiver_of"("_patient_id" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."log_gdpr_event"("_action" "text", "_patient_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_gdpr_event"("_action" "text", "_patient_id" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."log_patient_view"("_patient_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_patient_view"("_patient_id" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owns_patient"("_patient_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owns_patient"("_patient_id" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."process_dose_schedule"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_dose_schedule"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."redeem_family_invite"("_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."redeem_family_invite"("_code" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."refresh_caregiver_dashboard_stats"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_caregiver_dashboard_stats"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_my_caregiver_stats"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_my_caregiver_stats"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."reset_patient_history"("_patient_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_patient_history"("_patient_id" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."revoke_my_consent"("_kind" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revoke_my_consent"("_kind" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."rollup_adherence_monthly"("p_year" integer, "p_month" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rollup_adherence_monthly"("p_year" integer, "p_month" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."run_dose_scheduler"() FROM PUBLIC;



GRANT ALL ON FUNCTION "public"."wellness_symptom_correlation"("_patient_id" "text", "_days" integer, "_window_hours" integer) TO "authenticated";
























GRANT SELECT ON TABLE "public"."adherence_monthly" TO "authenticated";



GRANT SELECT ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT SELECT,DELETE,UPDATE ON TABLE "public"."caregiver_patients" TO "authenticated";
GRANT ALL ON TABLE "public"."caregiver_patients" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT SELECT,INSERT,UPDATE ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."therapies" TO "authenticated";
GRANT ALL ON TABLE "public"."therapies" TO "service_role";



GRANT SELECT,INSERT,UPDATE ON TABLE "public"."caregivers" TO "authenticated";
GRANT ALL ON TABLE "public"."caregivers" TO "service_role";



GRANT SELECT,UPDATE ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."patients" TO "authenticated";
GRANT ALL ON TABLE "public"."patients" TO "service_role";



GRANT SELECT,INSERT ON TABLE "public"."stock_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_movements" TO "service_role";



GRANT SELECT,INSERT ON TABLE "public"."user_consents" TO "authenticated";
GRANT ALL ON TABLE "public"."user_consents" TO "service_role";



GRANT SELECT,INSERT,UPDATE ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."vital_signs" TO "authenticated";
GRANT ALL ON TABLE "public"."vital_signs" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."wellness_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."wellness_notes" TO "service_role";


































