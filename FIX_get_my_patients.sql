-- =====================================================================
--  FIX: get_my_patients() — risolve errore 42702 "column reference user_id is ambiguous"
--
--  Causa: nel RETURNS TABLE è dichiarata una colonna "user_id" e nella
--  SELECT interna si usa "p.user_id" — PostgreSQL non riesce a disambiguare.
--
--  Fix: usiamo alias OUT per le colonne del RETURNS TABLE (out_user_id, ecc.)
--  e nelle SELECT usiamo sempre p. prefix.
--
--  ESEGUI NEL SQL EDITOR DI SUPABASE.
-- =====================================================================

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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.name,
    p.birth_year,
    p.photo,
    p.user_id,
    p.owner_user_id,
    p.primary_caregiver_id
  FROM public.patients p
  WHERE
    -- Il chiamante è caregiver collegato a questo paziente
    EXISTS (
      SELECT 1
      FROM public.caregiver_patients cp
      WHERE cp.patient_id = p.id
        AND cp.caregiver_id = auth.uid()
    )
    OR
    -- Il chiamante è il paziente stesso (user_id corrisponde)
    p.user_id = auth.uid()
    OR
    -- Il chiamante è il titolare (owner) del paziente
    p.owner_user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_patients() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_patients() TO authenticated;

COMMENT ON FUNCTION public.get_my_patients() IS
  'Restituisce i pazienti visibili all''utente autenticato. '
  'Riscritta in SQL puro per evitare ambiguità 42702 su user_id in PL/pgSQL. '
  'Visibili: pazienti dove auth.uid() è caregiver collegato, paziente stesso, o titolare.';
