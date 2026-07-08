-- ============================================================
-- PATCH: notifiche terapia complete + RLS + realtime + push
-- ============================================================
-- Esegui questo file UNA VOLTA sul tuo Supabase esterno (SQL Editor) se
-- hai già un database FamilyMed esistente. È idempotente.
-- ============================================================

-- 1) Colonne richieste dallo scheduler e dal client
alter table public.therapies
  add column if not exists snooze_minutes integer default 10,
  add column if not exists post_reminder_minutes integer default 5;

alter table public.events
  add column if not exists snooze_count integer default 0,
  add column if not exists snoozed_until timestamptz;

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

-- 2) Push subscriptions per registrare ogni telefono/browser
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

grant select, insert, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;
alter table public.push_subscriptions enable row level security;

drop policy if exists "push_sub: own read" on public.push_subscriptions;
create policy "push_sub: own read"
  on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "push_sub: own insert" on public.push_subscriptions;
create policy "push_sub: own insert"
  on public.push_subscriptions for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "push_sub: own delete" on public.push_subscriptions;
create policy "push_sub: own delete"
  on public.push_subscriptions for delete to authenticated
  using (user_id = auth.uid());

-- 3) GRANT + RLS notifiche
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
            or exists (
              select 1 from public.caregiver_patients cp
              where cp.patient_id = p.id and cp.caregiver_id = auth.uid()
            )
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

-- 4) Realtime publication idempotente
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events') then
    execute 'alter publication supabase_realtime add table public.events';
  end if;
end $$;

alter table public.notifications replica identity full;
alter table public.events replica identity full;
