
# Piano confermato — FamilyMed v2

Backend: **Supabase esterno** (il tuo progetto). DB attuale: **drop & rebuild** pulito. Paziente-gestito senza account: **sì**, oltre alla lista aperta dei pazienti auto-registrati.

## Cosa consegni tu, cosa consegno io

Poiché non usiamo Lovable Cloud, per la parte server dovrai eseguire tu su Supabase Studio:
1. Uno script `RESET.sql` (che ti fornisco) che droppa lo schema `public` e ricrea tutte le tabelle nuove.
2. La creazione di **1 edge function** `dose-scheduler` (ti darò codice completo + comando `supabase functions deploy`).
3. L'attivazione di **pg_cron** con una riga SQL per invocarla ogni minuto (te la fornisco).
4. In Auth → URL Configuration: aggiungere il redirect di `/reset-password`.

Tutto il resto (client, servizi, UI, realtime, notifiche, storico) lo faccio io nel codice.

## Modello dati

- `profiles` (id → auth.users, name, email, avatar_url, created_at)
- `user_roles` (user_id, role: enum `caregiver` | `paziente`) — separata per sicurezza
- `has_role(_user_id, _role)` — SECURITY DEFINER
- `patients` (id uuid, name, birth_year, photo, owner_user_id [caregiver creatore], user_id [null se paziente-gestito], created_at)
- `caregiver_patients` (caregiver_id, patient_id, relationship, created_at)
- `therapies` (id, patient_id, name, description, dosage, quantity_per_intake, photo_drug, photo_package, start_date, end_date, times[], recurrence jsonb, pills_per_pack, packs_owned, pills_remaining, low_stock_threshold, snooze_minutes default 10, reminder_minutes default 10, timeout_minutes default 10, active, created_at)
- `doses` (id, therapy_id, patient_id, scheduled_at, status enum `pending|taken|snoozed|missed`, taken_at, snooze_count, notes) — generate rolling 7gg
- `notifications` (id, target_user_id, kind enum `reminder|due|missed_caregiver|taken_caregiver|low_stock`, dose_id?, therapy_id?, title, body, created_at, read_at) — sorgente per Realtime
- `stock_movements` (id, therapy_id, delta, reason enum `intake|refill|adjust`, created_at)

**RLS** via `has_role` + join su `caregiver_patients`. GRANT espliciti per `authenticated` e `service_role`. Nessun accesso `anon` sui dati sanitari.

**Trigger DB**:
- `on_auth_user_created` → crea `profiles` + `user_roles` dai metadata.
- `on_dose_taken` → decrementa `pills_remaining`, insert in `stock_movements`, notifica `taken_caregiver` opzionale, notifica `low_stock` se sotto soglia.

**Edge function `dose-scheduler`** (cron ogni minuto):
- Genera dosi mancanti fino a +7gg per ogni terapia attiva.
- Per ogni dose `pending` con `scheduled_at ≤ now - reminder_minutes` inserisce notifica `reminder` (una volta sola, guardia via `notifications`).
- A `scheduled_at` inserisce `due`.
- Oltre `timeout` e ultimo snooze → marca `missed` + notifica `missed_caregiver` a tutti i caregiver collegati.

## Flusso di assunzione (client)

1. T-10 min → notifica `reminder` al paziente.
2. T-0 → notifica sonora `due` + card in timeline con **Conferma / Ritarda 10 min**.
3. Ritarda → `scheduled_at += 10min`, `snooze_count++`.
4. Oltre timeout → server marca `missed` e notifica il caregiver.
5. Conferma → `taken` + trigger scorte.

## Notifiche — architettura Capacitor-ready

Interfaccia unica `NotificationService`:
- **Oggi (web)**: Web Notification API + suono HTML5, sottoscritto a Supabase Realtime su `notifications` filtrato per `target_user_id`.
- **Domani (Capacitor)**: stessa interfaccia, backing `@capacitor/local-notifications` + `@capacitor/push-notifications` (Firebase). Nessuna modifica ai componenti.

Regole per Capacitor-ready:
- Nessun uso diretto di `window`/`localStorage`/`Notification`/`navigator.mediaDevices` nei componenti. Tutto dietro service (`storage`, `notifications`, `audio`, `camera`).
- `vite.config.ts` con `base: './'`.
- Service Worker solo per cache PWA, mai per logica di business.
- Nessun `createServerFn` nel path critico paziente: offline-first con cache React Query + sync.

## Auth

- Signup email/password + Google (via `lovable.auth.signInWithOAuth('google', ...)`).
- Scelta ruolo in registrazione → salvata in `raw_user_meta_data.role` → trigger inserisce in `user_roles`.
- `/reset-password` (nuova pagina pubblica).
- Rimozione fallback profile hack in `auth-service.ts`: trigger DB unica fonte di verità.
- Route protette: `_authenticated/route.tsx` gestito.
- Caregiver dashboard: tab "I miei pazienti" + "Tutti i pazienti" (segui) + "Nuovo paziente gestito" (senza account).

## Storico e report

- `/storico`: timeline giorno-per-giorno per paziente selezionato, colore per stato.
- `/report`: % aderenza (7/30/90gg), ritardo medio, dosi missed per farmaco, trend settimanale, filtri paziente/terapia. Export CSV.

## Refactor client

- `store.tsx` monolitico → split in `auth-store`, e hook React Query per `patients`, `therapies`, `doses`, `notifications`.
- `NotificationScheduler` corrente diventa `WebNotificationAdapter` dietro `NotificationService`.
- Camera/foto: astrazione `mediaService` (input file oggi, `@capacitor/camera` domani).

## Cosa NON tocco

- Design system, palette, layout `AppShell`.
- PWA manifest/icone (già ok).
- Export ICS (funzione extra, resta).

## Ordine di esecuzione

1. Genero `RESET.sql` + istruzioni per edge function e pg_cron → tu esegui su Supabase.
2. Refactor auth (login/registrati/reset-password/guard).
3. Servizi client + React Query (patients, therapies, doses, notifications, stock).
4. UI paziente: timeline con conferma/snooze.
5. UI caregiver: assegnazione, creazione terapia con foto+scorte, inbox notifiche.
6. Storico + report.
7. Wiring Realtime + WebNotificationAdapter.

Ti mostro `RESET.sql` e istruzioni edge function all'inizio del build così puoi lanciarli in parallelo mentre proseguo con il codice.
