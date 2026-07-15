-- Fix: i caregiver collegati a un paziente (primario o secondari) devono
-- poter vedere TUTTE le righe di caregiver_patients per quel paziente, non
-- solo la propria. Finora "cp: read own" limitava la lettura alla riga del
-- chiamante (o al paziente stesso via owns_patient), quindi la UI mostrava
-- solo il caregiver primario e mai i secondari.
--
-- Usa is_caregiver_of() (SECURITY DEFINER, già esistente) invece di un
-- self-join diretto su caregiver_patients per evitare ricorsione RLS.

CREATE POLICY "cp: family peers read" ON public.caregiver_patients
  FOR SELECT TO authenticated
  USING (
    caregiver_id = auth.uid()
    OR public.owns_patient(patient_id)
    OR public.is_caregiver_of(patient_id)
  );