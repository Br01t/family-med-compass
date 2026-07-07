-- ============================================================
-- FamilyMed — Notification system + Web Push
-- Esegui in Supabase Studio → SQL Editor → Run
-- Aggiunge:
--  • push_subscriptions (endpoint per Web Push)
--  • therapies.post_reminder_minutes (reminder DOPO l'orario se non confermato)
--  • notifications.kind e insert dal client per notificare i caregiver
--  • policy self-insert user_roles + backfill (idempotente da fix precedente)
-- ============================================================

-- 0. Backfill fix precedente (idempotente)
grant insert on public.user_roles to authenticated;
drop policy if exists "user_roles: self insert" on public.user_roles;
create policy "user_roles: self insert"
  on public.user_roles for insert to authenticated
  with check (user_id = auth.uid());

insert into public.user_roles (user_id, role)
select p.id, p.role from public.profiles p
left join public.user_roles ur on ur.user_id = p.id and ur.role = p.role
where ur.user_id is null
on conflict do nothing;

grant update on public.caregiver_patients to authenticated;
drop policy if exists "cp: caregiver can update own" on public.caregiver_patients;
create policy "cp: caregiver can update own"
  on public.caregiver_patients for update to authenticated
  using (caregiver_id = auth.uid()) with check (caregiver_id = auth.uid());

alter table public.therapies
  alter column reminder_intervals set default '{10}'::integer[];
update public.therapies
set reminder_intervals = array(select abs(value)::integer from unnest(reminder_intervals) as value)
where reminder_intervals is not null;

-- 1. Reminder POST (dopo l'orario, prima del missed)
alter table public.therapies
  add column if not exists post_reminder_minutes integer default 5;

-- 2. Notifications: colonna kind già presente; assicura policy insert per il caregiver/paziente linkato
--    così il client può inserire le notifiche caregiver quando conferma/salta/rimanda.
grant insert on public.notifications to authenticated;
drop policy if exists "notifications: insert if linked to patient" on public.notifications;
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

-- 3. push_subscriptions: endpoint browser per Web Push
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
