-- FamilyMed — hardening preventivo di get_my_caregivers()
--
-- Stessa classe di bug appena risolta in get_my_patients() (42702 "column
-- reference ambiguous"): è una funzione PL/pgSQL con RETURNS TABLE(id uuid,
-- ...) — "id" è tra i nomi di colonna più comuni del database (caregivers.id,
-- patients.id, ecc.), quindi è il candidato più a rischio per lo stesso
-- problema. Sul dump risulta già qualificata (c.id, cp.caregiver_id, ecc.),
-- ma lo era anche get_my_patients() eppure falliva dal vivo — quindi
-- "sembra corretta" non è una garanzia sufficiente. La irrobustisco con la
-- stessa tecnica (alias interni diversi dai nomi di output) invece di
-- aspettare che fallisca in produzione come l'altra.
--
-- Nessun cambiamento di comportamento: stessa logica (paziente vede i
-- caregiver collegati; caregiver vede solo il proprio profilo), stesso
-- errore esplicito se non autenticato.

CREATE OR REPLACE FUNCTION public.get_my_caregivers()
RETURNS TABLE(
  id uuid,
  name text,
  relation text,
  photo text,
  notify jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_role public.app_role;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non autenticato' USING ERRCODE = '42501';
  END IF;

  SELECT ur.role INTO v_role
  FROM public.user_roles ur
  WHERE ur.user_id = v_uid
  LIMIT 1;

  IF v_role = 'paziente' THEN
    RETURN QUERY
      SELECT row_data.out_id, row_data.out_name, row_data.out_relation,
             row_data.out_photo, row_data.out_notify
      FROM (
        SELECT
          c.id       AS out_id,
          c.name     AS out_name,
          c.relation AS out_relation,
          c.photo    AS out_photo,
          c.notify   AS out_notify
        FROM public.caregivers c
        INNER JOIN public.caregiver_patients cp ON cp.caregiver_id = c.id
        INNER JOIN public.patients p ON p.id = cp.patient_id
        WHERE p.user_id = v_uid
      ) AS row_data;
  ELSE
    RETURN QUERY
      SELECT row_data.out_id, row_data.out_name, row_data.out_relation,
             row_data.out_photo, row_data.out_notify
      FROM (
        SELECT
          c.id       AS out_id,
          c.name     AS out_name,
          c.relation AS out_relation,
          c.photo    AS out_photo,
          c.notify   AS out_notify
        FROM public.caregivers c
        WHERE c.id = v_uid
      ) AS row_data;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.get_my_caregivers() IS
  'Restituisce i caregiver visibili all''utente autenticato (paziente: caregiver collegati; caregiver: solo il proprio profilo). Alias interni diversi dai nomi di output (out_id vs id, ecc.) per rendere strutturalmente impossibile la stessa classe di bug 42702 già riscontrata in get_my_patients().';