-- ============================================================================
-- get_my_patients(): espone suspended_at
--
-- Il client (AddPatientDialog.tsx, isLimitReached) confronta il numero di
-- pazienti con il limite del piano per decidere se mostrare il pulsante
-- "Aggiungi paziente" come disabilitato. Senza suspended_at nell'output di
-- questa RPC, il client non ha modo di sapere quali pazienti sono stati
-- sospesi da un downgrade (perform_downgrade() li marca, non li cancella),
-- e li conta tutti come attivi: stesso bug corretto lato server nella
-- migration 20260930000000, qui lato client.
--
-- Mantiene l'alias out_* per restare coerente con la tecnica anti-42702
-- già usata in questa funzione (vedi 20260917000000).
-- ============================================================================

-- Postgres non permette di cambiare l'elenco delle colonne di output di una
-- funzione RETURNS TABLE con un semplice CREATE OR REPLACE (errore 42P13,
-- "cannot change return type of existing function"): va droppata prima.
-- Sicuro da droppare e ricreare nella stessa migration: nessuna finestra in
-- cui la funzione non esiste per un chiamante concorrente, perché Postgres
-- esegue l'intera migration in una singola transazione.
DROP FUNCTION IF EXISTS public.get_my_patients();

CREATE FUNCTION public.get_my_patients()
RETURNS TABLE(
  id text,
  name text,
  birth_year integer,
  photo text,
  user_id uuid,
  owner_user_id uuid,
  primary_caregiver_id uuid,
  suspended_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non autenticato' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT
      row_data.out_id,
      row_data.out_name,
      row_data.out_birth_year,
      row_data.out_photo,
      row_data.out_user_id,
      row_data.out_owner_user_id,
      row_data.out_primary_caregiver_id,
      row_data.out_suspended_at
    FROM (
      SELECT
        p.id                    AS out_id,
        p.name                  AS out_name,
        p.birth_year            AS out_birth_year,
        p.photo                 AS out_photo,
        p.user_id               AS out_user_id,
        p.owner_user_id         AS out_owner_user_id,
        p.primary_caregiver_id  AS out_primary_caregiver_id,
        p.suspended_at          AS out_suspended_at
      FROM public.patients p
      WHERE p.user_id = v_uid
         OR p.owner_user_id = v_uid
         OR public.is_caregiver_of(p.id)
    ) AS row_data;
END;
$$;

-- Ripristina ESATTAMENTE gli stessi permessi della funzione originale
-- (persi dal DROP FUNCTION sopra): solo authenticated può eseguirla.
ALTER FUNCTION public.get_my_patients() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_my_patients() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_patients() TO authenticated;

COMMENT ON FUNCTION public.get_my_patients() IS
  'Restituisce i pazienti visibili all''utente autenticato: stesso criterio della policy RLS "patients: silo read" (user_id, owner_user_id, o caregiver collegato). Include suspended_at così il client può escludere i pazienti sospesi da downgrade dal conteggio del limite piano. La query interna usa alias diversi dai nomi di output (out_user_id vs user_id, ecc.) apposta per rendere strutturalmente impossibile la ricorrenza del bug 42702 "column reference ambiguous" legato ai parametri OUT di RETURNS TABLE in PL/pgSQL.';