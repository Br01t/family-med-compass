-- ============================================================================
-- FIX — create_family_invite() non poteva creare nessun codice invito.
--
-- La funzione chiama gen_random_bytes() (estensione pgcrypto), ma pgcrypto è
-- installata nello schema "extensions" e la funzione ha search_path = 'public':
-- risultato "function gen_random_bytes(integer) does not exist" a ogni chiamata,
-- quindi era impossibile invitare un familiare/caregiver.
-- (Scoperto dal test 09_family_invites_lifecycle.)
--
-- Si aggiunge "extensions" al search_path (public resta per primo). Il corpo della
-- funzione non cambia. Funziona anche se pgcrypto fosse installata in "public".
-- ============================================================================
ALTER FUNCTION public.create_family_invite(text, integer, integer)
  SET search_path = public, extensions;

-- Stesso difetto nelle funzioni delle note cifrate (oggi non usate dall'app): erano
-- dichiarate con SET search_path TO 'public, extensions' scritto come UNA sola stringa,
-- che Postgres legge come un unico schema inesistente, quindi pgp_sym_encrypt/decrypt
-- non venivano trovate. Impostato correttamente come elenco di due schemi.
ALTER FUNCTION public.encrypt_therapy_note(text) SET search_path = public, extensions;
ALTER FUNCTION public.decrypt_therapy_note(text) SET search_path = public, extensions;