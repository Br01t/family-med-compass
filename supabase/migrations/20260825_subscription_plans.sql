-- =====================================================================
--  MIGRATION_subscription_plans.sql
--  Gestione Piani di Abbonamento (Free, Pro, Max) ed Enforcement Limiti DB
-- =====================================================================

-- 1. Aggiungi colonne per il piano di abbonamento in public.profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS subscription_plan text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'active';

-- Assicura l'indice per query veloci di verifica
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_plan ON public.profiles (id, subscription_plan);

-- 2. FUNZIONE TRIPPLE CHECK PATIENTS LIMIT (BEFORE INSERT ON public.patients)
CREATE OR REPLACE FUNCTION public.check_patient_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan text;
  v_current_count int;
  v_max_allowed int;
BEGIN
  -- Se il paziente non ha user_id (caso speciale), ignora
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Ottieni il piano dell'utente
  SELECT COALESCE(subscription_plan, 'free') INTO v_plan
  FROM public.profiles
  WHERE id = NEW.user_id;

  -- Calcola quanti pazienti l'utente gestisce già come creatore/titolare
  SELECT COUNT(*) INTO v_current_count
  FROM public.patients
  WHERE user_id = NEW.user_id;

  v_max_allowed := CASE v_plan
    WHEN 'max' THEN 10
    WHEN 'pro' THEN 2
    ELSE 1 -- 'free'
  END;

  IF v_current_count >= v_max_allowed THEN
    RAISE EXCEPTION 'Limite pazienti raggiunto per il piano % (Max: %). Passa ad un piano superiore per aggiungere altri pazienti.', v_plan, v_max_allowed;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_check_patient_limit ON public.patients;
CREATE TRIGGER trigger_check_patient_limit
  BEFORE INSERT ON public.patients
  FOR EACH ROW
  EXECUTE FUNCTION public.check_patient_limit();


-- 3. FUNZIONE CHECK CAREGIVER INVITE LIMIT (BEFORE INSERT ON public.caregiver_patients)
CREATE OR REPLACE FUNCTION public.check_caregiver_invite_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
  v_plan text;
  v_current_count int;
  v_max_allowed int;
BEGIN
  -- Trova il proprietario/titolare del paziente
  SELECT user_id INTO v_owner_id
  FROM public.patients
  WHERE id = NEW.patient_id;

  IF v_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Se si sta inserendo il titolare stesso, salta la verifica
  IF NEW.caregiver_id = v_owner_id THEN
    RETURN NEW;
  END IF;

  -- Ottieni il piano del titolare del paziente
  SELECT COALESCE(subscription_plan, 'free') INTO v_plan
  FROM public.profiles
  WHERE id = v_owner_id;

  -- Calcola il totale attuale di caregiver per questo paziente
  SELECT COUNT(*) INTO v_current_count
  FROM public.caregiver_patients
  WHERE patient_id = NEW.patient_id;

  v_max_allowed := CASE v_plan
    WHEN 'max' THEN 10
    WHEN 'pro' THEN 5
    ELSE 1 -- 'free': solo il titolare (max 1)
  END;

  IF v_current_count >= v_max_allowed THEN
    RAISE EXCEPTION 'Limite caregiver per questo paziente raggiunto per il piano % (Max % persone). Passa a Pro o Max per collaborare con altre persone.', v_plan, v_max_allowed;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_check_caregiver_invite_limit ON public.caregiver_patients;
CREATE TRIGGER trigger_check_caregiver_invite_limit
  BEFORE INSERT ON public.caregiver_patients
  FOR EACH ROW
  EXECUTE FUNCTION public.check_caregiver_invite_limit();


-- 4. FUNZIONE CHECK THERAPY LIMIT (BEFORE INSERT ON public.therapies)
CREATE OR REPLACE FUNCTION public.check_therapy_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
  v_plan text;
  v_active_count int;
BEGIN
  -- Non bloccare la disattivazione/modifica di terapie esistenti se non si stanno attivando
  IF TG_OP = 'UPDATE' AND (NEW.active = false OR OLD.active = NEW.active) THEN
    RETURN NEW;
  END IF;

  -- Trova il titolare del paziente
  SELECT user_id INTO v_owner_id
  FROM public.patients
  WHERE id = NEW.patient_id;

  IF v_owner_id IS NULL THEN
    -- Fallback: trova l'utente creatore
    v_owner_id := auth.uid();
  END IF;

  IF v_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Ottieni il piano di abbonamento
  SELECT COALESCE(subscription_plan, 'free') INTO v_plan
  FROM public.profiles
  WHERE id = v_owner_id;

  -- Se è Pro o Max, non c'è limite
  IF v_plan IN ('pro', 'max') THEN
    RETURN NEW;
  END IF;

  -- Se è Free (o non specificato), massimo 3 terapie attive per paziente
  SELECT COUNT(*) INTO v_active_count
  FROM public.therapies
  WHERE patient_id = NEW.patient_id AND active = true;

  IF v_active_count >= 3 THEN
    RAISE EXCEPTION 'Limite di 3 terapie attive raggiunto per il piano Free. Passa a Pro o Max per terapie illimitate.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_check_therapy_limit ON public.therapies;
CREATE TRIGGER trigger_check_therapy_limit
  BEFORE INSERT OR UPDATE ON public.therapies
  FOR EACH ROW
  EXECUTE FUNCTION public.check_therapy_limit();
