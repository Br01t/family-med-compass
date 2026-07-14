


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
      and (p.user_id = auth.uid() or p.owner_user_id = auth.uid())
  ) then
    raise exception 'Non autorizzato a creare inviti per questo paziente' using errcode = '42501';
  end if;

  if _ttl_minutes is null or _ttl_minutes <= 0 then _ttl_minutes := 1440; end if;
  if _max_uses is null or _max_uses <= 0 then _max_uses := 1; end if;

  loop
    v_attempt := v_attempt + 1;
    -- 6 char alphanumeric (no ambiguous 0/O/1/I)
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


CREATE OR REPLACE FUNCTION "public"."handle_dose_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$DECLARE
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
                  || ' — rimandata).';
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
END;$$;


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

  update public.family_invites
    set uses = uses + 1,
        used_by = auth.uid(),
        used_at = now()
    where id = v_invite.id;

  return v_invite.patient_id;
end;
$$;


ALTER FUNCTION "public"."redeem_family_invite"("_code" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."caregiver_patients" (
    "caregiver_id" "uuid" NOT NULL,
    "patient_id" "text" NOT NULL,
    "relationship" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."caregiver_patients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."caregivers" (
    "id" "uuid" NOT NULL,
    "name" "text",
    "relation" "text",
    "photo" "text",
    "notify" "jsonb" DEFAULT '{"push": true, "email": false, "whatsapp": false}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."caregivers" OWNER TO "postgres";


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

ALTER TABLE ONLY "public"."events" REPLICA IDENTITY FULL;


ALTER TABLE "public"."events" OWNER TO "postgres";


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

ALTER TABLE ONLY "public"."notifications" REPLICA IDENTITY FULL;


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."patients" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "photo" "text",
    "birth_year" integer,
    "user_id" "uuid",
    "owner_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."patients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "name" "text",
    "role" "public"."app_role" DEFAULT 'caregiver'::"public"."app_role" NOT NULL,
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "therapy_id" "text" NOT NULL,
    "delta" integer NOT NULL,
    "reason" "text" NOT NULL,
    "event_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."stock_movements" OWNER TO "postgres";


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
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."therapies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


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



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."therapies"
    ADD CONSTRAINT "therapies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE ("user_id", "role");



CREATE INDEX "cp_patient_idx" ON "public"."caregiver_patients" USING "btree" ("patient_id");



CREATE INDEX "events_patient_idx" ON "public"."events" USING "btree" ("patient_id");



CREATE INDEX "events_scheduled_idx" ON "public"."events" USING "btree" ("scheduled_at");



CREATE INDEX "events_status_idx" ON "public"."events" USING "btree" ("status");



CREATE INDEX "family_invites_code_idx" ON "public"."family_invites" USING "btree" ("code");



CREATE INDEX "family_invites_patient_idx" ON "public"."family_invites" USING "btree" ("patient_id");



CREATE UNIQUE INDEX "notifications_dose_key_idx" ON "public"."notifications" USING "btree" ("target_user_id", "dose_key") WHERE ("dose_key" IS NOT NULL);



CREATE UNIQUE INDEX "notifications_dose_key_target_uniq" ON "public"."notifications" USING "btree" ("target_user_id", "dose_key") WHERE ("dose_key" IS NOT NULL);



CREATE INDEX "notifications_target_idx" ON "public"."notifications" USING "btree" ("target_user_id", "read");



CREATE INDEX "patients_owner_idx" ON "public"."patients" USING "btree" ("owner_user_id");



CREATE INDEX "patients_user_id_idx" ON "public"."patients" USING "btree" ("user_id");



CREATE INDEX "stock_therapy_idx" ON "public"."stock_movements" USING "btree" ("therapy_id");



CREATE INDEX "therapies_patient_idx" ON "public"."therapies" USING "btree" ("patient_id");



CREATE OR REPLACE TRIGGER "trg_dose_status_change_ins" AFTER INSERT ON "public"."events" FOR EACH ROW WHEN (("new"."status" = ANY (ARRAY['snoozed'::"text", 'skipped'::"text", 'missed'::"text"]))) EXECUTE FUNCTION "public"."handle_dose_status_change"();



CREATE OR REPLACE TRIGGER "trg_dose_status_change_upd" AFTER UPDATE OF "status" ON "public"."events" FOR EACH ROW WHEN ((("new"."status" = ANY (ARRAY['snoozed'::"text", 'skipped'::"text", 'missed'::"text"])) AND ("old"."status" IS DISTINCT FROM "new"."status"))) EXECUTE FUNCTION "public"."handle_dose_status_change"();



CREATE OR REPLACE TRIGGER "trg_dose_taken_ins" AFTER INSERT ON "public"."events" FOR EACH ROW WHEN (("new"."status" = 'taken'::"text")) EXECUTE FUNCTION "public"."handle_dose_taken"();



CREATE OR REPLACE TRIGGER "trg_dose_taken_upd" AFTER UPDATE OF "status" ON "public"."events" FOR EACH ROW WHEN ((("new"."status" = 'taken'::"text") AND ("old"."status" IS DISTINCT FROM 'taken'::"text"))) EXECUTE FUNCTION "public"."handle_dose_taken"();



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



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



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



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



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



CREATE POLICY "cp: read own" ON "public"."caregiver_patients" FOR SELECT TO "authenticated" USING ((("caregiver_id" = "auth"."uid"()) OR "public"."owns_patient"("patient_id")));



ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "events: rw se paziente o caregiver linked" ON "public"."events" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."patients" "p"
  WHERE (("p"."id" = "events"."patient_id") AND (("p"."user_id" = "auth"."uid"()) OR ("p"."owner_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."caregiver_patients" "cp"
          WHERE (("cp"."patient_id" = "p"."id") AND ("cp"."caregiver_id" = "auth"."uid"())))))))));



ALTER TABLE "public"."family_invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invites: owner delete" ON "public"."family_invites" FOR DELETE TO "authenticated" USING ((("created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."patients" "p"
  WHERE (("p"."id" = "family_invites"."patient_id") AND (("p"."user_id" = "auth"."uid"()) OR ("p"."owner_user_id" = "auth"."uid"())))))));



CREATE POLICY "invites: owner read" ON "public"."family_invites" FOR SELECT TO "authenticated" USING ((("created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."patients" "p"
  WHERE (("p"."id" = "family_invites"."patient_id") AND (("p"."user_id" = "auth"."uid"()) OR ("p"."owner_user_id" = "auth"."uid"())))))));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications: insert if linked to patient" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK ((("patient_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."patients" "p"
  WHERE (("p"."id" = "notifications"."patient_id") AND (("p"."user_id" = "auth"."uid"()) OR ("p"."owner_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."caregiver_patients" "cp"
          WHERE (("cp"."patient_id" = "p"."id") AND ("cp"."caregiver_id" = "auth"."uid"()))))))))));



CREATE POLICY "notifications: mark own read" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("target_user_id" = "auth"."uid"())) WITH CHECK (("target_user_id" = "auth"."uid"()));



CREATE POLICY "notifications: read own or caregiver of patient" ON "public"."notifications" FOR SELECT TO "authenticated" USING ((("target_user_id" = "auth"."uid"()) OR (("patient_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."patients" "p"
  WHERE (("p"."id" = "notifications"."patient_id") AND (("p"."user_id" = "auth"."uid"()) OR ("p"."owner_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."caregiver_patients" "cp"
          WHERE (("cp"."patient_id" = "p"."id") AND ("cp"."caregiver_id" = "auth"."uid"())))))))))));



ALTER TABLE "public"."patients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "patients: insert self or as caregiver" ON "public"."patients" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) OR ("public"."has_role"("auth"."uid"(), 'caregiver'::"public"."app_role") AND (("owner_user_id" IS NULL) OR ("owner_user_id" = "auth"."uid"())))));



CREATE POLICY "patients: owner or linked caregiver delete" ON "public"."patients" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("owner_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."caregiver_patients" "cp"
  WHERE (("cp"."patient_id" = "patients"."id") AND ("cp"."caregiver_id" = "auth"."uid"()))))));



CREATE POLICY "patients: owner or linked caregiver update" ON "public"."patients" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("owner_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."caregiver_patients" "cp"
  WHERE (("cp"."patient_id" = "patients"."id") AND ("cp"."caregiver_id" = "auth"."uid"()))))));



CREATE POLICY "patients: silo read" ON "public"."patients" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("owner_user_id" = "auth"."uid"()) OR "public"."is_caregiver_of"("id")));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles: caregiver can read followed patients" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."caregiver_patients" "cp"
     JOIN "public"."patients" "p" ON (("p"."id" = "cp"."patient_id")))
  WHERE (("cp"."caregiver_id" = "auth"."uid"()) AND ("p"."user_id" = "profiles"."id")))));



CREATE POLICY "profiles: self read" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "profiles: self update" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "profiles: self upsert" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "stock: insert se accesso alla terapia" ON "public"."stock_movements" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."therapies" "t"
     JOIN "public"."patients" "p" ON (("p"."id" = "t"."patient_id")))
  WHERE (("t"."id" = "stock_movements"."therapy_id") AND (("p"."user_id" = "auth"."uid"()) OR ("p"."owner_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."caregiver_patients" "cp"
          WHERE (("cp"."patient_id" = "p"."id") AND ("cp"."caregiver_id" = "auth"."uid"())))))))));



CREATE POLICY "stock: read se accesso alla terapia" ON "public"."stock_movements" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."therapies" "t"
     JOIN "public"."patients" "p" ON (("p"."id" = "t"."patient_id")))
  WHERE (("t"."id" = "stock_movements"."therapy_id") AND (("p"."user_id" = "auth"."uid"()) OR ("p"."owner_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."caregiver_patients" "cp"
          WHERE (("cp"."patient_id" = "p"."id") AND ("cp"."caregiver_id" = "auth"."uid"())))))))));



ALTER TABLE "public"."stock_movements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."therapies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "therapies: rw se paziente o caregiver linked" ON "public"."therapies" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."patients" "p"
  WHERE (("p"."id" = "therapies"."patient_id") AND (("p"."user_id" = "auth"."uid"()) OR ("p"."owner_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."caregiver_patients" "cp"
          WHERE (("cp"."patient_id" = "p"."id") AND ("cp"."caregiver_id" = "auth"."uid"()))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."patients" "p"
  WHERE (("p"."id" = "therapies"."patient_id") AND (("p"."user_id" = "auth"."uid"()) OR ("p"."owner_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."caregiver_patients" "cp"
          WHERE (("cp"."patient_id" = "p"."id") AND ("cp"."caregiver_id" = "auth"."uid"())))))))));



ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_roles: self insert" ON "public"."user_roles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user_roles: self read" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_roles: self update" ON "public"."user_roles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."events";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notifications";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."patients";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."therapies";






REVOKE USAGE ON SCHEMA "public" FROM PUBLIC;
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";














































































































































































GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."family_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."family_invites" TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_family_invite"("_patient_id" "text", "_ttl_minutes" integer, "_max_uses" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_family_invite"("_patient_id" "text", "_ttl_minutes" integer, "_max_uses" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."handle_dose_status_change"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."handle_dose_taken"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."is_caregiver_of"("_patient_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_caregiver_of"("_patient_id" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owns_patient"("_patient_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owns_patient"("_patient_id" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."redeem_family_invite"("_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."redeem_family_invite"("_code" "text") TO "authenticated";
























GRANT SELECT,DELETE,UPDATE ON TABLE "public"."caregiver_patients" TO "authenticated";
GRANT ALL ON TABLE "public"."caregiver_patients" TO "service_role";



GRANT SELECT,INSERT,UPDATE ON TABLE "public"."caregivers" TO "authenticated";
GRANT ALL ON TABLE "public"."caregivers" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT SELECT,INSERT,UPDATE ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."patients" TO "authenticated";
GRANT ALL ON TABLE "public"."patients" TO "service_role";



GRANT SELECT,INSERT,UPDATE ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT SELECT,INSERT ON TABLE "public"."stock_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_movements" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."therapies" TO "authenticated";
GRANT ALL ON TABLE "public"."therapies" TO "service_role";



GRANT SELECT,INSERT,UPDATE ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";


































drop extension if exists "pg_net";

create extension if not exists "pg_net" with schema "public";

revoke references on table "public"."caregiver_patients" from "anon";

revoke trigger on table "public"."caregiver_patients" from "anon";

revoke truncate on table "public"."caregiver_patients" from "anon";

revoke references on table "public"."caregiver_patients" from "authenticated";

revoke trigger on table "public"."caregiver_patients" from "authenticated";

revoke truncate on table "public"."caregiver_patients" from "authenticated";

revoke references on table "public"."caregivers" from "anon";

revoke trigger on table "public"."caregivers" from "anon";

revoke truncate on table "public"."caregivers" from "anon";

revoke references on table "public"."caregivers" from "authenticated";

revoke trigger on table "public"."caregivers" from "authenticated";

revoke truncate on table "public"."caregivers" from "authenticated";

revoke references on table "public"."events" from "anon";

revoke trigger on table "public"."events" from "anon";

revoke truncate on table "public"."events" from "anon";

revoke references on table "public"."events" from "authenticated";

revoke trigger on table "public"."events" from "authenticated";

revoke truncate on table "public"."events" from "authenticated";

revoke references on table "public"."family_invites" from "anon";

revoke trigger on table "public"."family_invites" from "anon";

revoke truncate on table "public"."family_invites" from "anon";

revoke references on table "public"."family_invites" from "authenticated";

revoke trigger on table "public"."family_invites" from "authenticated";

revoke truncate on table "public"."family_invites" from "authenticated";

revoke references on table "public"."notifications" from "anon";

revoke trigger on table "public"."notifications" from "anon";

revoke truncate on table "public"."notifications" from "anon";

revoke references on table "public"."notifications" from "authenticated";

revoke trigger on table "public"."notifications" from "authenticated";

revoke truncate on table "public"."notifications" from "authenticated";

revoke references on table "public"."patients" from "anon";

revoke trigger on table "public"."patients" from "anon";

revoke truncate on table "public"."patients" from "anon";

revoke references on table "public"."patients" from "authenticated";

revoke trigger on table "public"."patients" from "authenticated";

revoke truncate on table "public"."patients" from "authenticated";

revoke references on table "public"."profiles" from "anon";

revoke trigger on table "public"."profiles" from "anon";

revoke truncate on table "public"."profiles" from "anon";

revoke references on table "public"."profiles" from "authenticated";

revoke trigger on table "public"."profiles" from "authenticated";

revoke truncate on table "public"."profiles" from "authenticated";

revoke references on table "public"."stock_movements" from "anon";

revoke trigger on table "public"."stock_movements" from "anon";

revoke truncate on table "public"."stock_movements" from "anon";

revoke references on table "public"."stock_movements" from "authenticated";

revoke trigger on table "public"."stock_movements" from "authenticated";

revoke truncate on table "public"."stock_movements" from "authenticated";

revoke references on table "public"."therapies" from "anon";

revoke trigger on table "public"."therapies" from "anon";

revoke truncate on table "public"."therapies" from "anon";

revoke references on table "public"."therapies" from "authenticated";

revoke trigger on table "public"."therapies" from "authenticated";

revoke truncate on table "public"."therapies" from "authenticated";

revoke references on table "public"."user_roles" from "anon";

revoke trigger on table "public"."user_roles" from "anon";

revoke truncate on table "public"."user_roles" from "anon";

revoke references on table "public"."user_roles" from "authenticated";

revoke trigger on table "public"."user_roles" from "authenticated";

revoke truncate on table "public"."user_roles" from "authenticated";

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


