-- FamilyMed — fix per l'errore 42702 "column reference user_id is ambiguous"
-- sulla RPC get_my_patients(), riscontrato in produzione dai caregiver al
-- login ("Non riusciamo a caricare i tuoi dati").
--
-- DIAGNOSI
-- --------
-- Il commento sulla funzione live dichiara "Riscritta in SQL puro per
-- evitare ambiguità 42702 su user_id in PL/pgSQL", ma il corpo è ancora
-- `LANGUAGE plpgsql`: la riscrittura promessa non risulta applicata. In
-- PL/pgSQL, quando `RETURNS TABLE(..., "user_id" uuid, ...)` dichiara una
-- colonna di output chiamata `user_id`, quel nome diventa anche una
-- variabile implicita visibile in tutto il corpo della funzione: qualunque
-- riferimento a `user_id` che il planner non riesce a legare in modo
-- univoco a `patients.user_id` (es. per come viene espansa una `SELECT p.*`
-- o un cambiamento minimo di query rispetto alla versione qui nel repo)
-- genera esattamente il 42702 osservato. La query nel dump risulta già
-- qualificata (`p.user_id`), quindi la versione DAVVERO live in produzione
-- è probabilmente un'altra revisione, non allineata a questo file.
--
-- La riscrivo con una tecnica che elimina STRUTTURALMENTE la possibilità di
-- questa ambiguità (non basta "controllare di aver qualificato tutto": lo
-- era già anche nella versione nel dump, eppure l'errore si verifica in
-- produzione — segno che la versione davvero deployata è diversa da questa,
-- o che un dettaglio del planning query genera comunque la collisione).
-- La query interna usa alias di colonna DIVERSI dai nomi delle colonne di
-- output (RETURNS TABLE): così nessuna riga di codice, in nessun punto,
-- contiene mai una stringa che possa essere interpretata sia come colonna
-- sia come parametro OUT — la classe di bug 42702 diventa impossibile a
-- prescindere da come Postgres pianifica la query.
-- Mantengo LANGUAGE plpgsql (non "SQL puro" come promette il commento
-- precedente, mai realmente applicato) apposta per preservare l'eccezione
-- esplicita "Non autenticato": il client (fetchPatientsOnce in
-- supabase-service.ts) si aspetta un ERRORE se la sessione non è valida,
-- non un array vuoto silenzioso — altrimenti un token scaduto a metà
-- sessione cancellerebbe dalla UI i pazienti già mostrati in cache.

CREATE OR REPLACE FUNCTION public.get_my_patients()
RETURNS TABLE(
  id text,
  name text,
  birth_year integer,
  photo text,
  user_id uuid,
  owner_user_id uuid,
  primary_caregiver_id uuid
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
      row_data.out_primary_caregiver_id
    FROM (
      SELECT
        p.id                    AS out_id,
        p.name                  AS out_name,
        p.birth_year            AS out_birth_year,
        p.photo                 AS out_photo,
        p.user_id               AS out_user_id,
        p.owner_user_id         AS out_owner_user_id,
        p.primary_caregiver_id  AS out_primary_caregiver_id
      FROM public.patients p
      WHERE p.user_id = v_uid
         OR p.owner_user_id = v_uid
         OR public.is_caregiver_of(p.id)
    ) AS row_data;
END;
$$;

COMMENT ON FUNCTION public.get_my_patients() IS
  'Restituisce i pazienti visibili all''utente autenticato: stesso criterio della policy RLS "patients: silo read" (user_id, owner_user_id, o caregiver collegato). La query interna usa alias diversi dai nomi di output (out_user_id vs user_id, ecc.) apposta per rendere strutturalmente impossibile la ricorrenza del bug 42702 "column reference ambiguous" legato ai parametri OUT di RETURNS TABLE in PL/pgSQL.';

-- =============================================================
-- Verifica dopo l'applicazione:
--   1. Login come caregiver primario di un paziente -> get_my_patients()
--      deve restituire quel paziente, senza errore 42702.
--   2. Login come caregiver secondario collegato via caregiver_patients
--      -> deve vedere il paziente anche se owner_user_id è di qualcun altro.
--   3. Login come paziente con account proprio (patients.user_id = auth.uid())
--      -> deve vedersi da solo.
--   4. Login come utente senza alcun paziente collegato -> lista vuota,
--      nessun errore.
-- =============================================================