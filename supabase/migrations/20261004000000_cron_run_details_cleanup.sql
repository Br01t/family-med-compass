-- ============================================================
-- Pulizia dello storico di pg_cron (cron.job_run_details).
--
-- Problema: pg_cron registra OGNI esecuzione in cron.job_run_details e non la
-- cancella mai da solo. Lo scheduler delle dosi gira ogni minuto (1.440 righe al
-- giorno, circa 43.000 al mese): è una tabella che cresce all'infinito anche con
-- zero utenti, e occupa i 500 MB del piano Free.
--
-- Fix: cancella le esecuzioni più vecchie di 3 giorni (ora e ogni giorno alle 03:10).
-- Tre giorni bastano per diagnosticare un job fallito.
-- ============================================================

DELETE FROM cron.job_run_details WHERE end_time < now() - interval '3 days';

SELECT cron.schedule(
  'cron-run-details-cleanup-daily',
  '10 3 * * *',
  $$ DELETE FROM cron.job_run_details WHERE end_time < now() - interval '3 days'; $$
);