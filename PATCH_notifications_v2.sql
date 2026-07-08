-- ============================================================
-- FamilyMed — PATCH notifiche v2 (idempotente)
-- Esegui nel SQL Editor del tuo Supabase esterno.
-- ============================================================

-- 1) Colonne aggiuntive
alter table public.therapies
  add column if not exists snooze_minutes integer default 10,
  add column if not exists post_reminder_minutes integer default 5,
  add column if not exists reminder_intervals integer[] default '{10}';

alter table public.events
  add column if not exists snooze_count integer default 0,
  add column if not exists snoozed_until timestamptz,
  add column if not exists stage text default 'scheduled',
  add column if not exists final_due_at timestamptz;

alter table public.patients
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null;

alter table public.notifications
  add column if not exists target_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists kind text not null default 'info',
  add column if not exists therapy_id text references public.therapies(id) on delete set null,
  add column if not exists event_id text references public.events(id) on delete set null,
  add column if not exists dose_key text;

create unique index if not exists notifications_dose_key_idx
  on public.notifications(target_user_id, dose_key) where dose_key is not null;
create index if not exists notifications_target_idx on public.notifications(target_user_id, read);
create index if not exists events_status_idx on public.events(status);
create index if not exists events_scheduled_idx on public.events(scheduled_at);

-- 2) Push subscriptions
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;
alter table public.push_subscriptions enable row level security;

drop policy if exists "push_sub: own read" on public.push_subscriptions;
create policy "push_sub: own read" on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "push_sub: own insert" on public.push_subscriptions;
create policy "push_sub: own insert" on public.push_subscriptions for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "push_sub: own update" on public.push_subscriptions;
create policy "push_sub: own update" on public.push_subscriptions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "push_sub: own delete" on public.push_subscriptions;
create policy "push_sub: own delete" on public.push_subscriptions for delete to authenticated
  using (user_id = auth.uid());

-- 3) Grant + RLS notifications
grant select, insert, update on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;

drop policy if exists "notifications: rw authenticated" on public.notifications;
drop policy if exists "notifications: read own" on public.notifications;
drop policy if exists "notifications: read own or caregiver of patient" on public.notifications;
drop policy if exists "notifications: insert if linked to patient" on public.notifications;
drop policy if exists "notifications: mark own read" on public.notifications;

create policy "notifications: read own or caregiver of patient"
  on public.notifications for select to authenticated
  using (
    target_user_id = auth.uid()
    or (
      patient_id is not null and exists (
        select 1 from public.patients p
        where p.id = notifications.patient_id
          and (
            p.user_id = auth.uid()
            or p.owner_user_id = auth.uid()
            or exists (select 1 from public.caregiver_patients cp
                       where cp.patient_id = p.id and cp.caregiver_id = auth.uid())
          )
      )
    )
  );

create policy "notifications: insert if linked to patient"
  on public.notifications for insert to authenticated
  with check (
    patient_id is null or exists (
      select 1 from public.patients p
      where p.id = patient_id and (
        p.user_id = auth.uid()
        or p.owner_user_id = auth.uid()
        or exists (select 1 from public.caregiver_patients cp
                   where cp.patient_id = p.id and cp.caregiver_id = auth.uid())
      )
    )
  );

create policy "notifications: mark own read"
  on public.notifications for update to authenticated
  using (target_user_id = auth.uid())
  with check (target_user_id = auth.uid());

-- 4) Realtime publication
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='events') then
    execute 'alter publication supabase_realtime add table public.events';
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='therapies') then
    execute 'alter publication supabase_realtime add table public.therapies';
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='patients') then
    execute 'alter publication supabase_realtime add table public.patients';
  end if;
end $$;

alter table public.notifications replica identity full;
alter table public.events replica identity full;

-- 5) Trigger dose confermata → notifica caregiver + gestione conferma-dopo-rimando
create or replace function public.handle_dose_taken()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_therapy public.therapies%rowtype;
  v_patient public.patients%rowtype;
  v_caregiver uuid;
  v_was_snoozed boolean;
  v_kind text;
  v_title text;
begin
  if new.status <> 'taken' or coalesce(old.status, '') = 'taken' then
    return new;
  end if;

  select * into v_therapy from public.therapies where id = new.therapy_id;
  if not found then return new; end if;
  select * into v_patient from public.patients where id = new.patient_id;

  update public.therapies
    set pills_remaining = greatest(0, pills_remaining - coalesce(v_therapy.quantity, 1))
    where id = new.therapy_id;

  insert into public.stock_movements (therapy_id, delta, reason, event_id)
  values (new.therapy_id, -coalesce(v_therapy.quantity, 1), 'intake', new.id);

  v_was_snoozed := coalesce(old.status, '') = 'snoozed' or coalesce(old.stage, '') in ('snoozed','final_due');
  if v_was_snoozed then
    v_kind := 'taken_after_snooze';
    v_title := v_patient.name || ' ha confermato ' || v_therapy.name || ' (dopo rimando)';
  else
    v_kind := 'taken';
    v_title := v_patient.name || ' ha confermato ' || v_therapy.name;
  end if;

  for v_caregiver in
    select caregiver_id from public.caregiver_patients where patient_id = new.patient_id
  loop
    insert into public.notifications (target_user_id, kind, severity, title, message, patient_id, therapy_id, event_id, dose_key)
    values (v_caregiver, v_kind, 'info', v_title,
            'Alle ' || to_char(new.confirmed_at at time zone 'Europe/Rome', 'HH24:MI'),
            new.patient_id, new.therapy_id, new.id,
            new.therapy_id || '@' || new.scheduled_at::text || '@' || v_kind)
    on conflict do nothing;
  end loop;

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

-- 6) pg_cron: invoca dose-scheduler ogni minuto (opzionale se già configurato)
-- Esegui manualmente sostituendo <PROJECT_REF> e <ANON_KEY>:
--
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
-- select cron.schedule('familymed-dose-scheduler', '* * * * *', $$
--   select net.http_post(
--     url:='https://<PROJECT_REF>.supabase.co/functions/v1/dose-scheduler',
--     headers:=jsonb_build_object('Authorization','Bearer <ANON_KEY>','Content-Type','application/json')
--   );
-- $$);
