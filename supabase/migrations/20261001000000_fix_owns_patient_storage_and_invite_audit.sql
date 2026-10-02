-- ============================================================================
-- FIX:
-- 1. owns_patient() non considerava i caregiver proprietari (owner_user_id).
-- 2. can_access_therapy_photo() non permetteva al Caregiver Primario di leggere
--    la foto caricata per il paziente assistito.
-- 3. redeem_family_invite() faceva rollback dell'audit_log di fallimento
--    a causa del RAISE EXCEPTION 'Codice non valido' (transazione abortita).
--    Ora usa set_config('response.status', ...) e restituisce jsonb d'errore
--    in modo che l'evento audit_log rimanga salvato e l'anti-bruteforce scatti.
-- ============================================================================

-- 1. owns_patient: verifica sia user_id che owner_user_id
CREATE OR REPLACE FUNCTION public.owns_patient(_patient_id text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = _patient_id
      AND (
        p.user_id = auth.uid()
        OR p.owner_user_id = auth.uid()
        OR (p.owner_user_id IS NULL AND p.primary_caregiver_id = auth.uid())
      )
  );
$$;

-- 2. can_access_therapy_photo: include is_primary_of
CREATE OR REPLACE FUNCTION public.can_access_therapy_photo(_object_name text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_segments text[] := storage.foldername(_object_name);
  v_second text := v_segments[2];
  v_third text := v_segments[3];
BEGIN
  IF v_third IS NOT NULL THEN
    -- Nuovo schema: v_second = patientId, v_third = therapyId
    RETURN public.owns_patient(v_second) OR public.is_primary_of(v_second) OR public.is_caregiver_of(v_second);
  END IF;

  IF v_second IS NOT NULL THEN
    -- Schema legacy: v_second = therapyId, risaliamo al paziente
    RETURN EXISTS (
      SELECT 1 FROM public.therapies t
      WHERE t.id = v_second
        AND (public.owns_patient(t.patient_id) OR public.is_primary_of(t.patient_id) OR public.is_caregiver_of(t.patient_id))
    );
  END IF;

  RETURN false;
END;
$$;

-- 3. redeem_family_invite: cambia firma a jsonb per permettere commit dell'audit_log
DROP FUNCTION IF EXISTS public.redeem_family_invite(text);

CREATE OR REPLACE FUNCTION public.redeem_family_invite(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_invite public.family_invites;
  v_recent_failures integer;
begin
  if not public.has_role(auth.uid(), 'caregiver') then
    raise exception 'Solo un caregiver può usare un codice invito' using errcode = '42501';
  end if;

  -- Limite tentativi: se questo utente ha già generato 8+ fallimenti negli ultimi 10 minuti
  select count(*) into v_recent_failures
  from public.audit_log
  where actor_id = auth.uid()
    and action = 'invite_redeem_failed'
    and created_at > now() - interval '10 minutes';

  if v_recent_failures >= 8 then
    perform set_config('response.status', '429', true);
    return jsonb_build_object('message', 'Troppi tentativi. Riprova tra qualche minuto.', 'code', '42501');
  end if;

  select * into v_invite from public.family_invites
    where code = upper(trim(_code)) for update;

  if not found then
    insert into public.audit_log(actor_id, actor_name, action, entity_type, summary)
    values (auth.uid(), coalesce(public.audit_actor_name(auth.uid()), 'Utente'),
            'invite_redeem_failed', 'family_invite', 'Tentativo con codice invito non valido');
    perform set_config('response.status', '400', true);
    return jsonb_build_object('message', 'Codice non valido', 'code', 'P0002');
  end if;

  if v_invite.expires_at < now() then
    insert into public.audit_log(actor_id, actor_name, action, entity_type, entity_id, summary)
    values (auth.uid(), coalesce(public.audit_actor_name(auth.uid()), 'Utente'),
            'invite_redeem_failed', 'family_invite', v_invite.id::text, 'Tentativo con codice invito scaduto');
    perform set_config('response.status', '400', true);
    return jsonb_build_object('message', 'Codice scaduto', 'code', 'P0003');
  end if;

  if v_invite.uses >= v_invite.max_uses then
    insert into public.audit_log(actor_id, actor_name, action, entity_type, entity_id, summary)
    values (auth.uid(), coalesce(public.audit_actor_name(auth.uid()), 'Utente'),
            'invite_redeem_failed', 'family_invite', v_invite.id::text, 'Tentativo con codice invito già esaurito');
    perform set_config('response.status', '400', true);
    return jsonb_build_object('message', 'Codice già utilizzato', 'code', 'P0004');
  end if;

  insert into public.caregiver_patients (caregiver_id, patient_id)
    values (auth.uid(), v_invite.patient_id)
    on conflict do nothing;

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

  return to_jsonb(v_invite.patient_id);
end;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_family_invite(text) TO authenticated;
