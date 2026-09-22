-- FamilyMed — fix di sicurezza/correttezza da security-audit-technical.md
-- Applicare con: supabase db push  (o incollare nel SQL editor della Dashboard)
-- Rivedere ogni blocco PRIMA di eseguirlo in produzione: sono derivati da
-- un'analisi statica dello schema, non testati contro il DB live.

-- =============================================================
-- FIX 1 (CRITICO) — audit_log espone a chiunque gli eventi GDPR
-- (export dati / cancellazione account) di ALTRI utenti quando
-- patient_id è NULL. Vedi report §3.1.
-- =============================================================
DROP POLICY IF EXISTS "audit: read linked" ON public.audit_log;
-- La policy "audit_log: read linked" resta e copre correttamente sia
-- "sono l'autore dell'evento" sia "sono owner/caregiver del paziente
-- a cui l'evento è associato". Non serve ricrearla.


-- =============================================================
-- FIX 2 (ALTO) — nessuna policy INSERT su caregiver_patients:
-- il collegamento caregiver→paziente creato in addPatientDoc()
-- (src/lib/supabase-service.ts) viene rifiutato dalla RLS.
-- Vedi report §3.2.
-- =============================================================
CREATE POLICY "cp: primary can self-insert" ON public.caregiver_patients
  FOR INSERT TO authenticated
  WITH CHECK (
    caregiver_id = auth.uid()
    AND public.is_primary_of(patient_id)
  );


-- =============================================================
-- FIX 3 (ALTO, funzionale) — check_caregiver_invite_limit() legge
-- una colonna "owner_id" che non esiste su patients (esistono
-- "user_id" e "owner_user_id"): il trigger fallisce ad ogni
-- redenzione di un codice invito. Vedi report §3.3.
-- Aggiunto anche SECURITY DEFINER + search_path, mancanti
-- nell'originale e incoerenti con le altre due funzioni "limit".
-- =============================================================
CREATE OR REPLACE FUNCTION public.check_caregiver_invite_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_plan text;
  v_current_count int;
  v_max_allowed int;
BEGIN
  SELECT COALESCE(pr.subscription_plan, 'free') INTO v_plan
  FROM public.patients p
  LEFT JOIN public.profiles pr
    ON pr.id = COALESCE(p.owner_user_id, p.user_id)
  WHERE p.id = NEW.patient_id;

  v_plan := COALESCE(v_plan, 'free');

  SELECT COUNT(*) INTO v_current_count
  FROM public.caregiver_patients
  WHERE patient_id = NEW.patient_id;

  v_max_allowed := CASE v_plan
    WHEN 'max' THEN 10
    WHEN 'pro' THEN 5
    ELSE 1
  END;

  IF v_current_count >= v_max_allowed THEN
    RAISE EXCEPTION 'Limite caregiver per questo paziente raggiunto per il piano % (Max % persone). Passa a Pro o Max per collaborare con altre persone.', v_plan, v_max_allowed;
  END IF;

  RETURN NEW;
END;
$$;

-- =============================================================
-- Dopo l'applicazione, testare manualmente:
--  1. Un utente B (senza relazione) NON deve più vedere righe in
--     audit_log appartenenti a un utente A via
--     `select * from audit_log` (solo le proprie / dei propri pazienti).
--  2. Un caregiver che crea un nuovo paziente da zero deve comparire
--     in caregiver_patients subito dopo la creazione (controllare che
--     "[addPatientDoc] Errore salvataggio relazioni" non compaia più
--     nei log applicativi).
--  3. Generare un codice invito e redimerlo con un secondo account:
--     redeem_family_invite() non deve più fallire con
--     "column owner_id does not exist".
-- =============================================================