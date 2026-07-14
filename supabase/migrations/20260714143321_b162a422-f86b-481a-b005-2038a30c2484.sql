
-- 1. Restrict patients SELECT: only owners, patient-user, or linked caregivers
drop policy if exists "patients: authenticated can read all" on public.patients;
create policy "patients: silo read"
  on public.patients for select to authenticated
  using (
    user_id = auth.uid()
    or owner_user_id = auth.uid()
    or exists (
      select 1 from public.caregiver_patients cp
      where cp.patient_id = patients.id and cp.caregiver_id = auth.uid()
    )
  );

-- 2. Remove open INSERT on caregiver_patients (only redeem RPC allowed)
drop policy if exists "cp: caregiver can follow" on public.caregiver_patients;
revoke insert on public.caregiver_patients from authenticated;

-- 3. Caregivers linked to same patient can see each other
drop policy if exists "caregivers: family peers read" on public.caregivers;
create policy "caregivers: family peers read"
  on public.caregivers for select to authenticated
  using (
    exists (
      select 1
      from public.caregiver_patients cp1
      join public.caregiver_patients cp2 on cp1.patient_id = cp2.patient_id
      where cp1.caregiver_id = auth.uid()
        and cp2.caregiver_id = caregivers.id
    )
  );

-- 4. family_invites table
create table if not exists public.family_invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  patient_id text not null references public.patients(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  max_uses int not null default 1,
  uses int not null default 0,
  used_by uuid references auth.users(id),
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists family_invites_patient_idx on public.family_invites(patient_id);
create index if not exists family_invites_code_idx on public.family_invites(code);

grant select, insert, update, delete on public.family_invites to authenticated;
grant all on public.family_invites to service_role;

alter table public.family_invites enable row level security;

-- Patient or caregiver-owner sees & manages their own invites
drop policy if exists "invites: owner read" on public.family_invites;
create policy "invites: owner read"
  on public.family_invites for select to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.patients p
      where p.id = family_invites.patient_id
        and (p.user_id = auth.uid() or p.owner_user_id = auth.uid())
    )
  );

drop policy if exists "invites: owner delete" on public.family_invites;
create policy "invites: owner delete"
  on public.family_invites for delete to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.patients p
      where p.id = family_invites.patient_id
        and (p.user_id = auth.uid() or p.owner_user_id = auth.uid())
    )
  );
-- INSERT/UPDATE only via SECURITY DEFINER RPC below.

-- 5. RPC: create invite (paziente o owner del paziente)
create or replace function public.create_family_invite(
  _patient_id text,
  _ttl_minutes int default 1440,
  _max_uses int default 1
)
returns public.family_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.family_invites;
  v_code text;
  v_attempt int := 0;
begin
  if not exists (
    select 1 from public.patients p
    where p.id = _patient_id
      and (p.user_id = auth.uid() or p.owner_user_id = auth.uid())
  ) then
    raise exception 'Non autorizzato a creare inviti per questo paziente' using errcode = '42501';
  end if;

  if _ttl_minutes is null or _ttl_minutes <= 0 then _ttl_minutes := 1440; end if;
  if _max_uses is null or _max_uses <= 0 then _max_uses := 1; end if;

  loop
    v_attempt := v_attempt + 1;
    -- 6 char alphanumeric (no ambiguous 0/O/1/I)
    v_code := upper(translate(
      substr(encode(gen_random_bytes(8), 'base64'), 1, 6),
      '01OIl+/=', 'ABCDEFGH'
    ));
    begin
      insert into public.family_invites (code, patient_id, created_by, expires_at, max_uses)
      values (v_code, _patient_id, auth.uid(), now() + make_interval(mins => _ttl_minutes), _max_uses)
      returning * into v_row;
      exit;
    exception when unique_violation then
      if v_attempt > 8 then raise; end if;
    end;
  end loop;

  return v_row;
end;
$$;

grant execute on function public.create_family_invite(text, int, int) to authenticated;

-- 6. RPC: redeem invite (caregiver)
create or replace function public.redeem_family_invite(_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.family_invites;
begin
  if not public.has_role(auth.uid(), 'caregiver') then
    raise exception 'Solo un caregiver può usare un codice invito' using errcode = '42501';
  end if;

  select * into v_invite from public.family_invites
    where code = upper(trim(_code)) for update;

  if not found then
    raise exception 'Codice non valido' using errcode = 'P0002';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'Codice scaduto' using errcode = 'P0003';
  end if;
  if v_invite.uses >= v_invite.max_uses then
    raise exception 'Codice già utilizzato' using errcode = 'P0004';
  end if;

  insert into public.caregiver_patients (caregiver_id, patient_id)
    values (auth.uid(), v_invite.patient_id)
    on conflict do nothing;

  update public.family_invites
    set uses = uses + 1,
        used_by = auth.uid(),
        used_at = now()
    where id = v_invite.id;

  return v_invite.patient_id;
end;
$$;

grant execute on function public.redeem_family_invite(text) to authenticated;
