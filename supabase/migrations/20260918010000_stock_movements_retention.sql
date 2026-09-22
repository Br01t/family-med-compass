-- FamilyMed — aggiunge la retention mancante su stock_movements.
--
-- È l'unica delle 16 tabelle applicative SENZA alcuna pulizia automatica
-- (verificato confrontando tutti i cron.schedule esistenti in
-- 20260911165516_initial_schema.sql). È un ledger append-only — nessuno,
-- nemmeno il caregiver primario, può aggiornarlo o cancellarlo via RLS — e
-- oggi viene svuotato solo manualmente (reset cronologia paziente) o alla
-- cancellazione dell'account. Con l'uso normale (ogni dose presa/rifornita
-- genera una riga) è la tabella con la crescita più costante e meno
-- limitata nel tempo: sul piano free, con un limite di 500 MB per l'intero
-- database, è il candidato più concreto a esaurire spazio con "molti
-- clienti" nel tempo.
--
-- Retention scelta: 24 mesi, stessa finestra già usata per wellness_notes
-- (coerente con "trend/storico ragionevole per un medico o per l'utente",
-- oltre il quale il dettaglio riga-per-riga non serve più).

SELECT cron.schedule(
  'stock-movements-cleanup-daily',
  '50 3 * * *',
  $$DELETE FROM public.stock_movements WHERE created_at < now() - interval '24 months';$$
);

-- =============================================================
-- Verifica dopo l'applicazione:
--   select jobname, schedule from cron.job where jobname = 'stock-movements-cleanup-daily';
-- Aggiornare anche compliance/retention-policy.md con questa riga (vedi
-- report allegato) per tenere la tabella di conformità coerente con il DB.
-- =============================================================