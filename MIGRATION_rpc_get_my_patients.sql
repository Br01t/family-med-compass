-- =====================================================================
--  MIGRATION_rpc_get_my_patients.sql
--  RPC ottimizzate per ridurre le chiamate al database.
--
--  Problema attuale:
--    - fetchPatientsOnce:   2 query separate (caregiver_patients + patients)
--    - fetchCaregiversOnce: 2 query separate (caregiver_patients + caregivers)
--
--  Con queste RPC: 1 sola query per ciascuna funzione (JOIN interno).
--  Risparmio: -50% di chiamate DB per il mount iniziale dell'app.
--
--  Esegui INTERAMENTE nel Supabase SQL Editor.
--  È idempotente.
-- =====================================================================

-- -------------------------------------------------------------------
-- 1. get_my_patients() — restituisce i pazienti visibili all'utente
--    (basato sul ruolo: caregiver o paziente).
--    Un singolo JOIN al posto di 2 query sequenziali.
-- -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_patients()
RETURNS TABLE (
  id                   text,
  name                 text,
  birth_year           int,
  photo                text,
  user_id              uuid,
  owner_user_id        uuid,
  primary_caregiver_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_role app_role;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non autenticato' USING ERRCODE = '42501';
  END IF;

  -- Determina il ruolo dell'utente
  SELECT role INTO v_role
  FROM public.user_roles
  WHERE user_id = v_uid
  LIMIT 1;

  IF v_role = 'caregiver' THEN
    -- Caregiver: vede i pazienti a cui è collegato tramite caregiver_patients
    RETURN QUERY
      SELECT p.id, p.name, p.birth_year, p.photo, p.user_id, p.owner_user_id, p.primary_caregiver_id
      FROM public.patients p
      INNER JOIN public.caregiver_patients cp ON cp.patient_id = p.id
      WHERE cp.caregiver_id = v_uid;
  ELSE
    -- Paziente: vede solo se stesso
    RETURN QUERY
      SELECT p.id, p.name, p.birth_year, p.photo, p.user_id, p.owner_user_id, p.primary_caregiver_id
      FROM public.patients p
      WHERE p.user_id = v_uid;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_patients() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_patients() TO authenticated;

COMMENT ON FUNCTION public.get_my_patients() IS
  'Restituisce i pazienti visibili all''utente autenticato in base al ruolo. '
  'Per i caregiver: tutti i pazienti collegati. Per i pazienti: solo se stessi. '
  'Sostituisce 2 query sequenziali (caregiver_patients + patients) con 1 sola chiamata.';

-- -------------------------------------------------------------------
-- 2. get_my_caregivers() — restituisce i caregiver visibili all'utente
--    (usato dal paziente per vedere chi lo segue, o dal caregiver
--    per vedere se stesso).
-- -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_caregivers()
RETURNS TABLE (
  id       uuid,
  name     text,
  relation text,
  photo    text,
  notify   jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_role app_role;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non autenticato' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_role
  FROM public.user_roles
  WHERE user_id = v_uid
  LIMIT 1;

  IF v_role = 'paziente' THEN
    -- Paziente: vede i caregiver collegati tramite caregiver_patients del suo patient record
    RETURN QUERY
      SELECT c.id, c.name, c.relation, c.photo, c.notify
      FROM public.caregivers c
      INNER JOIN public.caregiver_patients cp ON cp.caregiver_id = c.id
      INNER JOIN public.patients p ON p.id = cp.patient_id
      WHERE p.user_id = v_uid;
  ELSE
    -- Caregiver: vede solo se stesso
    RETURN QUERY
      SELECT c.id, c.name, c.relation, c.photo, c.notify
      FROM public.caregivers c
      WHERE c.id = v_uid;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_caregivers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_caregivers() TO authenticated;

COMMENT ON FUNCTION public.get_my_caregivers() IS
  'Restituisce i caregiver visibili all''utente autenticato in base al ruolo. '
  'Per i pazienti: tutti i caregiver collegati. Per i caregiver: solo se stessi. '
  'Sostituisce 2 query sequenziali (caregiver_patients + caregivers) con 1 sola chiamata.';

-- -------------------------------------------------------------------
-- 3. Indice aggiuntivo per ottimizzare get_my_patients (caregiver)
--    Se già esiste non fa nulla.
-- -------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS cp_caregiver_idx
  ON public.caregiver_patients (caregiver_id);

-- -------------------------------------------------------------------
-- Verifica
-- -------------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE 'MIGRATION_rpc_get_my_patients.sql completata con successo.';
  RAISE NOTICE 'Test: SELECT * FROM public.get_my_patients(); -- eseguire da utente autenticato';
  RAISE NOTICE 'Test: SELECT * FROM public.get_my_caregivers(); -- eseguire da utente autenticato';
END $$;
