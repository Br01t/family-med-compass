-- ============================================================
-- Blocca la scrittura dei campi di abbonamento dal client.
--
-- Prima: GRANT UPDATE/INSERT su TUTTE le colonne di profiles + policy
-- "self update" => qualunque utente autenticato poteva fare
--   update profiles set subscription_plan_own = 'max'
-- e ottenere tutti i limiti Max senza pagare.
--
-- Ora: il client può modificare solo i campi anagrafici. Il piano si cambia
--  - in DOWNGRADE: tramite perform_downgrade (SECURITY DEFINER, già esistente)
--  - in UPGRADE: solo lato server (service_role), es. webhook del provider di pagamento.
--
-- ATTENZIONE: src/lib/store.tsx (updateSubscriptionPlan) scrive oggi
-- subscription_plan_own dal client: dopo questa migration l'upgrade dall'app
-- fallirà finché non esiste un flusso server-side di pagamento.
-- ============================================================

REVOKE INSERT, UPDATE ON TABLE public.profiles FROM authenticated;
REVOKE INSERT, UPDATE ON TABLE public.profiles FROM anon;

GRANT INSERT (id, email, name, role, avatar_url, created_at) ON TABLE public.profiles TO authenticated;
GRANT UPDATE (id, email, name, role, avatar_url, created_at) ON TABLE public.profiles TO authenticated;