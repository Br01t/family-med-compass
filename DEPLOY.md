# FamilyMed v3 — Deploy notifiche complete (Supabase esterno + Cloudflare + Android)

## 1. Applica la patch SQL (idempotente)

Nel tuo Supabase esterno → **SQL Editor → New query**, incolla ed esegui il contenuto di [`PATCH_notifications_v2.sql`](./PATCH_notifications_v2.sql).

Aggiunge:
- colonne `stage`, `final_due_at` su `events` e parametri terapia mancanti
- tabella `push_subscriptions` con RLS
- policy RLS notifiche paziente/caregiver corrette
- realtime su `notifications`, `events`, `therapies`, `patients`
- trigger `handle_dose_taken` con distinzione conferma / conferma-dopo-rimando

## 2. Deploy edge functions

Con Supabase CLI:

```bash
supabase login
supabase link --project-ref <IL_TUO_PROJECT_REF>
supabase functions deploy push-sender --no-verify-jwt
supabase functions deploy dose-scheduler --no-verify-jwt
supabase functions deploy dose-action --no-verify-jwt
```

Secrets richiesti (già presenti nel tuo progetto):
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` sono iniettati automaticamente dal runtime Supabase.

## 3. Attiva pg_cron per invocare `dose-scheduler` ogni minuto

Nel **SQL Editor**, una volta:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'familymed-dose-scheduler',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://<IL_TUO_PROJECT_REF>.supabase.co/functions/v1/dose-scheduler',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <IL_TUO_ANON_KEY>',
      'Content-Type', 'application/json'
    )
  );
  $$
);
```

Per fermarlo: `select cron.unschedule('familymed-dose-scheduler');`

## 4. Frontend su Cloudflare Pages

L'app è una PWA con service worker (`public/sw.js`). Su Cloudflare Pages non serve alcuna configurazione extra: il SW è servito dallo stesso dominio HTTPS.

Le azioni "Conferma" / "Rimanda" partono direttamente dalla notifica push (anche ad app chiusa) chiamando l'edge function `dose-action`. Il service worker riceve dal client la config (`VITE_SUPABASE_URL` + anon key) al momento della registrazione dispositivo — quindi assicurati che nel build siano definite le env `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (o `VITE_SUPABASE_PUBLISHABLE_KEY`).

## 5. Test su Android

1. Apri l'app pubblicata da Chrome Android.
2. Installa come PWA (menu → "Installa app" / "Aggiungi a schermata Home").
3. Riapri dall'icona.
4. Login come **paziente** → **Impostazioni → Registra dispositivo** → concedi le notifiche.
5. **Invia notifica di prova**: deve arrivare con suono e vibrazione anche a schermo bloccato.
6. Crea una terapia con orario tra 2–3 minuti dal caregiver linkato:
   - **Reminder pre**: qualche minuto prima
   - **Due** (allarme): all'ora esatta, con azioni Conferma/Rimanda dalla notifica
   - **Final due**: se hai rimandato, alla fine del rimando
   - **Missed**: se non confermi entro il tempo massimo
7. Il caregiver riceve gli stessi eventi + le azioni del paziente in tempo reale.

## 6. Limiti reali web push

- **Android + PWA installata**: notifiche affidabili con suono/vibrazione anche a schermo bloccato e app chiusa (via FCM).
- **iOS**: funziona solo se l'utente ha installato la PWA dalla schermata Home; azioni dalla notifica limitate.
- Un "timer che suona finché non tocchi lo schermo" con app completamente chiusa non è garantito dai browser: la sveglia in loop parte automaticamente appena l'app viene aperta.
