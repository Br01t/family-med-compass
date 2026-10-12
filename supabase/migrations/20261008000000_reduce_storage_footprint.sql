-- ============================================================================
-- Meno spazio sul database (piano Free di Supabase: 500 MB), senza togliere funzioni.
-- Misurato con tabelle e indici reali, per un utente molto attivo (6 dosi al giorno):
--   registro audit delle dosi (Free/Pro, invisibile): ~0,77 KB per dose  -> non si scrive più
--   notifiche: 3 per dose, ~2,2 KB per dose, tenute 30 giorni            -> 14 giorni
-- L'app mostra comunque al massimo le ultime 100 notifiche.
-- ============================================================================

CREATE OR REPLACE FUNCTION "public"."_audit_row_capture"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_patient_id text;
  v_record_id text;
  v_old jsonb := '{}'::jsonb;
  v_new jsonb := '{}'::jsonb;
  v_changed text[];
  v_detail jsonb;
  -- Solo questi campi (piccoli e significativi) vengono salvati con
  -- valore prima/dopo. Tutto il resto compare solo come nome campo
  -- in changed_fields, senza contenuto.
  v_allowlist text[] := ARRAY[
    'name', 'dosage', 'quantity', 'category', 'active', 'suspended',
    'start_date', 'end_date', 'status', 'confirmed_by',
    'primary_caregiver_id', 'owner_user_id', 'user_id', 'birth_year'
  ];
  -- Colonne che cambiano per effetto di automatismi di sistema
  -- (non azioni umane) e che sono già tracciate altrove: se sono
  -- le UNICHE a cambiare, non si scrive nessuna riga.
  v_noise_only text[] := ARRAY['pills_remaining'];
  v_key text;
BEGIN
  -- Volume: ogni cambio di stato di una dose (presa, mancata, saltata...) scriveva una riga di
  -- audit per TUTTI i piani, ma il registro attività è una funzione del solo piano Max
  -- (PLAN_LIMITS.auditLog): per Free e Pro erano righe che nessuno poteva vedere, conservate
  -- 90 giorni. Chi ha confermato la dose resta comunque in events.confirmed_by / confirmed_at.
  -- Le modifiche a pazienti, terapie e gruppo di cura restano registrate per tutti i piani.
  IF TG_TABLE_NAME = 'events' THEN
    IF public.patient_plan(COALESCE(NEW.patient_id, OLD.patient_id)) <> 'max' THEN
      RETURN COALESCE(NEW, OLD);
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  ELSE
    v_new := to_jsonb(NEW);
  END IF;

  IF TG_TABLE_NAME = 'patients' THEN
    v_record_id := COALESCE(NEW.id, OLD.id);
    v_patient_id := v_record_id;
  ELSIF TG_TABLE_NAME IN ('therapies', 'events') THEN
    v_record_id := COALESCE(NEW.id, OLD.id);
    v_patient_id := COALESCE(NEW.patient_id, OLD.patient_id);
  ELSIF TG_TABLE_NAME = 'caregiver_patients' THEN
    v_patient_id := COALESCE(NEW.patient_id, OLD.patient_id);
    v_record_id := COALESCE(NEW.caregiver_id, OLD.caregiver_id)::text || ':' || v_patient_id;
  ELSE
    v_record_id := COALESCE((to_jsonb(COALESCE(NEW, OLD)) ->> 'id'), 'unknown');
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(k ORDER BY k) INTO v_changed
    FROM jsonb_object_keys(v_new) AS k
    WHERE (v_new -> k) IS DISTINCT FROM (v_old -> k);

    IF v_changed IS NULL THEN
      RETURN COALESCE(NEW, OLD); -- nessun campo realmente cambiato: non scrivere nulla
    END IF;

    IF v_changed <@ v_noise_only THEN
      RETURN COALESCE(NEW, OLD); -- solo automatismi di sistema (es. scarico magazzino): skip
    END IF;

    v_detail := '{}'::jsonb;
    FOREACH v_key IN ARRAY v_changed LOOP
      IF v_key = ANY (v_allowlist) THEN
        v_detail := v_detail || jsonb_build_object(
          v_key, jsonb_build_object('da', v_old -> v_key, 'a', v_new -> v_key)
        );
      END IF;
      -- campi fuori allowlist: restano solo in changed_fields, senza valore
    END LOOP;
    IF v_detail = '{}'::jsonb THEN
      v_detail := NULL;
    END IF;
  ELSE
    -- INSERT/DELETE: nessun dump di riga, il contenuto è già nella
    -- tabella (o non lo è più, per le DELETE). Evita di duplicare
    -- dati sanitari nel log.
    v_detail := NULL;
  END IF;

  INSERT INTO public.audit_log (patient_id, table_name, record_id, action, actor_id, changed_fields, detail)
  VALUES (v_patient_id, TG_TABLE_NAME, v_record_id, TG_OP, auth.uid(), v_changed, v_detail);

  RETURN COALESCE(NEW, OLD);
END;
$$;

ALTER FUNCTION "public"."_audit_row_capture"() OWNER TO "postgres";

-- Notifiche: 14 giorni (cron.schedule con lo stesso nome aggiorna il job esistente)
SELECT cron.schedule(
  'notifications-cleanup-daily',
  '0 3 * * *',
  $$ DELETE FROM public.notifications WHERE created_at < now() - interval '14 days'; $$
);
