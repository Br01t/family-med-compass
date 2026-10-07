-- ============================================================
-- Export GDPR (art. 20) COMPLETO.
-- Prima export_my_data() non includeva: patient_medical_profiles, vital_signs,
-- wellness_notes, adherence_monthly e il log delle azioni dell'utente.
-- Stesso criterio di perimetro di therapies/events (pazienti propri + collegati).
-- ============================================================

CREATE OR REPLACE FUNCTION "public"."export_my_data"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
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
    'retention_note', 'Eventi (dosi): ultimi 180 giorni (35 giorni per il piano Free); notifiche: ultimi 180 giorni; note di benessere: ultimi 24 mesi; parametri vitali: secondo la policy di retention del servizio (vedi retention-policy.md).',
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
    'patient_medical_profiles', (
      SELECT coalesce(jsonb_agg(to_jsonb(mp)), '[]'::jsonb)
      FROM public.patient_medical_profiles mp
      WHERE mp.patient_id IN (
          SELECT id FROM public.patients
          WHERE user_id = v_uid OR owner_user_id = v_uid
             OR (owner_user_id IS NULL AND primary_caregiver_id = v_uid)
          UNION
          SELECT patient_id FROM public.caregiver_patients WHERE caregiver_id = v_uid
        )
    ),
    'vital_signs', (
      SELECT coalesce(jsonb_agg(to_jsonb(vs) ORDER BY vs.measured_at DESC), '[]'::jsonb)
      FROM public.vital_signs vs
      WHERE vs.patient_id IN (
          SELECT id FROM public.patients
          WHERE user_id = v_uid OR owner_user_id = v_uid
             OR (owner_user_id IS NULL AND primary_caregiver_id = v_uid)
          UNION
          SELECT patient_id FROM public.caregiver_patients WHERE caregiver_id = v_uid
        )
    ),
    'wellness_notes', (
      SELECT coalesce(jsonb_agg(to_jsonb(wn) ORDER BY wn.occurred_at DESC), '[]'::jsonb)
      FROM public.wellness_notes wn
      WHERE wn.patient_id IN (
          SELECT id FROM public.patients
          WHERE user_id = v_uid OR owner_user_id = v_uid
             OR (owner_user_id IS NULL AND primary_caregiver_id = v_uid)
          UNION
          SELECT patient_id FROM public.caregiver_patients WHERE caregiver_id = v_uid
        )
    ),
    'adherence_monthly', (
      SELECT coalesce(jsonb_agg(to_jsonb(am) ORDER BY am.year DESC, am.month DESC), '[]'::jsonb)
      FROM public.adherence_monthly am
      WHERE am.patient_id IN (
          SELECT id FROM public.patients
          WHERE user_id = v_uid OR owner_user_id = v_uid
             OR (owner_user_id IS NULL AND primary_caregiver_id = v_uid)
          UNION
          SELECT patient_id FROM public.caregiver_patients WHERE caregiver_id = v_uid
        )
    ),
    'audit_log_own_actions', (
      -- Solo le azioni compiute dall'utente stesso (non espone dati di terzi)
      SELECT coalesce(jsonb_agg(to_jsonb(al) ORDER BY al.created_at DESC), '[]'::jsonb)
      FROM public.audit_log al
      WHERE al.actor_id = v_uid
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

ALTER FUNCTION "public"."export_my_data"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."export_my_data"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."export_my_data"() TO "authenticated";

COMMENT ON FUNCTION "public"."export_my_data"() IS 'GDPR Data Portability (art. 20): restituisce tutti i dati personali e sanitari dell''utente autenticato in formato JSON (profilo, pazienti, terapie, eventi, profili medici, parametri vitali, note di benessere, aderenza mensile, notifiche, consensi, log delle proprie azioni).';
