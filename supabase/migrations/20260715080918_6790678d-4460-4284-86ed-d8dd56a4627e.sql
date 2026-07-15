
-- 1. Colonna primary_caregiver_id
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS primary_caregiver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS patients_primary_caregiver_idx
  ON public.patients (primary_caregiver_id);

-- 2. Backfill: primo caregiver collegato quando non c'è owner
UPDATE public.patients p
SET primary_caregiver_id = sub.caregiver_id
FROM (
  SELECT DISTINCT ON (patient_id) patient_id, caregiver_id
  FROM public.caregiver_patients
  ORDER BY patient_id, created_at ASC
) sub
WHERE p.id = sub.patient_id
  AND p.owner_user_id IS NULL
  AND p.primary_caregiver_id IS NULL;

-- 3. Helper is_primary_of
CREATE OR REPLACE FUNCTION public.is_primary_of(_patient_id text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = _patient_id
      AND (
        p.owner_user_id = auth.uid()
        OR (p.owner_user_id IS NULL AND p.primary_caregiver_id = auth.uid())
      )
  );
$$;

-- 4. redeem_family_invite: valorizza primary_caregiver_id al primo collegamento
CREATE OR REPLACE FUNCTION public.redeem_family_invite(_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Se il paziente non ha owner e nessun primario ancora, questo caregiver diventa primario
  update public.patients
    set primary_caregiver_id = auth.uid()
    where id = v_invite.patient_id
      and owner_user_id is null
      and primary_caregiver_id is null;

  update public.family_invites
    set uses = uses + 1,
        used_by = auth.uid(),
        used_at = now()
    where id = v_invite.id;

  return v_invite.patient_id;
end;
$$;

-- 5. create_family_invite: permette anche al primario "primo collegato"
CREATE OR REPLACE FUNCTION public.create_family_invite(_patient_id text, _ttl_minutes integer DEFAULT 1440, _max_uses integer DEFAULT 1)
RETURNS public.family_invites
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_row public.family_invites;
  v_code text;
  v_attempt int := 0;
begin
  if not exists (
    select 1 from public.patients p
    where p.id = _patient_id
      and (
        p.user_id = auth.uid()
        or p.owner_user_id = auth.uid()
        or (p.owner_user_id is null and p.primary_caregiver_id = auth.uid())
      )
  ) then
    raise exception 'Non autorizzato a creare inviti per questo paziente' using errcode = '42501';
  end if;

  if _ttl_minutes is null or _ttl_minutes <= 0 then _ttl_minutes := 1440; end if;
  if _max_uses is null or _max_uses <= 0 then _max_uses := 1; end if;

  loop
    v_attempt := v_attempt + 1;
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

-- 6. Refactor policy: therapies
DROP POLICY IF EXISTS "therapies: rw se paziente o caregiver linked" ON public.therapies;

CREATE POLICY "therapies: read linked" ON public.therapies
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = therapies.patient_id
      AND (
        p.user_id = auth.uid()
        OR p.owner_user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.caregiver_patients cp
          WHERE cp.patient_id = p.id AND cp.caregiver_id = auth.uid()
        )
      )
  ));

CREATE POLICY "therapies: insert primary" ON public.therapies
  FOR INSERT TO authenticated
  WITH CHECK (public.is_primary_of(patient_id));

CREATE POLICY "therapies: update primary" ON public.therapies
  FOR UPDATE TO authenticated
  USING (public.is_primary_of(patient_id))
  WITH CHECK (public.is_primary_of(patient_id));

CREATE POLICY "therapies: delete primary" ON public.therapies
  FOR DELETE TO authenticated
  USING (public.is_primary_of(patient_id));

-- 7. stock_movements: INSERT solo primario
DROP POLICY IF EXISTS "stock: insert se accesso alla terapia" ON public.stock_movements;

CREATE POLICY "stock: insert primary" ON public.stock_movements
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.therapies t
    WHERE t.id = stock_movements.therapy_id
      AND public.is_primary_of(t.patient_id)
  ));

-- 8. patients UPDATE / DELETE: primario o paziente stesso
DROP POLICY IF EXISTS "patients: owner or linked caregiver update" ON public.patients;
DROP POLICY IF EXISTS "patients: owner or linked caregiver delete" ON public.patients;

CREATE POLICY "patients: primary or self update" ON public.patients
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_primary_of(id))
  WITH CHECK (user_id = auth.uid() OR public.is_primary_of(id));

CREATE POLICY "patients: primary or self delete" ON public.patients
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_primary_of(id));

-- 9. events: split SELECT+UPDATE (tutti i linked) vs INSERT+DELETE (primario)
DROP POLICY IF EXISTS "events: rw se paziente o caregiver linked" ON public.events;

CREATE POLICY "events: read linked" ON public.events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = events.patient_id
      AND (
        p.user_id = auth.uid()
        OR p.owner_user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.caregiver_patients cp
          WHERE cp.patient_id = p.id AND cp.caregiver_id = auth.uid()
        )
      )
  ));

CREATE POLICY "events: update linked" ON public.events
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = events.patient_id
      AND (
        p.user_id = auth.uid()
        OR p.owner_user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.caregiver_patients cp
          WHERE cp.patient_id = p.id AND cp.caregiver_id = auth.uid()
        )
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = events.patient_id
      AND (
        p.user_id = auth.uid()
        OR p.owner_user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.caregiver_patients cp
          WHERE cp.patient_id = p.id AND cp.caregiver_id = auth.uid()
        )
      )
  ));

CREATE POLICY "events: insert primary" ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (public.is_primary_of(patient_id));

CREATE POLICY "events: delete primary" ON public.events
  FOR DELETE TO authenticated
  USING (public.is_primary_of(patient_id));

-- 10. caregiver_patients: il primario può rimuovere secondari
CREATE POLICY "cp: primary can remove secondary" ON public.caregiver_patients
  FOR DELETE TO authenticated
  USING (public.is_primary_of(patient_id) AND caregiver_id <> auth.uid());

-- 11. family_invites: allarga read/delete al primario primo collegato
DROP POLICY IF EXISTS "invites: owner read" ON public.family_invites;
DROP POLICY IF EXISTS "invites: owner delete" ON public.family_invites;

CREATE POLICY "invites: owner or primary read" ON public.family_invites
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = family_invites.patient_id
        AND (
          p.user_id = auth.uid()
          OR p.owner_user_id = auth.uid()
          OR (p.owner_user_id IS NULL AND p.primary_caregiver_id = auth.uid())
        )
    )
  );

CREATE POLICY "invites: owner or primary delete" ON public.family_invites
  FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = family_invites.patient_id
        AND (
          p.user_id = auth.uid()
          OR p.owner_user_id = auth.uid()
          OR (p.owner_user_id IS NULL AND p.primary_caregiver_id = auth.uid())
        )
    )
  );
