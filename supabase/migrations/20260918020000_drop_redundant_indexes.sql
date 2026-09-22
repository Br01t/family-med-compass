-- FamilyMed — rimozione indici duplicati/ridondanti.
--
-- Ogni indice duplicato: occupa spazio (conta nel limite di 500 MB del
-- piano free) E rallenta ogni INSERT/UPDATE/DELETE sulla tabella (Postgres
-- deve aggiornare TUTTI gli indici a ogni scrittura, non solo uno). Nessuno
-- di questi DROP riduce le prestazioni in lettura: in ogni caso resta un
-- indice equivalente (o migliore) a coprire le stesse query.
--
-- Trovati confrontando la definizione esatta di ogni indice in
-- supabase/schema_backup.sql (probabile causa: la migrazione di
-- ottimizzazione dello scheduler ha ricreato alcuni indici già esistenti
-- dalla migrazione iniziale, senza controllare se c'erano già).

-- 1. caregiver_patients(caregiver_id): due indici IDENTICI.
DROP INDEX IF EXISTS public.cp_caregiver_idx;
-- resta: idx_caregiver_patients_caregiver

-- 2. therapies(patient_id): due indici IDENTICI.
DROP INDEX IF EXISTS public.therapies_patient_idx;
-- resta: idx_therapies_patient

-- 3. notifications(target_user_id, created_at DESC): due indici IDENTICI.
DROP INDEX IF EXISTS public.notifications_target_created_idx;
-- resta: idx_notifications_target_created

-- 4. notifications(target_user_id, dose_key) WHERE dose_key IS NOT NULL:
--    due indici UNIQUE IDENTICI — il caso più costoso, perché un indice
--    UNIQUE controlla il vincolo a ogni scrittura, quindi la duplicazione
--    raddoppia anche quel controllo, non solo lo spazio occupato.
DROP INDEX IF EXISTS public.notifications_dose_key_idx;
-- resta: notifications_dose_key_target_uniq (il nome suggerisce sia quello
-- collegato a un vincolo applicativo esplicito — tenuto per prudenza)

-- 5. events(patient_id) è ridondante rispetto a events(patient_id,
--    scheduled_at DESC): qualunque query filtri solo su patient_id può
--    usare il prefisso del secondo indice composito, quindi il primo non
--    aggiunge nulla in lettura.
DROP INDEX IF EXISTS public.events_patient_idx;
-- resta: idx_events_patient_scheduled

-- =============================================================
-- Verifica dopo l'applicazione:
--   select indexname, tablename from pg_indexes
--   where schemaname = 'public'
--   order by tablename, indexname;
-- Deve mostrare 5 indici in meno rispetto a prima, nessun errore, e le
-- query dell'app (lista terapie, notifiche, caregiver collegati) devono
-- continuare a rispondere con gli stessi tempi di prima (o leggermente
-- meglio, per via del minor overhead di scrittura).
-- =============================================================