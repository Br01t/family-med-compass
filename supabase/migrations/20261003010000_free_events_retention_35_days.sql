-- ============================================================
-- Retention eventi per il piano Free: 30 -> 35 giorni.
--
-- Motivo: rollup_adherence_monthly() gira il giorno 2 di ogni mese e calcola il mese
-- precedente leggendo da `events`. Con 30 giorni di retention, i primi 1-2 giorni di
-- ogni mese erano già cancellati per gli utenti Free, e l'aderenza mensile salvata
-- risultava incompleta. 35 giorni coprono sempre l'intero mese precedente.
-- cron.schedule() con lo stesso nome aggiorna il job esistente.
-- ============================================================

SELECT cron.schedule(
  'free-events-cleanup-daily',
  '16 3 * * *',
  $$
    DELETE FROM public.events
    WHERE scheduled_at < now() - interval '35 days'
      AND public.get_patient_owner_plan(patient_id) = 'free';
  $$
);
