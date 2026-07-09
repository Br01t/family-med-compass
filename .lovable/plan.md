
## Obiettivo
Sistemare il nuovo sistema di notifica in-app (pre / esatto / post) e rendere entrambe le dashboard reattive, con statistiche corrette, timeline live e gestione automatica delle scorte.

## 1. Timeline paziente ordinata "più imminente prima"

`src/routes/paziente.tsx`
- Cambia il sort in modo che l'ordine sia:
  1. dose "attiva ora" (finestra reminder→timeout)
  2. dosi future in ordine cronologico ascendente
  3. dosi passate (taken/skipped/missed/late) in ordine cronologico discendente
- `activeDose` resta come oggi ma con soglia coerente con `reminderIntervals[0]` invece dei 15 min hard-coded.
- Le card in timeline aggiornano stato ogni 30 s tramite un `useEffect` con `setInterval(setTick)` così `computeStatus` ricalcola live (scheduled → reminder → due → late).

## 2. Modali paziente: pre / esatto / post

`src/components/AlarmRinger.tsx` (già gestisce `reminder_pre`, `due`, `final_due`)
- Aggiungere il tipo `reminder_post` (post-orario di N minuti definito da `therapy.postReminderMinutes`) come modale di richiamo insistente identico a `due`, con conferma/rimanda/salta.
- Priorità: `final_due` > `reminder_post` > `due` > `reminder_pre`.

`supabase/functions/dose-scheduler/index.ts`
- Aggiungere una fase `REMINDER_POST` che scatta a `scheduledAt + postReminderMinutes` (default 5 min) se lo stato è ancora `scheduled`, inserendo notifica `kind: "reminder_post"` per paziente **e** caregiver.
- La finestra `DUE` resta ±90 s; `FINAL_DUE` invariata; `MISSED` invariata.

## 3. Caregiver: dashboard live con dati di tutti i pazienti seguiti

Problema attuale: `subscribeTherapies` / `subscribeEvents` filtrano su `currentPatientId`, quindi grafici e scorte del caregiver vedono solo il paziente attivo.

`src/lib/supabase-service.ts` + `src/lib/store.tsx`
- Nuove funzioni `subscribeTherapiesForPatients(patientIds, cb)` e `subscribeEventsForPatients(patientIds, cb)` che usano `.in("patient_id", ids)` con relativi canali realtime.
- Nel provider: quando `userProfile.role === "caregiver"` sottoscrivi terapie/eventi per **tutti** i `patients[].id`; per il paziente resta lo stream sul suo id.

`src/routes/caregiver.tsx`
- Con i dati completi, le tre metric card, il grafico settimanale `WeeklyAdherenceCard`, la lista scorte basse e la timeline eventi risultano automaticamente corrette.
- Timeline eventi di oggi già live via realtime; aggiungere un `setInterval` di 30 s per ricalcolare stati derivati (late, ecc.).
- La `PatientCard` mostra badge "confermata / rimandata / in ritardo" derivato dagli eventi realtime.

`src/routes/pazienti.$id.tsx`
- Timeline aggiornata live sfruttando lo stesso stream + tick 30 s. Nessuna azione, sola visualizzazione (il caregiver monitora).

## 4. Notifiche caregiver: azioni del paziente

Già presenti (`notifyCaregiversAboutDose` per `taken` / `taken_after_snooze` / `snoozed` / `skipped`).
- Verifica che compaiano nel centro notifiche caregiver e che l'auto-mark-read all'apertura non le nasconda finché non vengono realmente viste una volta.
- `src/routes/notifiche.tsx` lato caregiver: differenzia visivamente le notifiche "azione paziente" (verde/arancio) dagli "avvisi terapia" con l'icona già mappata in `KIND_META`.

## 5. Scorte: decremento & alert a 10 dosi

Situazione attuale: `confirmDose` nel client decrementa `pillsRemaining` **e** il trigger DB `handle_dose_taken` decrementa di nuovo → doppio scalo, più notifica low_stock solo sotto `low_stock_threshold` (configurabile per terapia, spesso non = 10).

- Rimuovere il decremento client-side in `confirmDose` (mantiene solo `saveEventDoc`; il trigger DB fa scalo + `stock_movements` + notifica low_stock).
- Migrazione DB per fissare il default e la soglia:
  - `ALTER TABLE public.therapies ALTER COLUMN low_stock_threshold SET DEFAULT 10;`
  - `UPDATE public.therapies SET low_stock_threshold = 10 WHERE low_stock_threshold IS NULL OR low_stock_threshold < 10;`
- Trigger `handle_dose_taken`: la soglia `<=` va bene, ma sostituire il messaggio con "Restano N dosi di <farmaco>" e aggiungere `severity: 'warning'`. Aggiungere `dose_key` giornaliera già presente per non spammare.

## 6. Dettagli tecnici

- `computeStatus`: gestire nuova finestra `reminder_post` (tra `scheduledAt` e `scheduledAt+timeoutMinutes`, differenziando quando è passato `postReminderMinutes`). Aggiungere status `"post"` opzionale o mappare come `late` con label "Richiamo".
- Aggiornare `statusLabel/statusTone/statusDot` per il nuovo stato se aggiunto.
- Realtime già attivo su tables `events`, `therapies`, `notifications` (verificato in migrazione esistente).
- Nessun nuovo secret. Nessun push. Sessione persistente già ok.

## Deploy richiesto
- `supabase functions deploy dose-scheduler --no-verify-jwt`
- Migrazione DB approvata dall'utente.
