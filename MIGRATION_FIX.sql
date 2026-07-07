-- ============================================================
-- FamilyMed — FIX permessi caregiver
-- Esegui in Supabase Studio → SQL Editor → Run
--
-- Risolve:
--  • Follow paziente non funziona (RLS blocca insert su caregiver_patients)
--  • Creazione terapia non funziona (RLS blocca insert su therapies)
--  • Causa: user_roles vuoto per gli utenti esistenti → has_role() = false
-- ============================================================

-- 1. Permetti al client di inserire il proprio ruolo (self-insert)
grant insert on public.user_roles to authenticated;

drop policy if exists "user_roles: self insert" on public.user_roles;
create policy "user_roles: self insert"
  on public.user_roles for insert to authenticated
  with check (user_id = auth.uid());

-- 2. Backfill user_roles per utenti già registrati
insert into public.user_roles (user_id, role)
select p.id, p.role
from public.profiles p
left join public.user_roles ur
  on ur.user_id = p.id and ur.role = p.role
where ur.user_id is null
on conflict do nothing;

-- 3. Verifica (opzionale) — deve mostrare una riga per ogni utente
-- select p.email, p.role, ur.role as user_roles_role
-- from public.profiles p
-- left join public.user_roles ur on ur.user_id = p.id;
