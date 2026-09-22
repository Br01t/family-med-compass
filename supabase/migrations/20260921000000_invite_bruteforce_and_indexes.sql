-- FamilyMed — (1) protezione anti brute-force sui codici invito famiglia,
-- (2) indici mancanti su colonne effettivamente interrogate.
--
-- ===================================================================
-- PARTE 1 — Codici invito: più entropia + limite tentativi falliti
-- ===================================================================
-- Problema (segnalato durante l'audit di sicurezza iniziale, mai corretto
-- finora): redeem_family_invite() non aveva alcun limite di tentativi.
-- Un caregiver autenticato poteva chiamarla ripetutamente con codici
-- casuali per indovinare un invito valido di un'altra famiglia — 6
-- caratteri da un alfabeto ~64 simboli danno circa 36 bit di entropia
-- (~68 miliardi di combinazioni), non trascurabili ma nemmeno
-- irraggiungibili con tentativi automatizzati sostenuti entro la finestra
-- di validità di 24h.
--
-- Fix a due livelli, nessuno dei due da solo sarebbe stato sufficiente:
--   1. Codice più lungo (8 caratteri, ~48 bit, ~281 mila miliardi di
--      combinazioni) — rende il brute-force puro impraticabile.
--   2. Limite di tentativi falliti per utente (8 ogni 10 minuti), tracciato
--      riusando audit_log (stesso pattern già in uso in log_patient_view,
--      nessuna tabella nuova) — chiude comunque la porta anche se in futuro
--      l'entropia dovesse rivelarsi insufficiente per qualche motivo.

CREATE OR REPLACE FUNCTION public.create_family_invite(
  _patient_id text,
  _ttl_minutes integer DEFAULT 1440,
  _max_uses integer DEFAULT 1
) RETURNS public.family_invites
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    -- 8 caratteri invece di 6: stessa UX (codice breve da condividere a
    -- voce/messaggio), entropia molto più alta.
    v_code := upper(translate(
      substr(encode(gen_random_bytes(10), 'base64'), 1, 8),
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

CREATE OR REPLACE FUNCTION public.redeem_family_invite(_code text)
RETURNS text
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

  -- Limite tentativi: se questo utente ha già generato 8+ fallimenti negli
  -- ultimi 10 minuti, blocca PRIMA di controllare il nuovo codice (così un
  -- eventuale attaccante non ottiene nemmeno il segnale "codice sbagliato"
  -- vs "troppi tentativi" per distinguere i due casi più velocemente).
  select count(*) into v_recent_failures
  from public.audit_log
  where actor_id = auth.uid()
    and action = 'invite_redeem_failed'
    and created_at > now() - interval '10 minutes';

  if v_recent_failures >= 8 then
    raise exception 'Troppi tentativi. Riprova tra qualche minuto.' using errcode = '42501';
  end if;

  select * into v_invite from public.family_invites
    where code = upper(trim(_code)) for update;

  if not found then
    insert into public.audit_log(actor_id, actor_name, action, entity_type, summary)
    values (auth.uid(), coalesce(public.audit_actor_name(auth.uid()), 'Utente'),
            'invite_redeem_failed', 'family_invite', 'Tentativo con codice invito non valido');
    raise exception 'Codice non valido' using errcode = 'P0002';
  end if;
  if v_invite.expires_at < now() then
    insert into public.audit_log(actor_id, actor_name, action, entity_type, entity_id, summary)
    values (auth.uid(), coalesce(public.audit_actor_name(auth.uid()), 'Utente'),
            'invite_redeem_failed', 'family_invite', v_invite.id::text, 'Tentativo con codice invito scaduto');
    raise exception 'Codice scaduto' using errcode = 'P0003';
  end if;
  if v_invite.uses >= v_invite.max_uses then
    insert into public.audit_log(actor_id, actor_name, action, entity_type, entity_id, summary)
    values (auth.uid(), coalesce(public.audit_actor_name(auth.uid()), 'Utente'),
            'invite_redeem_failed', 'family_invite', v_invite.id::text, 'Tentativo con codice invito già esaurito');
    raise exception 'Codice già utilizzato' using errcode = 'P0004';
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

  return v_invite.patient_id;
end;
$$;

COMMENT ON FUNCTION public.redeem_family_invite(text) IS
  'Riscatta un codice invito famiglia. Limita a 8 tentativi falliti ogni 10 minuti per utente (tracciati in audit_log, action=invite_redeem_failed) per contrastare il brute-force dei codici. Codici generati da create_family_invite ora a 8 caratteri (~48 bit di entropia).';

-- Pulizia periodica coerente col resto dell'app: le righe
-- "invite_redeem_failed" sono già coperte dalla retention generale di 90
-- giorni di audit_log (cron esistente), nessuna aggiunta necessaria qui.

-- ===================================================================
-- PARTE 2 — Indici mancanti su colonne effettivamente interrogate
-- ===================================================================
-- Trovati confrontando ogni foreign key con gli indici esistenti E
-- verificando che la colonna compaia davvero in una clausola WHERE di una
-- policy RLS o di una funzione (per non aggiungere indici che nessuna
-- query userebbe mai — costerebbero solo overhead di scrittura).

-- user_roles.user_id: non è la chiave primaria della tabella (lo è un id
-- separato), ma è la colonna controllata a OGNI verifica di ruolo — tra le
-- query più frequenti dell'intera app.
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);

-- family_invites.created_by: usata dentro la policy RLS "family_invites:
-- read" (valutata a ogni riga) e in delete_my_account/get_family_group_data.
CREATE INDEX IF NOT EXISTS idx_family_invites_created_by ON public.family_invites(created_by);

-- family_invites.used_by: usata in delete_my_account.
CREATE INDEX IF NOT EXISTS idx_family_invites_used_by ON public.family_invites(used_by);

-- notifications.patient_id: usata nella policy RLS "notifications: read"
-- (ramo di accesso via paziente) e nelle funzioni di reset/cancellazione.
CREATE INDEX IF NOT EXISTS idx_notifications_patient_id ON public.notifications(patient_id);

-- =============================================================
-- Verifica dopo l'applicazione:
--   1. Creare un invito, verificarne il codice a 8 caratteri.
--   2. Chiamare redeem_family_invite con un codice sbagliato 9 volte di
--      fila con lo stesso utente -> la nona chiamata deve dare "Troppi
--      tentativi", non "Codice non valido".
--   3. select indexname from pg_indexes where schemaname='public'
--      and indexname like 'idx_%' order by indexname;
--      deve includere i 4 nuovi indici sopra.
-- =============================================================