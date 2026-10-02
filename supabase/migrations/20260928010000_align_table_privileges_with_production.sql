-- ============================================================================
-- Allinea i privilegi di tabella dello schema versionato a quelli di produzione
--
-- `supabase db diff --linked` mostrava che il database remoto ha MENO privilegi
-- di quelli che si ottengono ricostruendo il DB dalle migration:
--   * `anon` non ha alcun privilegio su nessuna tabella dell'app;
--   * `authenticated` ha solo i privilegi che servono (mai references, trigger,
--     truncate), e per alcune tabelle solo un sottoinsieme di CRUD.
-- Una replica da zero (nuovo progetto, preview branch, `supabase db reset`)
-- ereditava invece i privilegi di default (ALL), piu' larghi di produzione.
-- Le policy RLS bloccano comunque le righe, ma qui si chiude anche il livello
-- dei privilegi, cosi' ambiente locale e produzione coincidono.
--
-- In produzione questa migration e' una NO-OP: REVOKE di un privilegio non
-- posseduto non da' errore e non cambia nulla. Sono elencate solo le 16 tabelle
-- dell'app (niente REVOKE su "ALL TABLES", per non toccare la materialized view
-- caregiver_dashboard_stats).
--
-- Privilegi finali di `authenticated`, per tabella:

--   adherence_monthly: SELECT
--   audit_log: SELECT
--   caregiver_patients: SELECT, UPDATE, DELETE
--   caregivers: SELECT, INSERT, UPDATE
--   events: SELECT, INSERT, UPDATE, DELETE
--   family_invites: SELECT, INSERT, UPDATE, DELETE
--   notifications: SELECT, UPDATE
--   patient_medical_profiles: SELECT, INSERT, UPDATE, DELETE
--   patients: SELECT, INSERT, UPDATE, DELETE
--   profiles: SELECT, INSERT, UPDATE
--   stock_movements: SELECT, INSERT
--   therapies: SELECT, INSERT, UPDATE, DELETE
--   user_consents: SELECT, INSERT
--   user_roles: SELECT, INSERT, UPDATE
--   vital_signs: SELECT, INSERT, UPDATE, DELETE
--   wellness_notes: SELECT, INSERT, UPDATE, DELETE
-- ============================================================================

-- anon: nessun accesso alle tabelle dell'app
REVOKE ALL ON TABLE public.adherence_monthly FROM anon;
REVOKE ALL ON TABLE public.audit_log FROM anon;
REVOKE ALL ON TABLE public.caregiver_patients FROM anon;
REVOKE ALL ON TABLE public.caregivers FROM anon;
REVOKE ALL ON TABLE public.events FROM anon;
REVOKE ALL ON TABLE public.family_invites FROM anon;
REVOKE ALL ON TABLE public.notifications FROM anon;
REVOKE ALL ON TABLE public.patient_medical_profiles FROM anon;
REVOKE ALL ON TABLE public.patients FROM anon;
REVOKE ALL ON TABLE public.profiles FROM anon;
REVOKE ALL ON TABLE public.stock_movements FROM anon;
REVOKE ALL ON TABLE public.therapies FROM anon;
REVOKE ALL ON TABLE public.user_consents FROM anon;
REVOKE ALL ON TABLE public.user_roles FROM anon;
REVOKE ALL ON TABLE public.vital_signs FROM anon;
REVOKE ALL ON TABLE public.wellness_notes FROM anon;

-- authenticated: rimuove i privilegi in eccesso rispetto a quelli necessari
REVOKE DELETE, INSERT, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON TABLE public.adherence_monthly FROM authenticated;
REVOKE DELETE, INSERT, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON TABLE public.audit_log FROM authenticated;
REVOKE INSERT, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.caregiver_patients FROM authenticated;
REVOKE DELETE, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.caregivers FROM authenticated;
REVOKE REFERENCES, TRIGGER, TRUNCATE ON TABLE public.events FROM authenticated;
REVOKE REFERENCES, TRIGGER, TRUNCATE ON TABLE public.family_invites FROM authenticated;
REVOKE DELETE, INSERT, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.notifications FROM authenticated;
REVOKE REFERENCES, TRIGGER, TRUNCATE ON TABLE public.patient_medical_profiles FROM authenticated;
REVOKE REFERENCES, TRIGGER, TRUNCATE ON TABLE public.patients FROM authenticated;
REVOKE DELETE, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.profiles FROM authenticated;
REVOKE DELETE, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON TABLE public.stock_movements FROM authenticated;
REVOKE REFERENCES, TRIGGER, TRUNCATE ON TABLE public.therapies FROM authenticated;
REVOKE DELETE, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_consents FROM authenticated;
REVOKE DELETE, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.user_roles FROM authenticated;
REVOKE REFERENCES, TRIGGER, TRUNCATE ON TABLE public.vital_signs FROM authenticated;
REVOKE REFERENCES, TRIGGER, TRUNCATE ON TABLE public.wellness_notes FROM authenticated;