-- =====================================================================
--  MIGRATION_family_group_rpc.sql
--  RPC unica per la pagina "Gruppo di cura" (/pazienti/:id/famiglia)
--
--  OBIETTIVO EGRESS:
--    Prima la pagina faceva 3 round-trip separati (caregiver_patients+
--    caregivers, family_invites, audit_log). Questa funzione li unisce
--    in UNA sola chiamata RPC, eseguita interamente lato DB.
--
--  SICUREZZA:
--    SECURITY DEFINER bypassa la RLS delle tabelle sottostanti, quindi
--    l'autorizzazione viene ricontrollata esplicitamente qui dentro,
--    replicando le stesse regole già presenti nelle policy RLS:
--      - membri: chiunque sia owner o caregiver collegato al paziente
--      - inviti: solo chi ha creato l'invito o è owner del paziente
--        (stessa restrizione della policy "invites: owner read" —
--        i caregiver secondari non vedono i codici invito)
--      - audit log: owner o caregiver collegato al paziente
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_family_group_data(
  _patient_id text,
  _audit_limit int DEFAULT 31
)
RETURNS TABLE (
  members   jsonb,
  invites   jsonb,
  audit_log jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_linked boolean;
BEGIN
  -- Guard di autorizzazione: replica "patients: silo read".
  SELECT EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = _patient_id
      AND (
        p.user_id = auth.uid()
        OR p.owner_user_id = auth.uid()
        OR public.is_caregiver_of(_patient_id)
      )
  ) INTO v_is_linked;

  IF NOT v_is_linked THEN
    RAISE EXCEPTION 'Non autorizzato a leggere il gruppo di cura di questo paziente'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    -- MEMBRI: stessa logica di listCaregiversForPatient
    (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'caregiver_id', cp.caregiver_id,
        'relationship', cp.relationship,
        'created_at',   cp.created_at,
        'name',         c.name,
        'relation',     c.relation,
        'photo',        c.photo
      )), '[]'::jsonb)
      FROM public.caregiver_patients cp
      LEFT JOIN public.caregivers c ON c.id = cp.caregiver_id
      WHERE cp.patient_id = _patient_id
    ) AS members,

    -- INVITI: solo se owner/creatore, come da RLS "invites: owner read"
    (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id',          fi.id,
        'code',        fi.code,
        'patient_id',  fi.patient_id,
        'created_by',  fi.created_by,
        'expires_at',  fi.expires_at,
        'max_uses',    fi.max_uses,
        'uses',        fi.uses,
        'used_by',     fi.used_by,
        'used_at',     fi.used_at,
        'created_at',  fi.created_at
      ) ORDER BY fi.created_at DESC), '[]'::jsonb)
      FROM public.family_invites fi
      WHERE fi.patient_id = _patient_id
        AND (
          fi.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.patients p
            WHERE p.id = fi.patient_id
              AND (p.user_id = auth.uid() OR p.owner_user_id = auth.uid())
          )
        )
    ) AS invites,

    -- AUDIT LOG: ultime _audit_limit righe, già filtrate per paziente
    (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id',          al.id,
        'patient_id',  al.patient_id,
        'actor_id',    al.actor_id,
        'actor_name',  al.actor_name,
        'action',      al.action,
        'entity_type', al.entity_type,
        'entity_id',   al.entity_id,
        'summary',     al.summary,
        'meta',        al.meta,
        'created_at',  al.created_at
      ) ORDER BY al.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT *
        FROM public.audit_log
        WHERE patient_id = _patient_id
        ORDER BY created_at DESC
        LIMIT _audit_limit
      ) al
    ) AS audit_log;
END;
$$;

REVOKE ALL ON FUNCTION public.get_family_group_data(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_family_group_data(text, int) TO authenticated;

COMMENT ON FUNCTION public.get_family_group_data(text, int) IS
  'Round-trip unico per la pagina Gruppo di cura: membri + inviti + audit log in una sola chiamata RPC. SECURITY DEFINER con autorizzazione replicata manualmente (vedi commenti).';