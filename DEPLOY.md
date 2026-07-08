# FamilyMed v2 — Deploy sul tuo Supabase esterno

## 1. Reset del database

1. Apri **Supabase Studio → SQL Editor → New query**.
2. Copia tutto il contenuto di [`RESET.sql`](./RESET.sql) e clicca **Run**.
3. Verifica in **Table Editor** che siano state create: `profiles`, `user_roles`, `patients`, `caregivers`, `caregiver_patients`, `therapies`, `events`, `stock_movements`, `notifications`.

> ⚠️ Lo script droppa e ricrea lo schema `public`. Tutti i dati esistenti vengono eliminati (come richiesto).

## 2. Applica patch notifiche su database esistente

Se il database esiste già e NON vuoi fare reset, esegui prima [`PATCH_notifications.sql`](./PATCH_notifications.sql). Aggiunge permessi, realtime, push subscriptions e campi necessari a reminder prima/durante/dopo la dose.

## 3. Deploy edge functions `dose-scheduler` e `push-sender`

Serve la Supabase CLI installata (`brew install supabase/tap/supabase` o `scoop install supabase`).

```bash
# Nella root del progetto
supabase login
supabase link --project-ref <IL_TUO_PROJECT_REF>
supabase functions deploy push-sender --no-verify-jwt
supabase functions deploy dose-scheduler --no-verify-jwt
```

`dose-scheduler` usa `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` del runtime. `push-sender` richiede anche `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.

**In alternativa senza CLI:** crea le function `dose-scheduler` e `push-sender`, incolla i rispettivi file in `supabase/functions/.../index.ts` e disattiva "Verify JWT".

## 4. Attiva pg_cron per invocare la function ogni minuto

Nel **SQL Editor**, esegui una volta:

```sql
select cron.schedule(
  'familymed-dose-scheduler',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://<IL_TUO_PROJECT_REF>.supabase.co/functions/v1/dose-scheduler',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <IL_TUO_SUPABASE_ANON_KEY>',
      'Content-Type', 'application/json'
    )
  );
  $$
);
```

Sostituisci `<IL_TUO_PROJECT_REF>` e `<IL_TUO_SUPABASE_ANON_KEY>` (li trovi in **Project Settings → API**).

Per fermarlo: `select cron.unschedule('familymed-dose-scheduler');`

## 5. Auth — URL configuration

In **Authentication → URL Configuration** aggiungi ai *Redirect URLs*:

- `https://<tuo-dominio-lovable>/reset-password`
- `http://localhost:5173/reset-password` (per dev locale)

## 6. Test rapido

1. Registrati come **caregiver** dall'app.
2. Registrati (in un altro browser/incognito) come **paziente**.
3. Dal caregiver, tab "Tutti i pazienti" → clic su **Segui**.
4. Crea una terapia con orario tra 2 minuti.
5. Il paziente riceve: promemoria prima, allarme all'orario, avviso "cura dimenticata" dopo il timeout.
6. Il caregiver vede le stesse tappe e le azioni del paziente: conferma, rimando, dose dimenticata.
