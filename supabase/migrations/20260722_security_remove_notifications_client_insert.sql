-- =========================================================
-- Sicurezza: rimozione policy INSERT client-side su notifications
-- =========================================================
-- Le notifiche sono generate ESCLUSIVAMENTE dai trigger SECURITY DEFINER
-- (handle_dose_taken, handle_dose_status_change) sul lato server.
-- Nessun client deve poter inserire notifiche direttamente:
--   1. La policy era più larga del necessario (surface of attack)
--   2. Il service_role (trigger) continua ad avere accesso completo
--   3. Se in futuro serviranno notifiche client-side, si userà una
--      funzione SECURITY DEFINER dedicata con validazioni proprie.
-- =========================================================

DROP POLICY IF EXISTS "notifications: insert if linked to patient" ON public.notifications;

-- Verifica: authenticated può ancora leggere e aggiornare (mark-as-read)
-- ma non inserire direttamente. Solo service_role (trigger) può inserire.
COMMENT ON TABLE public.notifications IS
  'INSERT: solo trigger SECURITY DEFINER (service_role). '
  'SELECT: target_user_id = auth.uid() o caregiver del paziente. '
  'UPDATE: solo mark-as-read (target_user_id = auth.uid()).';
