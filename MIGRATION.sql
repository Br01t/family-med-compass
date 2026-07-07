-- FamilyMed — migrazione da lanciare nel tuo progetto Supabase esterno.
-- Idempotente: puoi rilanciarla senza rompere nulla di esistente.
-- Copia il contenuto in Supabase Studio → SQL Editor → Run.

-- =========================================================
-- ENUM ruolo
-- =========================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('paziente', 'caregiver', 'admin', 'medico');
  end if;
end$$;

-- =========================================================
-- profiles
-- =========================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  role public.app_role not null default 'caregiver',
  created_at timestamptz not null default now()
);

grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;

alter table public.profiles enable row level security;

drop policy if exists "profiles: self read" on public.profiles;
create policy "profiles: self read"
  on public.profiles for select to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles: self insert" on public.profiles;
create policy "profiles: self insert"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);

drop policy if exists "profiles: self update" on public.profiles;
create policy "profiles: self update"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role public.app_role;
  v_name text;
begin
  v_name := coalesce(new.raw_user_meta_data->>'name', new.email);
  v_role := coalesce((new.raw_user_meta_data->>'role')::public.app_role, 'caregiver');

  insert into public.profiles (id, email, name, role)
  values (new.id, new.email, v_name, v_role)
  on conflict (id) do nothing;

  -- Se il ruolo è paziente, crea automaticamente il record nella tabella patients
  if v_role = 'paziente' then
    insert into public.patients (id, name, user_id)
    values ('p_' || new.id::text, v_name, new.id)
    on conflict (id) do nothing;
  end if;

  -- Se il ruolo è caregiver, crea automaticamente il record nella tabella caregivers
  if v_role = 'caregiver' then
    insert into public.caregivers (id, name)
    values (new.id, v_name)
    on conflict (id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================
-- patients
-- =========================================================
create table if not exists public.patients (
  id text primary key,
  name text not null,
  photo text,
  birth_year integer,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.patients to authenticated;
grant all on public.patients to service_role;

alter table public.patients enable row level security;

drop policy if exists "patients: open read authenticated" on public.patients;
create policy "patients: open read authenticated"
  on public.patients for select to authenticated using (true);

drop policy if exists "patients: insert authenticated" on public.patients;
create policy "patients: insert authenticated"
  on public.patients for insert to authenticated with check (true);

drop policy if exists "patients: owner or caregiver update" on public.patients;
create policy "patients: owner or caregiver update"
  on public.patients for update to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.caregiver_patients cp
               where cp.patient_id = patients.id and cp.caregiver_id = auth.uid())
  );

drop policy if exists "patients: owner or caregiver delete" on public.patients;
create policy "patients: owner or caregiver delete"
  on public.patients for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.caregiver_patients cp
               where cp.patient_id = patients.id and cp.caregiver_id = auth.uid())
  );

-- =========================================================
-- caregiver_patients
-- =========================================================
create table if not exists public.caregiver_patients (
  caregiver_id uuid not null references auth.users(id) on delete cascade,
  patient_id text not null references public.patients(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (caregiver_id, patient_id)
);

grant select, insert, delete on public.caregiver_patients to authenticated;
grant all on public.caregiver_patients to service_role;

alter table public.caregiver_patients enable row level security;

drop policy if exists "cp: read own or of self patient" on public.caregiver_patients;
create policy "cp: read own or of self patient"
  on public.caregiver_patients for select to authenticated
  using (
    caregiver_id = auth.uid()
    or exists (select 1 from public.patients p where p.id = patient_id and p.user_id = auth.uid())
  );

drop policy if exists "cp: caregiver can follow" on public.caregiver_patients;
create policy "cp: caregiver can follow"
  on public.caregiver_patients for insert to authenticated
  with check (caregiver_id = auth.uid());

drop policy if exists "cp: caregiver can unfollow" on public.caregiver_patients;
create policy "cp: caregiver can unfollow"
  on public.caregiver_patients for delete to authenticated
  using (caregiver_id = auth.uid());

-- =========================================================
-- therapies
-- =========================================================
create table if not exists public.therapies (
  id text primary key,
  patient_id text not null references public.patients(id) on delete cascade,
  name text not null,
  dosage text,
  quantity integer,
  category text,
  color text,
  icon text,
  notes text,
  start_date date,
  end_date date,
  times text[] default '{}',
  recurrence jsonb,
  timeout_minutes integer,
  reminder_intervals integer[] default '{}',
  packs integer default 0,
  pills_per_pack integer default 0,
  pills_remaining integer default 0,
  low_stock_threshold integer default 0,
  active boolean default true,
  suspended boolean default false,
  photo_drug text,
  photo_package text,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.therapies to authenticated;
grant all on public.therapies to service_role;
alter table public.therapies enable row level security;

drop policy if exists "therapies: rw if linked" on public.therapies;
create policy "therapies: rw if linked"
  on public.therapies for all to authenticated
  using (
    exists (select 1 from public.patients p where p.id = patient_id and (
      p.user_id = auth.uid()
      or exists (select 1 from public.caregiver_patients cp
                 where cp.patient_id = p.id and cp.caregiver_id = auth.uid())
    ))
  ) with check (
    exists (select 1 from public.patients p where p.id = patient_id and (
      p.user_id = auth.uid()
      or exists (select 1 from public.caregiver_patients cp
                 where cp.patient_id = p.id and cp.caregiver_id = auth.uid())
    ))
  );

-- =========================================================
-- events
-- =========================================================
create table if not exists public.events (
  id text primary key,
  therapy_id text references public.therapies(id) on delete cascade,
  patient_id text references public.patients(id) on delete cascade,
  scheduled_at timestamptz,
  status text,
  confirmed_at timestamptz,
  confirmed_by text,
  note text,
  timeline jsonb default '[]'::jsonb
);
grant select, insert, update, delete on public.events to authenticated;
grant all on public.events to service_role;
alter table public.events enable row level security;
drop policy if exists "events: rw if linked" on public.events;
create policy "events: rw if linked"
  on public.events for all to authenticated
  using (
    exists (select 1 from public.patients p where p.id = patient_id and (
      p.user_id = auth.uid()
      or exists (select 1 from public.caregiver_patients cp
                 where cp.patient_id = p.id and cp.caregiver_id = auth.uid())
    ))
  ) with check (
    exists (select 1 from public.patients p where p.id = patient_id and (
      p.user_id = auth.uid()
      or exists (select 1 from public.caregiver_patients cp
                 where cp.patient_id = p.id and cp.caregiver_id = auth.uid())
    ))
  );

-- =========================================================
-- notifications
-- =========================================================
create table if not exists public.notifications (
  id text primary key,
  patient_id text references public.patients(id) on delete cascade,
  severity text,
  title text,
  message text,
  read boolean default false,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;
drop policy if exists "notifications: rw authenticated" on public.notifications;
create policy "notifications: rw authenticated"
  on public.notifications for all to authenticated using (true) with check (true);

create table if not exists public.notification_recipients (
  notification_id text references public.notifications(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  primary key (notification_id, user_id)
);
grant select, insert, delete on public.notification_recipients to authenticated;
grant all on public.notification_recipients to service_role;
alter table public.notification_recipients enable row level security;
drop policy if exists "nr: self" on public.notification_recipients;
create policy "nr: self"
  on public.notification_recipients for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =========================================================
-- caregivers (opzionale, legacy)
-- =========================================================
create table if not exists public.caregivers (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  relation text,
  photo text,
  notify jsonb
);
grant select, insert, update on public.caregivers to authenticated;
grant all on public.caregivers to service_role;
alter table public.caregivers enable row level security;
drop policy if exists "caregivers: read all" on public.caregivers;
create policy "caregivers: read all"
  on public.caregivers for select to authenticated using (true);
drop policy if exists "caregivers: self write" on public.caregivers;
create policy "caregivers: self write"
  on public.caregivers for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
