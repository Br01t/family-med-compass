## Obiettivo

Rendere le notifiche di caregiver e paziente coerenti, chiare e complete, con timer visibili nelle modali del paziente.

## 1. Notifiche caregiver — semplificazione

Oggi il caregiver riceve un mix di notifiche dallo scheduler (`reminder_pre`, `due`, `reminder_post`, `final_due`, `missed`) e dai trigger DB (`taken`, `snoozed`, `skipped`, `missed`, `low_stock`) con titoli/messaggi inconsistenti.

Nuova regola: per ogni dose il caregiver vede **esattamente le stesse notifiche del paziente** + **una notifica per ogni azione del paziente** sulla relativa modale.

- Notifiche "specchio" del paziente (dallo scheduler, invariato ma con testo caregiver-friendly):
  - `reminder_pre` — "Tra N min: {paziente} deve prendere {farmaco}"
  - `due` — "{paziente} deve prendere ora {farmaco}"
  - `reminder_post` — "{paziente} non ha ancora preso {farmaco}"
  - `final_due` — "Ultima chiamata per {paziente}: {farmaco}"
  - `missed` — "{paziente} non ha preso {farmaco} (dimenticata)"
- Notifiche azione del paziente (dai trigger DB):
  - `taken` — "{paziente} ha confermato {farmaco}"
  - `taken_after_snooze` — "{paziente} ha confermato dopo rimando"
  - `snoozed` — "{paziente} ha rimandato {farmaco} di N min"
  - `skipped` — "{paziente} ha rifiutato {farmaco}"
- Rimosso: `low_stock` dal flusso dose (rimane come alert separato, non per ogni dose).

Il testo di ogni notifica dirà chiaramente **a quale modale/evento si riferisce l'azione** (es. "in risposta al reminder delle 08:00").

## 2. Notifiche paziente — completezza

Oggi il paziente riceve `reminder_pre`, `due`, `reminder_post`, `final_due`, `missed` come modali. `AlarmRinger` le marca **subito come lette** → nel centro notifiche non compaiono più tra le "nuove".

Modifiche:
- `AlarmRinger` non marca più `read=true` all'apertura della modale. Marca `read=true` solo quando l'utente clicca un'azione (conferma / rimanda / salta / ho capito) o quando la modale viene sostituita da una successiva della stessa dose.
- Il centro notifiche del paziente mostra quindi tutte le tappe: `reminder_pre`, `due`, `reminder_post`, `final_due`, `missed`, oltre a `taken` / `snoozed` / `skipped` inserite dai trigger.
- Notifica `missed` al paziente: quando lo scheduler segna una dose `missed`, il testo per il paziente diventa: *"Non hai confermato la dose delle HH:MM di {farmaco}. È stata segnata come dimenticata: probabilmente verrai contattato da un familiare."* (già inserita da `notifyBoth`, ma serve testo dedicato).

## 3. Modali con timer visibili

Nelle modali `AlarmRinger` del paziente aggiungere un pannello "Tempi della dose" sempre visibile con countdown live:

- **Reminder pre** — mostra "Mancano MM:SS all'orario della dose (HH:MM)".
- **Due / Reminder post** — mostra tre timer:
  1. "Preavviso: N min" (informativo, statico)
  2. "Tempo per confermare la dose: MM:SS" (countdown fino a `scheduled_at + post_reminder_minutes`, poi passa a `reminder_post`)
  3. "Ritardo massimo prima di dimenticata: MM:SS" (countdown fino a `scheduled_at + timeout_minutes`)
- **Final due** — mostra "Ritardo massimo: MM:SS" (countdown fino a `snoozed_until + timeout_minutes`), con avviso in rosso quando <2 min.

I countdown si aggiornano ogni secondo con `setInterval`.

## 4. Cosa devi fare tu sul DB Supabase esterno

Ti serve un **nuovo file SQL** `MIGRATION_notifications_v2.sql` da eseguire una volta, che:

- Aggiorna `handle_dose_taken()` per distinguere `taken` vs `taken_after_snooze` (in base a `OLD.status = 'snoozed'`) e rimuovere la generazione di `low_stock` come notifica per dose (spostata in evento separato o disattivata).
- Aggiorna `handle_dose_status_change()` per generare per il **caregiver** anche testo che referenzia la modale ("in risposta al reminder delle HH:MM").
- Aggiorna la funzione per generare la notifica `snoozed` per il caregiver includendo i minuti di rimando.
- Aggiunge una migration idempotente che ricrea trigger `trg_dose_taken` e `trg_dose_status_change` senza duplicarli.

Nessuna modifica a schema tabelle. Nessuna nuova edge function. Il cron esistente (`dose-scheduler-every-minute`) resta invariato.

## 5. Edge function `dose-scheduler`

Piccole modifiche di testo:
- Testo `missed` per paziente esplicita "probabilmente verrai contattato da un familiare".
- Testi caregiver riformulati per essere allineati a quelli del paziente (specchio).

Da ridistribuire con `supabase functions deploy dose-scheduler`.

## Dettagli tecnici (per riferimento)

File modificati:
- `src/components/AlarmRinger.tsx` — rimosso auto-mark-as-read, aggiunto pannello timer con countdown.
- `MIGRATION_notifications_v2.sql` — nuovo file con aggiornamento funzioni + trigger.
- `supabase/functions/dose-scheduler/index.ts` — testi aggiornati.
- (nessuna modifica a `caregiver.tsx` / `notifiche.tsx`: già mostrano tutte le kind).

## Deliverables per te (utente, DB esterno)

1. Eseguire `MIGRATION_notifications_v2.sql` nel SQL editor del tuo Supabase.
2. Ridispiegare la edge function `dose-scheduler`.
3. Nessuna modifica al cron.
