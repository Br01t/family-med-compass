# Politica di Conservazione dei Dati (Data Retention Policy)
**Progetto:** FamilyMed  
**Riferimento normativo:** Art. 5.1.e (Limitazione della conservazione) e Art. 25 (Privacy by Design) GDPR  
**Data ultimo aggiornamento:** 14 Settembre 2026  
**Stato:** Documentazione tecnica di audit interno  

---

## 1. Principi Generali

Il principio di limitazione della conservazione stabilisce che i dati personali devono essere:
> *"conservati in una forma che consenta l'identificazione degli interessati per un arco di tempo non superiore al conseguimento delle finalità per le quali sono trattati"* (Art. 5.1.e GDPR).

Nel contesto sanitario e di aderenza terapeutica, è necessario bilanciare due esigenze contrapposte:
1. **Minimizzazione & Sicurezza:** Non accumulare dati sanitari indefinitamente sul database cloud (riducendo anche l'impatto di eventuali data breach e restando nei limiti di storage del piano infrastrutturale);
2. **Utilità Clinica:** Consentire ai medici e ai caregiver di consultare lo storico terapeutico e i parametri vitali su un arco temporale congruo per valutare l'efficacia delle cure.

In FamilyMed la retention **non è affidata a promesse manuali**, ma è **ingegnerizzata e automatizzata direttamente nel motore del database PostgreSQL** tramite job notturni schedulati con l'estensione `pg_cron`.

---

## 2. Tempi di Conservazione per Tipologia di Dato

### 2.1 Tabella Sinottica delle Regole di Retention

| Tipologia di Dato | Tabella Database | Periodo di Conservazione | Meccanismo Tecnico di Eliminazione | Motivazione / Finalità |
|---|---|---|---|---|
| **Dati Profilo & Account** | `profiles`, `user_roles`, `caregivers` | Tutta la durata dell'account attivo | Cancellazione su richiesta dell'utente tramite RPC `delete_my_account` | Erogazione del servizio contrattuale |
| **Pazienti & Anagrafica** | `patients`, `patient_medical_profiles` | Tutta la durata dell'account dell'Owner | CASCADE delete alla cancellazione dell'utente | Gestione continuativa della persona assistita |
| **Terapie Attive** | `therapies` | Tutta la durata della cura | Eliminazione manuale o CASCADE delete | Esecuzione del piano terapeutico |
| **Dosi & Eventi Assunzione (Pro/Max)** | `events` | **180 giorni (circa 6 mesi)** | Cron `events-cleanup-daily` (alle 04:00) | Monitoraggio aderenza semestrale per visite mediche |
| **Dosi & Eventi Assunzione (Free)** | `events` | **30 giorni** (accesso UI limitato a 7 giorni) | Cron `free-events-cleanup-daily` (alle 03:16) | Limitazione contrattuale e risparmio storage |
| **Notifiche di Sistema** | `notifications` | **30 giorni** | Cron `notifications-cleanup-daily` (alle 03:00) | Notifiche effimere non più rilevanti dopo 1 mese |
| **Parametri Vitali (Ad alta risoluzione)** | `vital_signs` | **90 giorni** | Cron `cleanup_vital_signs()` (alle 03:45) | Dettaglio orario completo per il trimestre recente |
| **Parametri Vitali (Storico sintetico)** | `vital_signs` | **24 mesi (Pro) / 60 mesi (Max)** con downsampling a 1/giorno oltre 90gg | Cron `cleanup_vital_signs()` | Trend cronico a lungo termine senza sovraccaricare il DB |
| **Note Cliniche / Sintomi** | `wellness_notes` | **24 mesi** | Cron `wellness-notes-cleanup-daily` (alle 03:40) | Diario dei sintomi per il medico curante |
| **Riepilogo Aderenza Mensile** | `adherence_monthly` | **Senza scadenza (Cumulativo aggregato)** | Calcolato da `rollup_adherence_monthly()` | Statistica aggregata non dettagliata (percentuale % mensile) |
| **Log di Audit e Sicurezza** | `audit_log` | **90 giorni** | Cron `audit-log-cleanup-daily` (alle 03:35) | Verifica accessi e modifiche di sicurezza (Art. 32) |
| **Movimenti di Scorta** | `stock_movements` | **24 mesi** | Cron `stock-movements-cleanup-daily` (alle 03:50) | Ledger di consumo/rifornimento; storico oltre 24 mesi non necessario, tabella a crescita costante da tenere sotto controllo sul piano free (500 MB totali) |
| **Dati Sospesi da Downgrade** | `patients`, `therapies`, `caregiver_patients` (`suspended_at IS NOT NULL`) | **30 giorni (Finestra di ripensamento)** | Cron `downgrade-suspended-*-cleanup` (03:10, 03:12, 03:14) | Consente all'utente di fare re-upgrade e recuperare i dati |
| **Codici Invito Famiglia** | `family_invites` | **7 giorni** dalla generazione | Check logico (`expires_at < now()`) e pulizia | Prevenzione uso improprio di vecchi inviti |
| **Prove del Consenso Privacy** | `user_consents` | **Durata account + 10 anni** | Tabella dedicata preservata fino a cancellazione account | Prova di conformità legale (Art. 7.1 GDPR) |

---

## 3. Dettaglio dei Job Notturni di Cleanup (`pg_cron`)

Tutti i job di pulizia automatica vengono eseguiti nella finestra oraria notturna a basso traffico (tra le 03:00 e le 04:30 UTC/Europe Time), distribuiti a intervalli di pochi minuti per non saturare la memoria e l'I/O del database:

```sql
-- 1. Eliminazione notifiche vecchie di 30 giorni
SELECT cron.schedule('notifications-cleanup-daily', '0 3 * * *',
  $$ DELETE FROM public.notifications WHERE created_at < now() - interval '30 days'; $$
);

-- 2. Cleanup pazienti sospesi da downgrade da > 30 giorni
SELECT cron.schedule('downgrade-suspended-patients-cleanup', '10 3 * * *',
  $$ DELETE FROM public.patients WHERE suspended_at IS NOT NULL AND suspended_at < now() - interval '30 days'; $$
);

-- 3. Cleanup terapie sospese da downgrade da > 30 giorni
SELECT cron.schedule('downgrade-suspended-therapies-cleanup', '12 3 * * *',
  $$ DELETE FROM public.therapies WHERE suspended_at IS NOT NULL AND suspended_at < now() - interval '30 days' AND suspended_reason = 'downgrade'; $$
);

-- 4. Cleanup caregiver rimossi da downgrade da > 30 giorni
SELECT cron.schedule('downgrade-suspended-caregivers-cleanup', '14 3 * * *',
  $$ DELETE FROM public.caregiver_patients WHERE suspended_at IS NOT NULL AND suspended_at < now() - interval '30 days'; $$
);

-- 5. Cleanup eventi utenti Free oltre i 30 giorni
SELECT cron.schedule('free-events-cleanup-daily', '16 3 * * *',
  $$ DELETE FROM public.events WHERE scheduled_at < now() - interval '30 days' AND public.get_patient_owner_plan(patient_id) = 'free'; $$
);

-- 6. Pulizia log di audit oltre 90 giorni
SELECT cron.schedule('audit-log-cleanup-daily', '35 3 * * *',
  $$ DELETE FROM public.audit_log WHERE created_at < now() - interval '90 days'; $$
);

-- 7. Pulizia note cliniche/sintomi oltre 24 mesi
SELECT cron.schedule('wellness-notes-cleanup-daily', '40 3 * * *',
  $$ DELETE FROM public.wellness_notes WHERE occurred_at < now() - interval '24 months'; $$
);

-- 8. Pulizia e Downsampling parametri vitali
SELECT cron.schedule('vital-signs-cleanup-daily', '45 3 * * *',
  $$ SELECT public.cleanup_vital_signs(); $$
);

-- 9. Eliminazione eventi storici generali oltre 180 giorni (Pro/Max)
SELECT cron.schedule('events-cleanup-daily', '0 4 * * *',
  $$ DELETE FROM public.events WHERE scheduled_at < now() - interval '180 days'; $$
);
```

---

## 4. Particolarità: La Tecnica di Downsampling dei Parametri Vitali

Per i parametri vitali (`vital_signs`), l'applicazione adotta una tecnica di **Data Thinning (Minimizzazione Progressiva)**:
- **0 - 90 giorni:** Vengono conservate tutte le rilevazioni puntuali (es. 4 misurazioni di pressione o 5 di glicemia al giorno).
- **90 - 97 giorni fa:** La funzione `cleanup_vital_signs()` esegue una query con `row_number() OVER (PARTITION BY patient_id, kind, date ORDER BY measured_at DESC)` ed elimina tutte le misurazioni dello stesso giorno eccetto la più recente. In questo modo la granularità passa da 4-5 record/die a **1 record/die**.
- **Oltre 24 mesi (Pro) o 60 mesi (Max):** Eliminazione totale definitiva.

Questo garantisce che il database non accumuli milioni di righe inutili e rispetta il principio di proporzionalità temporale del dato sanitario.