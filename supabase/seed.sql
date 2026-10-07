-- =====================================================================
-- DATI DI ESEMPIO — SOLO SVILUPPO LOCALE
-- Eseguito automaticamente da `npx supabase db reset` (e da `supabase start`
-- su un database nuovo). NON viene eseguito da `supabase db push`:
-- non finisce quindi sul progetto online. Non lanciarlo mai a mano online.
--
-- Tutti i dati sono inventati. Password di tutti gli utenti: Password123!
--
--   anna.demo@example.com   caregiver, piano PRO, proprietaria di 2 pazienti
--   luigi.demo@example.com  caregiver secondario collegato a "Giuseppe Demo"
--   free.demo@example.com   caregiver, piano FREE, 1 paziente con 3 terapie (al limite)
-- =====================================================================

-- ---------- 1. Utenti, profili e ruoli ----------
DO $$
DECLARE
  u record;
BEGIN
  FOR u IN
    SELECT * FROM (VALUES
      ('a0000000-0000-4000-8000-000000000001'::uuid, 'anna.demo@example.com',  'Anna Demo'),
      ('a0000000-0000-4000-8000-000000000002'::uuid, 'luigi.demo@example.com', 'Luigi Demo'),
      ('a0000000-0000-4000-8000-000000000003'::uuid, 'free.demo@example.com',  'Utente Free Demo')
    ) AS t(id, email, name)
  LOOP
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
      extensions.crypt('Password123!', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', u.name, 'role', 'caregiver'),
      now(), now(), '', '', '', '', '', '', '', ''
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO auth.identities (
      id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), u.id, u.id::text, 'email',
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
      now(), now(), now()
    ) ON CONFLICT DO NOTHING;

    -- Profilo, ruolo e scheda caregiver creati esplicitamente: nelle migrazioni non c'è
    -- un trigger su auth.users che richiami handle_new_user() (lo stesso fanno i test).
    -- Se il trigger esistesse, ON CONFLICT evita duplicati.
    INSERT INTO public.profiles (id, email, name, role)
    VALUES (u.id, u.email, u.name, 'caregiver')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (u.id, 'caregiver')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.caregivers (id, name)
    VALUES (u.id, u.name)
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END $$;

-- ---------- 2. Piano: Anna è Pro (prima dei pazienti, per rispettare i limiti) ----------
UPDATE public.profiles
   SET subscription_plan_own = 'pro'
 WHERE id = 'a0000000-0000-4000-8000-000000000001';

-- ---------- 3. Pazienti e gruppo di cura ----------
INSERT INTO public.patients (id, name, birth_year, owner_user_id, primary_caregiver_id) VALUES
  ('p_demo_giuseppe', 'Giuseppe Demo',      1944, 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001'),
  ('p_demo_rosa',     'Rosa Demo',          1948, 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001'),
  ('p_demo_free',     'Paziente Free Demo', 1950, 'a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.caregiver_patients (caregiver_id, patient_id, relationship) VALUES
  ('a0000000-0000-4000-8000-000000000002', 'p_demo_giuseppe', 'Figlio')
ON CONFLICT DO NOTHING;

-- ---------- 4. Terapie ----------
INSERT INTO public.therapies
  (id, patient_id, name, dosage, quantity, category, color, icon, times, recurrence,
   packs, pills_per_pack, pills_remaining, low_stock_threshold)
VALUES
  -- Giuseppe (Pro: terapie illimitate)
  ('t_demo_metformina',   'p_demo_giuseppe', 'Metformina',   '850 mg',   1, 'Diabete',      'primary', 'pill', ARRAY['08:00','20:00'], '{"kind":"daily"}',    2, 30, 42, 10),
  ('t_demo_ramipril',     'p_demo_giuseppe', 'Ramipril',     '5 mg',     1, 'Cardiologia',  'primary', 'pill', ARRAY['08:00'],         '{"kind":"daily"}',    1, 28, 9,  10),
  ('t_demo_atorvastatina','p_demo_giuseppe', 'Atorvastatina','20 mg',    1, 'Cardiologia',  'primary', 'pill', ARRAY['21:00'],         '{"kind":"daily"}',    1, 30, 25, 10),
  ('t_demo_vitamina_d',   'p_demo_giuseppe', 'Vitamina D',   '1000 UI',  1, 'Integratori',  'primary', 'pill', ARRAY['09:00'],         '{"kind":"weekdays"}', 1, 60, 50, 10),
  -- Rosa
  ('t_demo_levotiroxina', 'p_demo_rosa',     'Levotiroxina', '75 mcg',   1, 'Tiroide',      'primary', 'pill', ARRAY['07:00'],         '{"kind":"daily"}',    1, 50, 30, 10),
  -- Paziente Free: esattamente 3 terapie = limite del piano Free
  ('t_demo_free_1', 'p_demo_free', 'Aspirina Cardio', '100 mg', 1, 'Cardiologia', 'primary', 'pill', ARRAY['09:00'], '{"kind":"daily"}', 1, 30, 20, 10),
  ('t_demo_free_2', 'p_demo_free', 'Omeprazolo',      '20 mg',  1, 'Stomaco',     'primary', 'pill', ARRAY['07:30'], '{"kind":"daily"}', 1, 14, 10, 5),
  ('t_demo_free_3', 'p_demo_free', 'Calcio + Vit. D', '1 cp',   1, 'Integratori', 'primary', 'pill', ARRAY['13:00'], '{"kind":"daily"}', 1, 30, 25, 10)
ON CONFLICT (id) DO NOTHING;

-- ---------- 5. Storico dosi: ultimi 6 giorni (solo passato, nessun conflitto con lo scheduler) ----------
DO $$
DECLARE
  th record;
  d  int;
  t  text;
  v_at timestamptz;
  v_status text;
BEGIN
  FOR th IN
    SELECT id, patient_id, times FROM public.therapies
     WHERE patient_id IN ('p_demo_giuseppe', 'p_demo_rosa')
  LOOP
    FOR d IN 1..6 LOOP
      FOREACH t IN ARRAY th.times LOOP
        v_at := ((current_date - d) + t::time)::timestamp AT TIME ZONE 'Europe/Rome';
        -- circa 1 dose su 8 dimenticata, il resto presa
        v_status := CASE WHEN (d * 3 + length(th.id) + extract(hour FROM t::time)::int) % 8 = 0
                         THEN 'missed' ELSE 'taken' END;
        INSERT INTO public.events
          (id, therapy_id, patient_id, scheduled_at, status, stage, confirmed_at, confirmed_by)
        VALUES (
          'ev_demo_' || th.id || '_' || to_char(v_at AT TIME ZONE 'Europe/Rome', 'YYYYMMDDHH24MI'),
          th.id, th.patient_id, v_at, v_status, v_status,
          CASE WHEN v_status = 'taken' THEN v_at + interval '4 minutes' END,
          CASE WHEN v_status = 'taken' THEN 'Anna Demo' END
        ) ON CONFLICT (therapy_id, scheduled_at) DO NOTHING;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

-- ---------- 6. Profilo medico, parametri vitali e diario di Giuseppe ----------
INSERT INTO public.patient_medical_profiles (patient_id, blood_type, allergies, diagnoses, emergency_contacts, notes)
VALUES (
  'p_demo_giuseppe', 'A+', ARRAY['Penicillina'],
  'Diabete tipo 2, ipertensione',
  '[{"name":"Anna Demo","phone":"+39 000 0000001","relationship":"Figlia"}]'::jsonb,
  'Dati di esempio inventati.'
) ON CONFLICT (patient_id) DO NOTHING;

INSERT INTO public.vital_signs (patient_id, kind, value_primary, unit, measured_at, created_by)
SELECT 'p_demo_giuseppe', 'glycemia', 105 + ((d * 7) % 30), 'mg/dL',
       ((current_date - d) + time '07:30')::timestamp AT TIME ZONE 'Europe/Rome',
       'a0000000-0000-4000-8000-000000000001'
FROM generate_series(0, 6) AS d;

INSERT INTO public.vital_signs (patient_id, kind, value_primary, value_secondary, pulse, unit, measured_at, created_by)
SELECT 'p_demo_giuseppe', 'blood_pressure', 125 + ((d * 5) % 20), 78 + ((d * 3) % 10), 68 + (d % 8), 'mmHg',
       ((current_date - d) + time '08:30')::timestamp AT TIME ZONE 'Europe/Rome',
       'a0000000-0000-4000-8000-000000000001'
FROM generate_series(0, 6) AS d;

INSERT INTO public.wellness_notes (patient_id, occurred_at, mood, symptoms, severity, note, created_by) VALUES
  ('p_demo_giuseppe', now() - interval '1 day', 4, ARRAY[]::text[],            NULL,     'Giornata tranquilla, ha camminato.', 'a0000000-0000-4000-8000-000000000001'),
  ('p_demo_giuseppe', now() - interval '3 days', 3, ARRAY['nausea'],          'lieve',  'Un po'' di nausea dopo la colazione.', 'a0000000-0000-4000-8000-000000000001'),
  ('p_demo_giuseppe', now() - interval '5 days', 2, ARRAY['capogiri'],        'moderata','Capogiri al risveglio.',             'a0000000-0000-4000-8000-000000000002');