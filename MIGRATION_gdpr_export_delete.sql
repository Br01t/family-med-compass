-- =====================================================================
-- GDPR: Data Portability (export) + Right to Erasure (account deletion)
-- =====================================================================
-- Fornisce due RPC richiamabili da qualsiasi utente autenticato:
--   * public.export_my_data()      -> jsonb con tutti i dati dell'utente
--   * public.delete_my_account()   -> cancella dati + auth.users
--
-- Entrambe le funzioni sono SECURITY DEFINER, di proprietà di `postgres`
-- (che ha i privilegi sullo schema auth), e usano SOLO auth.uid() per
-- identificare il chiamante — nessun parametro esterno accettato.
-- =====================================================================

-- ---------- EXPORT ---------------------------------------------------
create or replace function public.export_my_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'Non autenticato' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'exported_at', now(),
    'user_id', v_uid,
    'profile', (
      select to_jsonb(p) from public.profiles p where p.id = v_uid
    ),
    'roles', (
      select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
      from public.user_roles r where r.user_id = v_uid
    ),
    'caregiver_record', (
      select to_jsonb(c) from public.caregivers c where c.id = v_uid
    ),
    'patients_owned', (
      select coalesce(jsonb_agg(to_jsonb(pt)), '[]'::jsonb)
      from public.patients pt
      where pt.user_id = v_uid
         or pt.owner_user_id = v_uid
         or (pt.owner_user_id is null and pt.primary_caregiver_id = v_uid)
    ),
    'caregiver_links', (
      select coalesce(jsonb_agg(to_jsonb(cp)), '[]'::jsonb)
      from public.caregiver_patients cp
      where cp.caregiver_id = v_uid
         or cp.patient_id in (select id from public.patients where user_id = v_uid)
    ),
    'therapies', (
      select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
      from public.therapies t
      where t.patient_id in (
        select id from public.patients
        where user_id = v_uid or owner_user_id = v_uid
           or (owner_user_id is null and primary_caregiver_id = v_uid)
        union
        select patient_id from public.caregiver_patients where caregiver_id = v_uid
      )
    ),
    'events', (
      select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
      from public.events e
      where e.patient_id in (
        select id from public.patients
        where user_id = v_uid or owner_user_id = v_uid
           or (owner_user_id is null and primary_caregiver_id = v_uid)
        union
        select patient_id from public.caregiver_patients where caregiver_id = v_uid
      )
    ),
    'notifications', (
      select coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb)
      from public.notifications n where n.target_user_id = v_uid
    ),
    'family_invites_created', (
      select coalesce(jsonb_agg(to_jsonb(fi)), '[]'::jsonb)
      from public.family_invites fi where fi.created_by = v_uid
    ),
    'stock_movements', (
      select coalesce(jsonb_agg(to_jsonb(sm)), '[]'::jsonb)
      from public.stock_movements sm
      where sm.therapy_id in (
        select t.id from public.therapies t
        where t.patient_id in (
          select id from public.patients
          where user_id = v_uid or owner_user_id = v_uid
             or (owner_user_id is null and primary_caregiver_id = v_uid)
        )
      )
    )
  ) into v_result;

  return v_result;
end;
$$;

alter function public.export_my_data() owner to postgres;
revoke all on function public.export_my_data() from public;
grant execute on function public.export_my_data() to authenticated;

-- ---------- DELETE ---------------------------------------------------
-- Elimina tutti i dati dell'utente + la sua riga in auth.users.
-- Comportamento:
--   * Rimuove sempre: notifiche, ruoli, consensi, inviti creati dall'utente,
--     link caregiver_patients dove è caregiver, profilo, caregiver row.
--   * Per ciascun paziente di cui l'utente è OWNER (user_id o owner_user_id):
--       - se non è primario/owner nessun altro → cancella il paziente
--         (cascade su therapies, events, stock_movements via FK ON DELETE CASCADE
--         nello schema; in caso contrario le rimuoviamo esplicitamente prima).
--   * Se è primary_caregiver_id di un paziente "gestito" (senza owner_user_id)
--     e nessun altro caregiver è collegato → cancella il paziente.
--     Altrimenti azzera primary_caregiver_id per non lasciare riferimenti.
--   * Infine cancella la riga in auth.users (cascata standard Supabase).
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_patient_id text;
begin
  if v_uid is null then
    raise exception 'Non autenticato' using errcode = '42501';
  end if;

  -- Notifiche destinate a me
  delete from public.notifications where target_user_id = v_uid;

  -- Inviti famiglia creati da me (non ancora usati o già usati)
  delete from public.family_invites where created_by = v_uid or used_by = v_uid;

  -- Link caregiver -> paziente in cui sono caregiver
  delete from public.caregiver_patients where caregiver_id = v_uid;

  -- Pazienti di cui sono OWNER (paziente registrato o creato da caregiver)
  for v_patient_id in
    select id from public.patients
    where user_id = v_uid or owner_user_id = v_uid
  loop
    delete from public.stock_movements
      where therapy_id in (select id from public.therapies where patient_id = v_patient_id);
    delete from public.events where patient_id = v_patient_id;
    delete from public.therapies where patient_id = v_patient_id;
    delete from public.caregiver_patients where patient_id = v_patient_id;
    delete from public.family_invites where patient_id = v_patient_id;
    delete from public.notifications where patient_id = v_patient_id;
    delete from public.patients where id = v_patient_id;
  end loop;

  -- Pazienti "gestiti" senza owner in cui ero primary caregiver
  for v_patient_id in
    select id from public.patients
    where owner_user_id is null and primary_caregiver_id = v_uid
  loop
    if not exists (
      select 1 from public.caregiver_patients where patient_id = v_patient_id
    ) then
      delete from public.stock_movements
        where therapy_id in (select id from public.therapies where patient_id = v_patient_id);
      delete from public.events where patient_id = v_patient_id;
      delete from public.therapies where patient_id = v_patient_id;
      delete from public.family_invites where patient_id = v_patient_id;
      delete from public.notifications where patient_id = v_patient_id;
      delete from public.patients where id = v_patient_id;
    else
      update public.patients set primary_caregiver_id = null where id = v_patient_id;
    end if;
  end loop;

  -- Ruoli, caregiver row, profilo
  delete from public.user_roles where user_id = v_uid;
  delete from public.caregivers where id = v_uid;
  delete from public.profiles where id = v_uid;

  -- Consensi GDPR (se la tabella esiste)
  begin
    execute 'delete from public.user_consents where user_id = $1' using v_uid;
  exception when undefined_table then
    null;
  end;

  -- Infine, elimina la riga in auth.users (richiede owner=postgres)
  delete from auth.users where id = v_uid;
end;
$$;

alter function public.delete_my_account() owner to postgres;
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

comment on function public.export_my_data() is
  'GDPR Data Portability: restituisce tutti i dati personali dell''utente autenticato in formato JSON.';
comment on function public.delete_my_account() is
  'GDPR Right to Erasure: cancella definitivamente l''account e tutti i dati collegati dell''utente autenticato.';
