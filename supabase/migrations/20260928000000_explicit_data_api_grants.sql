-- ============================================================================
-- Grant espliciti per la Data API (PostgREST / supabase-js)
--
-- Dal 30 ottobre 2026 Supabase non concede più automaticamente l'accesso Data
-- API alle nuove tabelle dello schema public: ogni tabella creata da una
-- migration (nuovo progetto, preview branch, `supabase db reset`) ha bisogno
-- di GRANT espliciti, altrimenti l'API risponde "permission denied".
--
-- Le tabelle già esistenti in produzione NON cambiano. Questa migration
-- colma due buchi trovati nello schema versionato: senza di essa un ambiente
-- ricostruito da zero avrebbe una scheda clinica non raggiungibile.
--
-- GRANT è idempotente: rieseguirla dove i permessi esistono già non fa danni.
-- Le policy RLS restano la barriera di sicurezza vera; qui si concede solo il
-- privilegio di base, coerente con le policy già definite.
-- Nessun grant ad `anon`: l'app è interamente dietro login.
-- ============================================================================

-- patient_medical_profiles: usata dal client (supabase-service.ts) con
-- select / upsert (insert+update) / delete, e le policy RLS esistono per tutte
-- e quattro le operazioni -> ma nessun GRANT era presente nelle migration.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.patient_medical_profiles TO authenticated;
GRANT ALL ON TABLE public.patient_medical_profiles TO service_role;

-- adherence_monthly: aveva solo SELECT per `authenticated`; manca service_role
-- (tutte le altre tabelle ce l'hanno). Nessuna scrittura per authenticated:
-- la popola solo il rollup lato server.
GRANT ALL ON TABLE public.adherence_monthly TO service_role;

-- ----------------------------------------------------------------------------
-- REGOLA PER LE MIGRATION FUTURE: ogni CREATE TABLE in public deve essere
-- seguito, nella stessa migration, da:
--
--   GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.<tabella> TO authenticated;
--   GRANT ALL ON TABLE public.<tabella> TO service_role;
--
-- (limitando i privilegi di `authenticated` a quelli che le policy RLS
-- consentono davvero). Non concedere nulla ad `anon` salvo tabelle pubbliche.
-- ----------------------------------------------------------------------------