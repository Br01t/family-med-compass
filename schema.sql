


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


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "postgres";


CREATE TYPE "public"."app_role" AS ENUM (
    'caregiver',
    'paziente'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_dose_taken"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_therapy public.therapies%rowtype;
  v_patient public.patients%rowtype;
  v_caregiver uuid;
begin
  if new.status <> 'taken' or coalesce(old.status, '') = 'taken' then
    return new;
  end if;

  select * into v_therapy from public.therapies where id = new.therapy_id;
  if not found then return new; end if;
  select * into v_patient from public.patients where id = new.patient_id;

  -- Decremento scorte
  update public.therapies
    set pills_remaining = greatest(0, pills_remaining - coalesce(v_therapy.quantity, 1))
    where id = new.therapy_id;

  insert into public.stock_movements (therapy_id, delta, reason, event_id)
  values (new.therapy_id, -coalesce(v_therapy.quantity, 1), 'intake', new.id);

  -- Notifica caregiver "taken" (silenziosa)
  for v_caregiver in
    select caregiver_id from public.caregiver_patients where patient_id = new.patient_id
  loop
    insert into public.notifications (target_user_id, kind, severity, title, message, patient_id, therapy_id, event_id, dose_key)
    values (v_caregiver, 'taken', 'info',
            v_patient.name || ' ha preso ' || v_therapy.name,
            'Confermata alle ' || to_char(new.confirmed_at at time zone 'Europe/Rome', 'HH24:MI'),
            new.patient_id, new.therapy_id, new.id,
            new.therapy_id || '@' || new.scheduled_at::text || '@taken')
    on conflict do nothing;
  end loop;

  -- Notifica scorte basse
  if (select pills_remaining from public.therapies where id = new.therapy_id) <= v_therapy.low_stock_threshold then
    for v_caregiver in
      select caregiver_id from public.caregiver_patients where patient_id = new.patient_id
    loop
      insert into public.notifications (target_user_id, kind, severity, title, message, patient_id, therapy_id, dose_key)
      values (v_caregiver, 'low_stock', 'warning',
              'Scorta bassa: ' || v_therapy.name,
              'Rimangono poche compresse per ' || v_patient.name || '.',
              new.patient_id, new.therapy_id,
              new.therapy_id || '@lowstock@' || to_char(now(), 'YYYY-MM-DD'))
      on conflict do nothing;
    end loop;
  end if;

  return new;
end;
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

SET default_tablespace = '';

SET default_table_access_method = "heap";


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
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
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


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


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



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_endpoint_key" UNIQUE ("endpoint");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



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



CREATE UNIQUE INDEX "notifications_dose_key_idx" ON "public"."notifications" USING "btree" ("target_user_id", "dose_key") WHERE ("dose_key" IS NOT NULL);



CREATE INDEX "notifications_target_idx" ON "public"."notifications" USING "btree" ("target_user_id", "read");



CREATE INDEX "patients_owner_idx" ON "public"."patients" USING "btree" ("owner_user_id");



CREATE INDEX "patients_user_id_idx" ON "public"."patients" USING "btree" ("user_id");



CREATE INDEX "push_subscriptions_user_idx" ON "public"."push_subscriptions" USING "btree" ("user_id");



CREATE INDEX "stock_therapy_idx" ON "public"."stock_movements" USING "btree" ("therapy_id");



CREATE INDEX "therapies_patient_idx" ON "public"."therapies" USING "btree" ("patient_id");



CREATE OR REPLACE TRIGGER "on_event_taken" AFTER INSERT OR UPDATE OF "status" ON "public"."events" FOR EACH ROW EXECUTE FUNCTION "public"."handle_dose_taken"();



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



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



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


CREATE POLICY "caregivers: patient can read linked" ON "public"."caregivers" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."caregiver_patients" "cp"
     JOIN "public"."patients" "p" ON (("p"."id" = "cp"."patient_id")))
  WHERE (("cp"."caregiver_id" = "caregivers"."id") AND ("p"."user_id" = "auth"."uid"())))));



CREATE POLICY "caregivers: self read" ON "public"."caregivers" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "caregivers: self update" ON "public"."caregivers" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "caregivers: self upsert" ON "public"."caregivers" FOR INSERT TO "authenticated" WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "cp: caregiver can follow" ON "public"."caregiver_patients" FOR INSERT TO "authenticated" WITH CHECK ((("caregiver_id" = "auth"."uid"()) AND "public"."has_role"("auth"."uid"(), 'caregiver'::"public"."app_role")));



CREATE POLICY "cp: caregiver can unfollow" ON "public"."caregiver_patients" FOR DELETE TO "authenticated" USING (("caregiver_id" = "auth"."uid"()));



CREATE POLICY "cp: caregiver can update own" ON "public"."caregiver_patients" FOR UPDATE TO "authenticated" USING (("caregiver_id" = "auth"."uid"())) WITH CHECK (("caregiver_id" = "auth"."uid"()));



CREATE POLICY "cp: read own" ON "public"."caregiver_patients" FOR SELECT TO "authenticated" USING ((("caregiver_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."patients" "p"
  WHERE (("p"."id" = "caregiver_patients"."patient_id") AND ("p"."user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "events: rw se paziente o caregiver linked" ON "public"."events" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."patients" "p"
  WHERE (("p"."id" = "events"."patient_id") AND (("p"."user_id" = "auth"."uid"()) OR ("p"."owner_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."caregiver_patients" "cp"
          WHERE (("cp"."patient_id" = "p"."id") AND ("cp"."caregiver_id" = "auth"."uid"())))))))));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications: insert if linked to patient" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK ((("patient_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."patients" "p"
  WHERE (("p"."id" = "notifications"."patient_id") AND (("p"."user_id" = "auth"."uid"()) OR ("p"."owner_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."caregiver_patients" "cp"
          WHERE (("cp"."patient_id" = "p"."id") AND ("cp"."caregiver_id" = "auth"."uid"()))))))))));



CREATE POLICY "notifications: mark own read" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("target_user_id" = "auth"."uid"())) WITH CHECK (("target_user_id" = "auth"."uid"()));



CREATE POLICY "notifications: read own or caregiver of patient" ON "public"."notifications" FOR SELECT TO "authenticated" USING ((("target_user_id" = "auth"."uid"()) OR (("patient_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."patients" "p"
  WHERE (("p"."id" = "notifications"."patient_id") AND (("p"."owner_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."caregiver_patients" "cp"
          WHERE (("cp"."patient_id" = "p"."id") AND ("cp"."caregiver_id" = "auth"."uid"())))))))))));



ALTER TABLE "public"."patients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "patients: authenticated can read all" ON "public"."patients" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "patients: insert self or as caregiver" ON "public"."patients" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) OR ("public"."has_role"("auth"."uid"(), 'caregiver'::"public"."app_role") AND (("owner_user_id" IS NULL) OR ("owner_user_id" = "auth"."uid"())))));



CREATE POLICY "patients: owner or linked caregiver delete" ON "public"."patients" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("owner_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."caregiver_patients" "cp"
  WHERE (("cp"."patient_id" = "patients"."id") AND ("cp"."caregiver_id" = "auth"."uid"()))))));



CREATE POLICY "patients: owner or linked caregiver update" ON "public"."patients" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("owner_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."caregiver_patients" "cp"
  WHERE (("cp"."patient_id" = "patients"."id") AND ("cp"."caregiver_id" = "auth"."uid"()))))));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles: caregiver can read followed patients" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."caregiver_patients" "cp"
     JOIN "public"."patients" "p" ON (("p"."id" = "cp"."patient_id")))
  WHERE (("cp"."caregiver_id" = "auth"."uid"()) AND ("p"."user_id" = "profiles"."id")))));



CREATE POLICY "profiles: self read" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "profiles: self update" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "profiles: self upsert" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "push_sub: own delete" ON "public"."push_subscriptions" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "push_sub: own insert" ON "public"."push_subscriptions" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "push_sub: own read" ON "public"."push_subscriptions" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "push_sub: own update" ON "public"."push_subscriptions" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


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



REVOKE USAGE ON SCHEMA "public" FROM PUBLIC;
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_dose_taken"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."caregiver_patients" TO "authenticated";
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



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT SELECT,INSERT ON TABLE "public"."stock_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_movements" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."therapies" TO "authenticated";
GRANT ALL ON TABLE "public"."therapies" TO "service_role";



GRANT SELECT,INSERT ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";




