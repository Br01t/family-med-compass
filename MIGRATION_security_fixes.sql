-- =====================================================================
--  MIGRATION_security_fixes.sql
--  Correzioni di sicurezza identificate dall'audit agosto 2026
--
--  Esegui INTERAMENTE questo script nel Supabase SQL Editor.
--  È idempotente: può essere rieseguito senza problemi.
-- =====================================================================

-- -------------------------------------------------------------------
-- 1. REVOKE INSERT su notifications da authenticated
--    (La policy "insert if linked to patient" era già stata rimossa
--    nella migration precedente. Ora revochiamo anche il GRANT residuo
--    per impedire qualsiasi INSERT diretto — solo i trigger SECURITY
--    DEFINER (service_role) possono inserire notifiche.)
-- -------------------------------------------------------------------
REVOKE INSERT ON TABLE public.notifications FROM authenticated;

COMMENT ON TABLE public.notifications IS
  'INSERT: solo trigger SECURITY DEFINER (handle_dose_taken, handle_dose_status_change, process_dose_schedule) — service_role. '
  'SELECT: target_user_id = auth.uid() o caregiver del paziente. '
  'UPDATE: solo mark-as-read (target_user_id = auth.uid()). '
  'DELETE: solo cron giornaliero o RPC delete_my_account.';

-- -------------------------------------------------------------------
-- 2. REVOKE INSERT su caregiver_patients da authenticated
--    La tabella non ha policy INSERT per authenticated; solo la RPC
--    redeem_family_invite (SECURITY DEFINER) deve inserire righe.
--    Revochiamo il GRANT di INSERT per ridurre la superficie d'attacco.
-- -------------------------------------------------------------------
REVOKE INSERT ON TABLE public.caregiver_patients FROM authenticated;

COMMENT ON TABLE public.caregiver_patients IS
  'INSERT: solo RPC redeem_family_invite (SECURITY DEFINER). '
  'SELECT: caregiver self o paziente owner. '
  'UPDATE: caregiver self (relationship). '
  'DELETE: caregiver self o primario che rimuove secondari.';

-- -------------------------------------------------------------------
-- 3. FIX policy user_roles INSERT: impedire auto-assegnazione
--    di ruoli arbitrari. Solo "caregiver" e "paziente" sono validi.
-- -------------------------------------------------------------------
DROP POLICY IF EXISTS "user_roles: self insert" ON public.user_roles;

CREATE POLICY "user_roles: self insert" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND role IN ('caregiver', 'paziente')
  );

-- -------------------------------------------------------------------
-- 4. REPLICA IDENTITY DEFAULT su notifications
--    REPLICA IDENTITY FULL duplica inutilmente il WAL su ogni UPDATE
--    (vecchio + nuovo row completo). DEFAULT invia solo la PK per i
--    DELETE — sufficiente per il listener realtime lato client che
--    usa il campo "id" per rimuovere la riga dalla cache locale.
--    Risparmio stimato: -40% di egress WAL per la tabella notifications.
-- -------------------------------------------------------------------
ALTER TABLE public.notifications REPLICA IDENTITY DEFAULT;

-- -------------------------------------------------------------------
-- 5. FIX export_my_data: limita events agli ultimi 180 giorni
--    (coerente con la policy di retention del cron job)
--    Impedisce che il GDPR export diventi una query massiva per
--    pazienti con anni di storico.
-- -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.export_my_data()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
  v_retention_cutoff timestamptz := now() - interval '180 days';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non autenticato' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'exported_at', now(),
    'user_id', v_uid,
    'retention_note', 'Gli eventi/notifiche mostrati coprono gli ultimi 180 giorni (policy di retention automatica del servizio).',
    'profile', (
      SELECT to_jsonb(p) FROM public.profiles p WHERE p.id = v_uid
    ),
    'roles', (
      SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
      FROM public.user_roles r WHERE r.user_id = v_uid
    ),
    'consents', (
      SELECT coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
      FROM public.user_consents c WHERE c.user_id = v_uid
    ),
    'caregiver_record', (
      SELECT to_jsonb(c) FROM public.caregivers c WHERE c.id = v_uid
    ),
    'patients_owned', (
      SELECT coalesce(jsonb_agg(to_jsonb(pt)), '[]'::jsonb)
      FROM public.patients pt
      WHERE pt.user_id = v_uid
         OR pt.owner_user_id = v_uid
         OR (pt.owner_user_id IS NULL AND pt.primary_caregiver_id = v_uid)
    ),
    'caregiver_links', (
      SELECT coalesce(jsonb_agg(to_jsonb(cp)), '[]'::jsonb)
      FROM public.caregiver_patients cp
      WHERE cp.caregiver_id = v_uid
         OR cp.patient_id IN (SELECT id FROM public.patients WHERE user_id = v_uid)
    ),
    'therapies', (
      SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
      FROM public.therapies t
      WHERE t.patient_id IN (
        SELECT id FROM public.patients
        WHERE user_id = v_uid OR owner_user_id = v_uid
           OR (owner_user_id IS NULL AND primary_caregiver_id = v_uid)
        UNION
        SELECT patient_id FROM public.caregiver_patients WHERE caregiver_id = v_uid
      )
    ),
    'events', (
      -- Limitato agli ultimi 180 giorni (coerente con il cron di retention)
      SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.scheduled_at DESC), '[]'::jsonb)
      FROM public.events e
      WHERE e.scheduled_at >= v_retention_cutoff
        AND e.patient_id IN (
          SELECT id FROM public.patients
          WHERE user_id = v_uid OR owner_user_id = v_uid
             OR (owner_user_id IS NULL AND primary_caregiver_id = v_uid)
          UNION
          SELECT patient_id FROM public.caregiver_patients WHERE caregiver_id = v_uid
        )
    ),
    'notifications', (
      SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY n.created_at DESC), '[]'::jsonb)
      FROM public.notifications n
      WHERE n.target_user_id = v_uid
        AND n.created_at >= v_retention_cutoff
    ),
    'family_invites_created', (
      SELECT coalesce(jsonb_agg(to_jsonb(fi)), '[]'::jsonb)
      FROM public.family_invites fi WHERE fi.created_by = v_uid
    ),
    'stock_movements', (
      SELECT coalesce(jsonb_agg(to_jsonb(sm)), '[]'::jsonb)
      FROM public.stock_movements sm
      WHERE sm.therapy_id IN (
        SELECT t.id FROM public.therapies t
        WHERE t.patient_id IN (
          SELECT id FROM public.patients
          WHERE user_id = v_uid OR owner_user_id = v_uid
             OR (owner_user_id IS NULL AND primary_caregiver_id = v_uid)
        )
      )
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

ALTER FUNCTION public.export_my_data() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.export_my_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.export_my_data() TO authenticated;

COMMENT ON FUNCTION public.export_my_data() IS
  'GDPR Data Portability (art. 20): restituisce tutti i dati personali dell''utente autenticato in formato JSON. '
  'Gli eventi e le notifiche sono limitati agli ultimi 180 giorni (coerente con la retention automatica del servizio).';

-- -------------------------------------------------------------------
-- 6. Verifica finale
-- -------------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE 'MIGRATION_security_fixes.sql completata con successo.';
  RAISE NOTICE 'Verifica grants con: SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name IN (''notifications'', ''caregiver_patients'', ''user_roles'') ORDER BY table_name, grantee, privilege_type;';
END $$;
