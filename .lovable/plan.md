# Piano — Notifiche affidabili, calendario, badge

## 1. Diagnosi: perché le push della terapia non arrivano

Il push di test funziona → VAPID, subscription e `push-sender` sono OK.
Le push generate da `dose-scheduler` no. Le cause probabili sono due, e vanno verificate entrambe con una query SQL sul tuo Supabase prima di toccare il codice:

```sql
-- (a) il cron è davvero schedulato?
select jobname, schedule, active from cron.job;
-- (b) sta girando davvero ogni minuto e con che esito?
select status, return_message, start_time
from cron.job_run_details
where jobname = 'familymed-dose-scheduler'
order by start_time desc limit 20;
-- (c) ci sono subscription per il paziente e per il caregiver?
select user_id, endpoint, user_agent from public.push_subscriptions;
-- (d) le dosi vengono generate?
select id, therapy_id, scheduled_at, status, stage
from public.events order by scheduled_at desc limit 20;
```

In base al risultato correggo:

- se (a) è vuoto → il cron non è mai stato creato davvero, ti ridò il comando esatto con i tuoi valori
- se (b) mostra 4xx/5xx → sistemo l'invocazione (URL / apikey / body)
- se (c) mostra solo il paziente Android → il caregiver PC non è iscritto (bisogna cliccare "Attiva notifiche" anche da PC — al momento probabilmente non l'hai fatto perché non è chiaro)
- se (d) è vuoto → problema nella generazione (recurrence / date), lo aggiusto

Questo passaggio va fatto per primo, prima di aggiungere feature — altrimenti rischiamo di ricostruire su una base rotta.

## 2. Notifiche caregiver realtime e distinte

Oggi:

- il caregiver riceve notifiche solo se `dose-scheduler` gira e solo con lo stesso stile del paziente
- quando il paziente conferma/rimanda, il trigger DB `handle_dose_taken` scrive solo la riga in `notifications` ma **non manda push** → il caregiver non riceve niente in tempo reale

Modifiche:

- in `dose-action` (funzione già chiamata da paziente / dal SW): dopo il cambio di stato della dose (`taken` / `snoozed`), chiamare direttamente `push-sender` per ogni caregiver del paziente, così la notifica al caregiver è immediata e non deve aspettare il prossimo giro di cron
- stile visivo distinto per il caregiver, sia in push che in-app:
  - prefisso titolo `👨‍👩‍👧 [Familiare]` per il caregiver, `💊 [Terapia]` per il paziente
  - icona badge diversa (`/icons/badge-caregiver.png` vs `/icons/badge-patient.png` — genero le 2 immagini)
  - `tag` diverso così non si sovrascrivono a vicenda
  - suono/vibrazione più discreta per il caregiver (nessun `requireInteraction`, vibrate corto), sveglia solo per il paziente
- realtime in-app: sottoscrivere `postgres_changes` sulla tabella `notifications` filtrata per `target_user_id = auth.uid()` per mostrare un toast immediato in app (paziente + caregiver) anche quando la push arriva o si perde

## 3. Aggiungi al calendario (.ics) con immagini

`src/lib/ics.ts` esiste già ma non è esposto in UI. Aggiungo:

- pulsante **"Aggiungi al calendario"** nella card di ogni terapia in `src/routes/le-mie-terapie.tsx` (vista paziente) e in `src/routes/pazienti.$id.tsx` (vista caregiver)
- nel `.ics` includo nella `DESCRIPTION`:
  - farmaco, dosaggio, quantità, note
  - **URL assoluto delle foto** del farmaco / confezione (Google Calendar Android mostra il link cliccabile; gli allegati binari `ATTACH` non sono supportati da tutti i client, quindi il link è la strada più affidabile — te l'avevo confermato nella domanda)
  - `VALARM` a 0 min e uno aggiuntivo `-PT10M` (allineato al primo `reminder_intervals`) così il calendario suona anche se le push del server non partono
- il file `.ics` si apre nativamente su Android → apre Google Calendar / Samsung Calendar con l'evento ricorrente pre-compilato

## 4. Badge sull'icona dell'app (PWA installata)

Uso la [Badging API](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/setAppBadge) (supportata da Chrome Android quando la PWA è installata):

- hook `useAppBadge()` che tiene sincronizzato `navigator.setAppBadge(n)` con il conteggio delle notifiche non lette dell'utente loggato (query su `notifications` filtrata `read=false` + realtime)
- reset con `navigator.clearAppBadge()` quando l'utente entra in `/notifiche`
- funziona su Android per PWA installate; su desktop Chrome funziona solo se installata; su iOS non è supportato — mostro comunque il badge in-app come fallback

## 5. Notifiche in-app più visibili

- nella navbar (`AppShell` / `PatientShell`): pallino rosso con contatore sull'icona 🔔 "Notifiche", legato allo stesso contatore del badge
- toast realtime (via sonner, già presente) quando arriva un nuovo record in `notifications`, con colore diverso per severity (`info` / `warning` / `alert`) e prefisso ruolo
- pagina `/notifiche`: raggruppa per giorno, header per severity, marca come lette al click, pulsante "segna tutte come lette"

## 6. Cose che potresti dover fare tu manualmente

- **Solo la prima volta**: eseguire la query diagnostica al §1 e incollarmi il risultato — così capiamo se il problema è il cron, le subscription o la generazione dosi, e sistemo di conseguenza
- iscrivere anche il browser del **caregiver su PC** cliccando "Attiva notifiche" nella pagina Impostazioni (oggi probabilmente hai iscritto solo l'Android del paziente — è il motivo principale per cui sul PC non arriva niente)
- reinstallare la PWA su Android dopo il deploy per attivare il badge sull'icona (Android cache la registrazione al primo install)

## File toccati

- `src/lib/push-subscription.ts` — nessuna modifica, già ok
- `supabase/functions/dose-action/index.ts` — push immediata al caregiver dopo azione paziente
- `supabase/functions/dose-scheduler/index.ts` — stile push distinto caregiver/paziente
- `src/lib/ics.ts` — includi URL foto e VALARM extra
- `src/routes/le-mie-terapie.tsx`, `src/routes/pazienti.$id.tsx`, `src/routes/terapie.tsx` — pulsante "Aggiungi al calendario"
- `src/hooks/use-app-badge.ts` — nuovo, sincronizza Badging API
- `src/hooks/use-realtime-notifications.ts` — nuovo, toast + refresh contatore
- `src/components/AppShell.tsx`, `src/components/PatientShell.tsx` — badge sulla voce Notifiche
- `src/routes/notifiche.tsx` — raggruppamento per giorno, mark-as-read
- `src/assets/badge-*.png` — 2 icone badge generate

## Ordine di esecuzione (una volta approvato)

1. Chiedo il risultato della query diagnostica → sistemo la causa
2. Push caregiver immediata da `dose-action` + stile distinto
3. Realtime in-app + badge navbar
4. Badging API su icona
5. Pulsante calendario .ics con foto