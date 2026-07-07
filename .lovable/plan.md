## Obiettivo

Implementare il ciclo notifiche end-to-end per paziente e caregiver, con push reali (che arrivano anche ad app chiusa sul cellulare), sveglia insistente all'orario esatto per il paziente, e storici separati per ruolo.

---

## 1. Ciclo di vita di una dose (macchina a stati)

Per ogni dose programmata, la sequenza è:

```
T-N min ── reminder PRE ──► paziente (push, info)
T=0     ── DUE ─────────► paziente (push + SVEGLIA insistente)
T+snooze── reminder POST ► paziente (push, warning) — se ancora "due"
T+10min ── MISSED ──────► paziente (push, alert)  +  caregiver (push, alert)
```

Azioni disponibili al paziente sulla notifica DUE/POST (deep-link in-app):
- **Conferma** → status `taken` → notifica caregiver (`taken`, info)
- **Rimanda** (di `snooze_minutes` dalla terapia) → status `snoozed` → notifica caregiver (`snoozed`, info)
- **Salta** → status `skipped` → notifica caregiver (`skipped`, warning)

Al superamento del timeout senza azione → `missed` + push caregiver (già presente, va esteso a `taken/snoozed/skipped/low_stock`).

---

## 2. Modifiche DB (`RESET.sql` + `MIGRATION_FIX.sql`)

Aggiunta di due colonne su `therapies`:
- `post_reminder_minutes integer default 5` — minuti dopo l'orario per il reminder POST.
- (già esiste `timeout_minutes` per il MISSED e `snooze_minutes` per lo snooze.)

Nuova tabella per Web Push subscriptions:

```sql
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
grant select, insert, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;
alter table public.push_subscriptions enable row level security;
create policy "push_sub: own" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```

Estensione enum `notifications.kind`: `'reminder_pre' | 'due' | 'reminder_post' | 'missed' | 'taken' | 'snoozed' | 'skipped' | 'low_stock' | 'info'`.

---

## 3. Web Push reale (VAPID)

Perché serve: la `Notification API` browser attuale funziona solo se la tab è aperta. Per notifiche vere "come app" (schermata di blocco, PWA installata su iOS 16.4+/Android), serve Web Push + service worker `push` handler + VAPID keys.

Passi:
- Generare coppia VAPID (`VAPID_PUBLIC_KEY` pubblico, `VAPID_PRIVATE_KEY` segreto in Cloud secrets).
- Estendere `public/sw.js` con handler `push` e `notificationclick` (apre `/notifiche/<id>`).
- Client: dopo login, `registration.pushManager.subscribe({ applicationServerKey })` e salva in `push_subscriptions`.
- Edge function `push-sender` (nuova) chiamata da `dose-scheduler` e da trigger applicativi: fa loop su `push_subscriptions` del `target_user_id` e invia via `web-push` (libreria Deno equivalente `https://esm.sh/web-push`) — payload: `{ title, body, icon, image, tag, url, requireInteraction, sound }`.

UI: banner in `/impostazioni` "Attiva notifiche push su questo dispositivo" con permission request + subscribe.

---

## 4. Sveglia insistente per paziente al T=0

Nuovo componente `AlarmRinger` montato in `__root.tsx`:
- Sottoscritto realtime su `notifications` `kind='due'` per l'utente paziente.
- Alla ricezione: apre modal fullscreen "🔔 È ora di prendere {farmaco}" con foto grande, pulsanti `Conferma / Rimanda / Salta`, e suona `/sounds/alarm-loop.mp3` in loop (WebAudio, `loop=true`, volume 1).
- Il suono continua finché l'utente non tocca uno dei 3 pulsanti (o "Silenzia").
- Wake Lock API (`navigator.wakeLock.request('screen')`) per tenere lo schermo acceso.
- Vibrazione ripetuta ogni 3s.
- Anche il service worker, sulla push `due`, invia `Notification` con `requireInteraction: true`, `silent: false`, `vibrate`, e un `sound` (dove supportato).

---

## 5. Notifiche al caregiver per OGNI azione

Aggiungere trigger applicativi in `store.tsx` (dentro `confirmDose`, `skipDose`, `snoozeDose`) che, dopo il `saveEventDoc`:
- Recuperano `caregiver_patients.caregiver_id` per il paziente.
- Inseriscono `notifications` per ciascun caregiver con `kind` corrispondente (`taken`, `skipped`, `snoozed`) e messaggio "Mario ha confermato Cardioaspirina alle 08:03".
- La stessa insert scatena l'invio push tramite un trigger DB → edge `push-sender` (oppure chiamata diretta dal client dopo l'insert — più semplice).

Estensione `dose-scheduler`:
- Aggiungere finestra REMINDER POST (tra `T+snooze_min` e `T+snooze_min+2min`) con notifica `reminder_post` al paziente.
- Su `low_stock` (già presente evento? aggiungere check `pills_remaining <= low_stock_threshold` → notifica caregiver + paziente).

---

## 6. Storico notifiche separato per ruolo

Ristrutturazione `src/routes/notifiche.tsx` (esiste già): la query attuale filtra già per `target_user_id = auth.uid()` via subscription, quindi ogni utente vede solo le proprie.

Miglioramenti visivi separati:
- **Vista caregiver** (`role='caregiver'`): raggruppa per paziente con filtro chip; icone e toni per `missed` (rosso), `taken` (verde), `skipped/snoozed` (giallo), `low_stock` (arancione). Ogni item link a `/pazienti/<id>` o dettaglio dose.
- **Vista paziente** (`role='paziente'`): timeline verticale semplice, font grande, icone grandi. Tap su una notifica `due/reminder_pre/reminder_post` non ancora chiusa → riapre il modal sveglia con azioni. Voci "già fatto/saltato" mostrate come storico read-only.

Nessuna nuova route: `/notifiche` cambia render in base a `data.currentRole`. Filtro chip aggiunti per periodo (oggi / 7g / 30g).

---

## 7. File toccati

Creati:
- `supabase/functions/push-sender/index.ts`
- `src/components/AlarmRinger.tsx`
- `src/lib/push-subscription.ts` (subscribe/unsubscribe helpers)
- `public/sounds/alarm-loop.mp3` (asset)
- Aggiornamento `MIGRATION_FIX.sql` + `RESET.sql` (colonna `post_reminder_minutes`, tabella `push_subscriptions`).

Modificati:
- `public/sw.js` — handler `push` + `notificationclick`.
- `src/routes/__root.tsx` — mount `<AlarmRinger />`.
- `src/routes/notifiche.tsx` — due viste per ruolo, filtri, deep-link.
- `src/routes/impostazioni.tsx` — pulsante "Attiva notifiche push".
- `src/components/AddTherapyDialog.tsx` — campo `post_reminder_minutes` accanto ai reminder.
- `src/lib/store.tsx` — insert notifiche caregiver in `confirmDose/skipDose/snoozeDose` + trigger push.
- `src/lib/mock-data.ts` + `src/lib/therapy.ts` — tipo `Therapy.postReminderMinutes`.
- `src/lib/services/notifications.ts` — helper `subscribeToPush(userId)`.
- `supabase/functions/dose-scheduler/index.ts` — finestra `reminder_post`, low_stock, invocazione push-sender.

---

## 8. Segreti richiesti

- `VAPID_PUBLIC_KEY` (pubblico, esposto come `VITE_VAPID_PUBLIC_KEY`).
- `VAPID_PRIVATE_KEY` (privato, edge only).
- `VAPID_SUBJECT` (es. `mailto:admin@familymed.app`).

Li genero io con `generate_secret` + un comando VAPID; ti chiedo solo di confermare il `VAPID_SUBJECT` (email di contatto obbligatoria dal protocollo Web Push).

---

## 9. Verifica finale

1. Crea terapia con orario tra 3 minuti, `reminder_intervals=[2]`, `snooze_minutes=1`, `timeout_minutes=5`.
2. Come paziente: ricevi push a T-2, poi modal sveglia con suono a T=0.
3. Premi "Rimanda" → il suono si ferma, il caregiver riceve push "ha rimandato".
4. A T+1 arriva reminder_post; ignora fino a T+5 → status `missed`, caregiver riceve push alert.
5. `/notifiche` come paziente mostra timeline semplice; come caregiver mostra vista raggruppata per paziente con tutti gli eventi.

---

## Domanda che ti farò dopo il go

Confermami solo **l'email di contatto** per VAPID (`VAPID_SUBJECT`, es. la tua). Tutto il resto lo gestisco io.
