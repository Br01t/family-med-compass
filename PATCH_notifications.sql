-- ============================================================
-- PATCH: notifiche — RLS caregiver-visibility + realtime affidabile
-- ============================================================
-- Esegui questo file UNA VOLTA sul tuo Supabase (SQL Editor) se hai già
-- eseguito RESET.sql / MIGRATION.sql in passato. È idempotente.
--
-- Cosa fa:
--   1) Rimpiazza la policy SELECT sulle notifiche: il caregiver vede anche
--      quelle destinate ai pazienti che gestisce (owner o via caregiver_patients).
--      Il paziente continua a vedere solo le proprie.
--   2) La policy UPDATE (segna letta) resta ristretta al destinatario:
--      target_user_id = auth.uid() sia in USING che in WITH CHECK.
--   3) Assicura che la tabella sia nella publication supabase_realtime.
--   4) Imposta REPLICA IDENTITY FULL per avere gli eventi UPDATE completi
--      (necessari a sincronizzare read/unread in tempo reale su più device).
-- ============================================================

-- 1) SELECT policy allargata
drop policy if exists "notifications: read own" on public.notifications;
drop policy if exists "notifications: read own or caregiver of patient" on public.notifications;

create policy "notifications: read own or caregiver of patient"
  on public.notifications for select to authenticated
  using (
    target_user_id = auth.uid()
    or (
      patient_id is not null and exists (
        select 1 from public.patients p
        where p.id = notifications.patient_id
          and (
            p.owner_user_id = auth.uid()
            or exists (
              select 1 from public.caregiver_patients cp
              where cp.patient_id = p.id and cp.caregiver_id = auth.uid()
            )
          )
      )
    )
  );

-- 2) UPDATE policy: solo il destinatario
drop policy if exists "notifications: mark own read" on public.notifications;
create policy "notifications: mark own read"
  on public.notifications for update to authenticated
  using (target_user_id = auth.uid())
  with check (target_user_id = auth.uid());

-- 3) Realtime publication (idempotente)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end $$;

-- 4) Full row image per gli UPDATE realtime
alter table public.notifications replica identity full;
