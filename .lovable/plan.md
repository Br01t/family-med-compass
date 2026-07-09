# Refactor notifiche: da push a modali in-app + calendario

## Obiettivi
1. Zero notifiche push (paziente e caregiver).
2. Paziente: reminder / conferma / conferma-post-snooze come **modali nella dashboard**.
3. Caregiver: solo centro notifiche (nessun push); notifica letta = archiviata.
4. Calendario: 1 evento per orario con `RRULE`, senza foto, con link che riapre l'app.
5. Sessione utente persistente fino a logout esplicito.

---

## 1. Rimozione push

**Frontend**
- Eliminati: `src/lib/push-subscription.ts`, `src/hooks/use-app-badge.ts`, `src/hooks/use-notification-toasts.ts`, `public/sw.js` (o ridotto a shell PWA senza `push`/`notificationclick`), `public/icons/badge-caregiver.png`, `src/lib/vapid.ts`.
- Rimosse le chiamate a registrazione SW/push da `AppShell.tsx`, `PatientShell.tsx`, `impostazioni.tsx`.
- Manifest PWA resta (install banner OK), ma senza permesso Notifiche.

**Edge functions**
- `push-sender` → cancellata (`supabase--delete_edge_functions`).
- `dose-scheduler` → rimosso ogni `sendPush(...)`; continua a scrivere solo righe in `notifications` e ad avanzare gli `events.stage/status`.
- `dose-action` → non più chiamata dal SW; l'endpoint viene rimosso (le azioni paziente ora passano dal client autenticato con RLS).

**DB**
- Migrazione: `DROP TABLE public.push_subscriptions` (+ policy).
- Nessun'altra modifica di schema.

---

## 2. Modali paziente nella dashboard

Nuovo componente `src/components/DoseModal.tsx` renderizzato in `paziente.tsx`. Un solo modale attivo alla volta, priorità: `final_due` > `due` > `reminder_pre`.

Trigger: polling ogni 15s sugli `events` del paziente + realtime `postgres_changes` sulla tabella `events` filtrato per `patient_id`.

Stati mostrati:
- **reminder_pre**: "Tra N minuti: <farmaco>". Bottoni: *Ho capito* (chiude), *Posticipa* (disabilitato se `now < scheduled_at`).
- **due**: "È ora di <farmaco>". Bottoni: *Ho preso* / *Rimanda N min* / *Salta*. Attivi solo da `scheduled_at`.
- **final_due** (post-snooze): "Ultima chiamata". Solo *Ho preso* / *Salta*.

Dismiss: il modale si può chiudere solo dopo un'azione, oppure con "Ricordamelo tra poco" (riappare al prossimo tick).

**Timeline dashboard** (`paziente.tsx`):
- Ordinamento decrescente per `scheduled_at` (più recenti in alto).
- La card di una dose diventa "attiva" (evidenziata, azioni abilitate) quando `now >= scheduled_at` e `status ∈ {scheduled, snoozed}`.
- Le azioni sulla card producono lo stesso effetto del modale.

**Rimosse le azioni dal centro notifiche paziente**: `/notifiche` per il paziente diventa storico read-only.

---

## 3. Caregiver: notifiche "read = done"

- `notifications` ha già `read_at`. Regola nuova: appena il caregiver apre `/notifiche`, tutte le righe non lette vengono marcate `read_at = now()`.
- La lista mostra **solo** `read_at IS NULL` (default) + toggle "Mostra storico".
- Rimosso il badge/counter permanente; il conteggio si azzera all'apertura.
- Nessun toast, nessun push, nessun re-prompt.

---

## 4. Calendario (ICS) senza foto, con link app

`src/lib/ics.ts`:
- Rimossi `ATTACH` e `URL` che puntano alle foto.
- `URL:` = deep link all'app: `https://<app-origin>/paziente?therapy=<id>` (caregiver: `/pazienti/<id>?therapy=<id>`).
- `DESCRIPTION` include solo: nome, dosaggio, quantità, note, e in fondo "Apri in FamilyMed: <url>".
- Ricorrenza: già `RRULE` (daily / weekly / interval / byday) → resta 1 `VEVENT` per orario, non uno per giorno. Aggiunto `COUNT`/`UNTIL` corretto per `endDate`.
- Rimossi i due `VALARM` (il calendario nativo gestisce già i propri promemoria).
- Pulsante "Aggiungi al calendario" già presente in `le-mie-terapie` + esposto anche in `pazienti.$id` per il caregiver.

---

## 5. Sessione persistente

`src/integrations/supabase/client.ts` è auto-generato, ma la persistenza dipende dal fatto che Supabase JS usa già `localStorage` con `persistSession: true` di default → la sessione **è già persistente**. Verifiche da fare:
- Nessun `signOut()` involontario in `AppShell` / `RequireAuth` / route guards → rimuovere eventuali auto-logout su focus/visibility.
- `_authenticated/route.tsx` (integration-managed) fa `supabase.auth.getUser()` client-side, quindi la sessione salvata è sufficiente per non ripassare da `/auth`.
- Aggiunto solo un listener `onAuthStateChange` per invalidare le query quando l'utente fa logout esplicito.

---

## 6. Cron / dose-scheduler
Resta schedulato ogni minuto perché serve ancora per:
- generare le righe `events` future,
- avanzare `stage` (`due`, `final_due`, `missed`),
- scrivere le righe in `notifications` per il caregiver.
Solo eliminata la parte di invio push.

---

## File toccati (sintesi)

| File | Azione |
|---|---|
| `supabase/functions/push-sender/*` | delete |
| `supabase/functions/dose-action/*` | delete |
| `supabase/functions/dose-scheduler/index.ts` | rimuovi push, mantieni notifications |
| `supabase/migrations/<new>.sql` | drop `push_subscriptions` |
| `src/lib/push-subscription.ts`, `src/lib/vapid.ts` | delete |
| `src/hooks/use-app-badge.ts`, `src/hooks/use-notification-toasts.ts` | delete |
| `public/sw.js` | ridotto o rimosso |
| `src/components/DoseModal.tsx` | **new** |
| `src/routes/paziente.tsx` | timeline ordinata + modale + realtime, no push |
| `src/routes/notifiche.tsx` | mark-read on view, filtro `unread`, no azioni per paziente |
| `src/components/AppShell.tsx`, `PatientShell.tsx` | rimozione hook push |
| `src/routes/impostazioni.tsx` | rimossa sezione "Notifiche push" |
| `src/lib/ics.ts` | no foto, no VALARM, URL = deep link, RRULE con UNTIL |
| `src/routes/pazienti.$id.tsx` | bottone "Aggiungi al calendario" |

Nessuna modifica alle tabelle esistenti a parte il drop di `push_subscriptions`.

---

## Domanda aperta
Per il modale paziente: quando l'utente **chiude l'app** e la riapre 30 min dopo, vuoi che il modale della dose passata (non confermata, non ancora `missed`) si ripresenti al rientro, oppure solo la card "attiva" evidenziata in timeline senza modale automatico? Default proposto: **sì, il modale si ripresenta** finché lo stato è `due`/`final_due`.
