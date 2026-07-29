-- ============================================================
-- MIGRATION: reset_patient_history
-- Funzione RPC per azzerare lo storico operativo di un paziente.
-- Conserva: patients, caregiver_patients, therapies (configurazione),
--            family_invites, patient_medical_profiles, profiles/user_roles.
-- Elimina: events, notifications, stock_movements.
-- Reset: pills_remaining = packs * pills_per_pack su ogni terapia.
--
-- Sicurezza: SECURITY DEFINER + verifica is_primary_of() interna.
-- Chiamata client: supabase.rpc('reset_patient_history', { _patient_id })
-- ============================================================

CREATE OR REPLACE FUNCTION public.reset_patient_history(_patient_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_events_deleted    int;
  v_notif_deleted     int;
  v_stock_deleted     int;
BEGIN
  -- ---- Autorizzazione: solo il caregiver primario ----
  IF NOT public.is_primary_of(_patient_id) THEN
    RAISE EXCEPTION 'Solo il caregiver primario può azzerare lo storico del paziente'
      USING ERRCODE = '42501';
  END IF;

  -- ---- 1. Elimina eventi (storico dosi: prese, saltate, ritardi, snooze) ----
  DELETE FROM public.events
    WHERE patient_id = _patient_id;
  GET DIAGNOSTICS v_events_deleted = ROW_COUNT;

  -- ---- 2. Elimina notifiche del paziente ----
  DELETE FROM public.notifications
    WHERE patient_id = _patient_id;
  GET DIAGNOSTICS v_notif_deleted = ROW_COUNT;

  -- ---- 3. Elimina movimenti di scorta per le terapie del paziente ----
  DELETE FROM public.stock_movements
    WHERE therapy_id IN (
      SELECT id FROM public.therapies WHERE patient_id = _patient_id
    );
  GET DIAGNOSTICS v_stock_deleted = ROW_COUNT;

  -- ---- 4. Ripristina scorte a pieno (packs × pills_per_pack) ----
  UPDATE public.therapies
    SET pills_remaining = packs * pills_per_pack
    WHERE patient_id = _patient_id;

  -- ---- Ritorna riepilogo per audit client-side ----
  RETURN jsonb_build_object(
    'ok',              true,
    'patient_id',      _patient_id,
    'reset_at',        now(),
    'events_deleted',  v_events_deleted,
    'notif_deleted',   v_notif_deleted,
    'stock_deleted',   v_stock_deleted
  );
END;
$$;

-- Revoca permessi default, la funzione è SECURITY DEFINER
REVOKE ALL ON FUNCTION public.reset_patient_history(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_patient_history(text) TO authenticated;
