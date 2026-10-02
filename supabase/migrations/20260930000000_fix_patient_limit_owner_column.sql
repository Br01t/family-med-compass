-- ============================================================================
-- FIX CRITICO — check_patient_limit() non applicava mai il limite pazienti
-- nel caso d'uso più comune dell'app
--
-- BUG 1 (severità: alta — bypass del limite piano):
-- La funzione controllava NEW.user_id e usciva subito se NULL:
--
--   IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
--
-- Ma quando un caregiver aggiunge un paziente a proprio carico (il caso
-- normale: un genitore anziano senza account proprio), l'app imposta
-- SOLO owner_user_id e lascia volutamente user_id a NULL — vedi
-- src/lib/store.tsx, addPatient(): "NON tocchiamo userId: quello è
-- l'eventuale account auth del paziente".
--
-- Risultato: per ogni paziente creato nel flusso normale, il trigger
-- restituiva subito NEW senza controllare nulla. L'unico limite rimasto
-- era il controllo lato client in AddPatientDialog.tsx (isLimitReached),
-- aggirabile da chiunque chiami la Data API direttamente con il proprio
-- JWT. Un utente sul piano Free (limite 1 paziente) o Pro (limite 2)
-- poteva quindi aggiungere pazienti illimitati.
--
-- La stessa identica confusione tra user_id/owner_user_id era già stata
-- corretta in check_caregiver_invite_limit() dalla migration
-- 20260915083535 (FIX 3), ma non era mai stata applicata qui. Anche
-- get_patient_owner_plan() (usata dal limite terapie) fa già
-- COALESCE(user_id, owner_user_id) correttamente: check_patient_limit()
-- era rimasta l'unica non allineata.
--
-- BUG 2 (severità: media — falso blocco dopo un downgrade):
-- Il conteggio dei pazienti esistenti non escludeva quelli sospesi da un
-- downgrade (perform_downgrade() imposta patients.suspended_at, non li
-- cancella). Un utente che aveva scelto quale paziente tenere attivo dopo
-- un downgrade Pro -> Free restava bloccato dal trigger nell'aggiungerne
-- uno nuovo, perché il paziente sospeso veniva comunque contato.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_patient_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner uuid;
  v_plan text;
  v_current_count int;
  v_max_allowed int;
BEGIN
  v_owner := COALESCE(NEW.user_id, NEW.owner_user_id);

  IF v_owner IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(subscription_plan, 'free') INTO v_plan
  FROM public.profiles WHERE id = v_owner;

  SELECT COUNT(*) INTO v_current_count
  FROM public.patients
  WHERE COALESCE(user_id, owner_user_id) = v_owner
    AND suspended_at IS NULL;

  v_max_allowed := CASE v_plan
    WHEN 'max' THEN 10
    WHEN 'pro' THEN 2
    ELSE 1
  END;

  IF v_current_count >= v_max_allowed THEN
    RAISE EXCEPTION 'Limite pazienti raggiunto per il piano % (Max: %). Passa a Pro o Max.', v_plan, v_max_allowed;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.check_patient_limit() OWNER TO postgres;

-- ----------------------------------------------------------------------------
-- Non ricalcola/ritocca i pazienti già esistenti: se qualcuno ha già
-- superato il proprio limite di piano a causa del bug, questa migration non
-- rimuove né sospende nulla in automatico. Verifica manualmente con:
--
--   SELECT owner_user_id, count(*) AS pazienti_attivi
--   FROM public.patients
--   WHERE suspended_at IS NULL
--   GROUP BY owner_user_id
--   HAVING count(*) > 1;   -- confronta col piano reale di ogni owner_user_id
--
-- e decidi caso per caso (contattare l'utente, offrire l'upgrade, o
-- sospendere manualmente i pazienti in eccesso con perform_downgrade()).
-- ----------------------------------------------------------------------------