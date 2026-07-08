## Piano — Notifiche push FamilyMed (Android + Supabase esterno + Cloudflare)

### Contesto operativo confermato
- Target principale: **Android** (Chrome/Edge PWA). Su Android le Web Push funzionano bene anche con app chiusa e schermo bloccato tramite FCM, con suono/vibrazione gestiti dall'OS.
- Database: **Supabase esterno personale** (non Lovable Cloud) → tutte le modifiche SQL verranno consegnate come file `.sql` idempotenti da eseguire nello SQL Editor, non tramite lo strumento di migration di Lovable.
- Hosting frontend: **Cloudflare Pages/Workers** (piano free) → il service worker deve funzionare da dominio pubblico HTTPS Cloudflare; nessuna dipendenza da server long-running.
- Edge functions: restano su Supabase (`push-sender`, `dose-scheduler`), aggiornate e da ridistribuire via CLI Supabase come già indicato in `DEPLOY.md`.

### Nota realistica sui limiti
Il timer che suona “fino a un'azione” con app completamente chiusa non è garantibile dai browser. Su Android la notifica push arriva persistente con vibrazione e suono di sistema; se l'utente apre l'app la sveglia in-app suona in loop. iPhone resta best-effort e richiede PWA installata.

## Cosa farò

### 1. Flusso notifiche unico
Stati evento dose:
```text
scheduled → due → snoozed → final_due → taken | missed
```

Paziente riceve:
- `reminder_pre` — qualche minuto prima (solo avviso).
- `due` — ora esatta, azioni **Conferma** / **Rimanda**.
- `final_due` — solo dopo rimando, solo **Conferma**.
- `missed` — dopo il tempo massimo, testo “cura segnata come dimenticata, un familiare potrebbe contattarti”.

Caregiver riceve mirror di tutte le tappe + eventi azione paziente:
- confermata / rimandata / confermata dopo rimando / dimenticata.

### 2. Database (file SQL da eseguire sul tuo Supabase)
Consegnerò un unico patch idempotente (`PATCH_notifications_v2.sql`) che:
- Aggiunge/aggiorna colonne su `events` (`stage`, `final_due_at`) e `therapies` (parametri già presenti).
- Aggiorna RLS: paziente vede/aggiorna solo le proprie notifiche; caregiver vede quelle dei pazienti collegati; `push_subscriptions` per-utente.
- Aggiunge policy/grant mancanti per far girare tutto senza `permission denied`.
- Assicura Realtime su `notifications`, `events`, `therapies`, `patients`.
- Aggiorna trigger `handle_dose_taken` per generare le notifiche caregiver corrette (conferma / rimando / conferma-dopo-rimando).
- Include istruzioni pg_cron per invocare `dose-scheduler` ogni minuto.

### 3. Edge functions Supabase (aggiornate e da ri-deployare)
- `dose-scheduler`: genera dosi, emette `reminder_pre`, `due`, `final_due`, `missed`, aggiorna `stage`, notifica caregiver in mirror.
- `push-sender`: payload arricchito (titolo, corpo, immagine terapia/confezione, tag, `renotify`, `requireInteraction`, `urgency high`, azioni Conferma/Rimanda), rimozione subscription 404/410, log diagnostico.
- Nuova function pubblica `dose-action` (verifica JWT o token firmato) chiamata dall'azione della notifica per confermare/rimandare senza richiedere app aperta.

### 4. Service worker (`public/sw.js`)
- Notifiche persistenti con `vibrate`, `renotify`, `requireInteraction`, immagine terapia.
- `notificationclick` per azioni `confirm` / `snooze`: chiama `dose-action` in background e chiude la notifica; apre `/notifiche` se solo click.
- `postMessage` all'app aperta per attivare `AlarmRinger`.
- Nessun cache aggressivo che blocchi update su Cloudflare.

### 5. Frontend
- Timeline paziente: mostra stato `snoozed` e `final_due` in modo evidente.
- `AlarmRinger`: gestisce sia `due` (Conferma/Rimanda) sia `final_due` (solo Conferma).
- Centro notifiche: nuovi tipi con azioni coerenti, stato letta/non letta in realtime multi-device.
- Impostazioni paziente: diagnostica chiara (permesso, service worker, subscription locale, registrazione server, test push).

### 6. Consegna e verifica
- File da eseguire tu una volta: `PATCH_notifications_v2.sql` (SQL Editor) + comandi `supabase functions deploy` + snippet `cron.schedule` (già in `DEPLOY.md`, aggiornato).
- Verificherò lato codice build e ricontrollerò i log delle edge function dopo il deploy.
- Testeremo insieme: registrazione dispositivo Android → notifica test → creazione terapia a +2 min → arrivo `reminder_pre`, `due`, azione, `final_due` o `missed`, mirror caregiver.