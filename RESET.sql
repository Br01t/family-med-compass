-- ============================================================
-- FamilyMed v2 — RESET completo del database Supabase.
-- ⚠️  ATTENZIONE: droppa TUTTE le tabelle dello schema public.
-- Esegui una volta sola in Supabase Studio → SQL Editor → Run.
-- ============================================================

-- 0. Drop schema public (contiene solo le tabelle applicative)
drop schema if exists public cascade;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;

-- Estensioni necessarie
create extension if not exists "pgcrypto";
create extension if not exists "pg_cron";

-- ============================================================
-- 1. ENUM ruoli
-- ============================================================
create type public.app_role as enum ('caregiver', 'paziente');

-- ============================================================
-- 2. PROFILES (cache denormalizzata del ruolo per UI)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  role app_role not null default 'caregiver',
  avatar_url text,
  created_at timestamptz not null default now()
);

grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;

alter table public.profiles enable row level security;

create policy "profiles: self read"
  on public.profiles for select to authenticated
  using (auth.uid() = id);

create policy "profiles: self upsert"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);

create policy "profiles: self update"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- NB: la policy "caregiver può leggere profili dei pazienti che segue"
-- è definita più sotto, dopo la creazione di caregiver_patients.


-- ============================================================
-- 3. USER_ROLES (sicurezza: NON su profiles per evitare escalation)
-- ============================================================
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.user_roles enable row level security;

create policy "user_roles: self read"
  on public.user_roles for select to authenticated
  using (auth.uid() = user_id);

-- Security-definer function per policy senza ricorsione
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

-- ============================================================
-- 4. PATIENTS  (id text: compatibile con il client "p_<uuid>")
-- ============================================================
create table public.patients (
  id text primary key,
  name text not null,
  photo text,
  birth_year integer,
  user_id uuid references auth.users(id) on delete set null,  -- null = paziente gestito senza account
  owner_user_id uuid references auth.users(id) on delete set null, -- caregiver creatore
  created_at timestamptz not null default now()
);
create index patients_user_id_idx on public.patients(user_id);
create index patients_owner_idx on public.patients(owner_user_id);

grant select, insert, update, delete on public.patients to authenticated;
grant all on public.patients to service_role;

alter table public.patients enable row level security;

-- Lista aperta (lettura) — SOLO utenti autenticati
create policy "patients: authenticated can read all"
  on public.patients for select to authenticated using (true);

-- Insert: paziente inserisce se stesso, caregiver inserisce paziente-gestito
create policy "patients: insert self or as caregiver"
  on public.patients for insert to authenticated
  with check (
    user_id = auth.uid()
    or (public.has_role(auth.uid(), 'caregiver') and (owner_user_id is null or owner_user_id = auth.uid()))
  );

create policy "patients: owner or linked caregiver update"
  on public.patients for update to authenticated
  using (
    user_id = auth.uid()
    or owner_user_id = auth.uid()
    or exists (select 1 from public.caregiver_patients cp
               where cp.patient_id = patients.id and cp.caregiver_id = auth.uid())
  );

create policy "patients: owner or linked caregiver delete"
  on public.patients for delete to authenticated
  using (
    user_id = auth.uid()
    or owner_user_id = auth.uid()
    or exists (select 1 from public.caregiver_patients cp
               where cp.patient_id = patients.id and cp.caregiver_id = auth.uid())
  );

-- ============================================================
-- 5. CAREGIVERS (metadati opzionali, popolati dal trigger)
-- ============================================================
create table public.caregivers (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  relation text,
  photo text,
  notify jsonb default '{"push":true,"email":false,"whatsapp":false}'::jsonb,
  created_at timestamptz not null default now()
);

grant select, insert, update on public.caregivers to authenticated;
grant all on public.caregivers to service_role;

alter table public.caregivers enable row level security;

create policy "caregivers: self read"
  on public.caregivers for select to authenticated using (id = auth.uid());

create policy "caregivers: self upsert"
  on public.caregivers for insert to authenticated with check (id = auth.uid());

create policy "caregivers: self update"
  on public.caregivers for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- NB: la policy "paziente può leggere caregivers collegati" è definita
-- più sotto, dopo la creazione di caregiver_patients.


-- ============================================================
-- 6. CAREGIVER_PATIENTS (link)
-- ============================================================
create table public.caregiver_patients (
  caregiver_id uuid not null references auth.users(id) on delete cascade,
  patient_id text not null references public.patients(id) on delete cascade,
  relationship text,
  created_at timestamptz not null default now(),
  primary key (caregiver_id, patient_id)
);
create index cp_patient_idx on public.caregiver_patients(patient_id);

grant select, insert, delete on public.caregiver_patients to authenticated;
grant all on public.caregiver_patients to service_role;

alter table public.caregiver_patients enable row level security;

create policy "cp: read own"
  on public.caregiver_patients for select to authenticated
  using (
    caregiver_id = auth.uid()
    or exists (select 1 from public.patients p
               where p.id = patient_id and p.user_id = auth.uid())
  );

create policy "cp: caregiver can follow"
  on public.caregiver_patients for insert to authenticated
  with check (caregiver_id = auth.uid() and public.has_role(auth.uid(), 'caregiver'));

create policy "cp: caregiver can unfollow"
  on public.caregiver_patients for delete to authenticated
  using (caregiver_id = auth.uid());

-- ============================================================
-- 7. THERAPIES
-- ============================================================
create table public.therapies (
  id text primary key,
  patient_id text not null references public.patients(id) on delete cascade,
  name text not null,
  dosage text,
  quantity integer default 1,          -- unità per assunzione
  category text,
  color text,
  icon text,
  notes text,
  start_date date not null default current_date,
  end_date date,
  times text[] default '{}'::text[],   -- ["08:00","20:00"]
  recurrence jsonb not null default '{"kind":"daily"}'::jsonb,
  timeout_minutes integer default 10,  -- minuti oltre l'orario per marcare "missed"
  snooze_minutes integer default 10,
  reminder_intervals integer[] default '{-10}'::integer[], -- minuti prima; -10 = reminder 10min prima
  packs integer default 0,
  pills_per_pack integer default 0,
  pills_remaining integer default 0,
  low_stock_threshold integer default 10,
  active boolean default true,
  suspended boolean default false,
  photo_drug text,
  photo_package text,
  created_at timestamptz not null default now()
);
create index therapies_patient_idx on public.therapies(patient_id);

grant select, insert, update, delete on public.therapies to authenticated;
grant all on public.therapies to service_role;

alter table public.therapies enable row level security;

create policy "therapies: rw se paziente o caregiver linked"
  on public.therapies for all to authenticated
  using (
    exists (
      select 1 from public.patients p
      where p.id = patient_id and (
        p.user_id = auth.uid()
        or p.owner_user_id = auth.uid()
        or exists (select 1 from public.caregiver_patients cp
                   where cp.patient_id = p.id and cp.caregiver_id = auth.uid())
      )
    )
  )
  with check (
    exists (
      select 1 from public.patients p
      where p.id = patient_id and (
        p.user_id = auth.uid()
        or p.owner_user_id = auth.uid()
        or exists (select 1 from public.caregiver_patients cp
                   where cp.patient_id = p.id and cp.caregiver_id = auth.uid())
      )
    )
  );

-- ============================================================
-- 8. EVENTS  (istanza reale di una dose, scritta dal client)
--    status: 'scheduled' | 'taken' | 'skipped' | 'snoozed' | 'missed'
-- ============================================================
create table public.events (
  id text primary key,
  therapy_id text not null references public.therapies(id) on delete cascade,
  patient_id text not null references public.patients(id) on delete cascade,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled',
  confirmed_at timestamptz,
  confirmed_by text,
  snooze_count integer default 0,
  snoozed_until timestamptz,
  note text,
  timeline jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (therapy_id, scheduled_at)
);
create index events_patient_idx on public.events(patient_id);
create index events_scheduled_idx on public.events(scheduled_at);
create index events_status_idx on public.events(status);

grant select, insert, update, delete on public.events to authenticated;
grant all on public.events to service_role;

alter table public.events enable row level security;

create policy "events: rw se paziente o caregiver linked"
  on public.events for all to authenticated
  using (
    exists (
      select 1 from public.patients p
      where p.id = patient_id and (
        p.user_id = auth.uid()
        or p.owner_user_id = auth.uid()
        or exists (select 1 from public.caregiver_patients cp
                   where cp.patient_id = p.id and cp.caregiver_id = auth.uid())
      )
    )
  );

-- ============================================================
-- 9. STOCK_MOVEMENTS  (audit scorte)
-- ============================================================
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  therapy_id text not null references public.therapies(id) on delete cascade,
  delta integer not null,           -- negativo = consumo, positivo = ricarica
  reason text not null,             -- 'intake' | 'refill' | 'adjust'
  event_id text references public.events(id) on delete set null,
  created_at timestamptz not null default now()
);
create index stock_therapy_idx on public.stock_movements(therapy_id);

grant select, insert on public.stock_movements to authenticated;
grant all on public.stock_movements to service_role;

alter table public.stock_movements enable row level security;

create policy "stock: read se accesso alla terapia"
  on public.stock_movements for select to authenticated
  using (
    exists (
      select 1 from public.therapies t
      join public.patients p on p.id = t.patient_id
      where t.id = therapy_id and (
        p.user_id = auth.uid()
        or p.owner_user_id = auth.uid()
        or exists (select 1 from public.caregiver_patients cp
                   where cp.patient_id = p.id and cp.caregiver_id = auth.uid())
      )
    )
  );

create policy "stock: insert se accesso alla terapia"
  on public.stock_movements for insert to authenticated
  with check (
    exists (
      select 1 from public.therapies t
      join public.patients p on p.id = t.patient_id
      where t.id = therapy_id and (
        p.user_id = auth.uid()
        or p.owner_user_id = auth.uid()
        or exists (select 1 from public.caregiver_patients cp
                   where cp.patient_id = p.id and cp.caregiver_id = auth.uid())
      )
    )
  );

-- ============================================================
-- 10. NOTIFICATIONS  (unificate, un record per destinatario)
--     kind: 'reminder' | 'due' | 'missed' | 'taken' | 'low_stock' | 'info'
-- ============================================================
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'info',
  severity text not null default 'info',   -- 'info' | 'warning' | 'alert'
  title text not null,
  message text,
  patient_id text references public.patients(id) on delete set null,
  therapy_id text references public.therapies(id) on delete set null,
  event_id text references public.events(id) on delete set null,
  dose_key text,                            -- guardia idempotente: "<therapy_id>@<iso>@<kind>"
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index notifications_dose_key_idx
  on public.notifications(target_user_id, dose_key) where dose_key is not null;
create index notifications_target_idx on public.notifications(target_user_id, read);

grant select, update on public.notifications to authenticated;
grant all on public.notifications to service_role;

alter table public.notifications enable row level security;

create policy "notifications: read own"
  on public.notifications for select to authenticated
  using (target_user_id = auth.uid());

create policy "notifications: mark own read"
  on public.notifications for update to authenticated
  using (target_user_id = auth.uid()) with check (target_user_id = auth.uid());

-- Abilita Realtime per notifications ed events
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.therapies;
alter publication supabase_realtime add table public.patients;

-- ============================================================
-- 11. TRIGGER: onboarding utente
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 12. TRIGGER: dose confermata → scorte + notifica caregiver
-- ============================================================
create or replace function public.handle_dose_taken()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

drop trigger if exists on_event_taken on public.events;
create trigger on_event_taken
  after insert or update of status on public.events
  for each row execute function public.handle_dose_taken();

-- ============================================================
-- FINE. Ora deploya la edge function dose-scheduler (vedi DEPLOY.md)
-- e attiva pg_cron con la riga in DEPLOY.md.
-- ============================================================
