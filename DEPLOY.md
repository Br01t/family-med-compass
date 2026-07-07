# FamilyMed v2 — Deploy sul tuo Supabase esterno

## 1. Reset del database

1. Apri **Supabase Studio → SQL Editor → New query**.
2. Copia tutto il contenuto di [`RESET.sql`](./RESET.sql) e clicca **Run**.
3. Verifica in **Table Editor** che siano state create: `profiles`, `user_roles`, `patients`, `caregivers`, `caregiver_patients`, `therapies`, `events`, `stock_movements`, `notifications`.

> ⚠️ Lo script droppa e ricrea lo schema `public`. Tutti i dati esistenti vengono eliminati (come richiesto).

## 2. Deploy edge function `dose-scheduler`

Serve la Supabase CLI installata (`brew install supabase/tap/supabase` o `scoop install supabase`).

```bash
# Nella root del progetto
supabase login
supabase link --project-ref <IL_TUO_PROJECT_REF>
supabase functions deploy dose-scheduler --no-verify-jwt
```

Le variabili `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` sono impostate automaticamente dal runtime edge, non servono config aggiuntive.

**In alternativa senza CLI:** dal dashboard vai su **Edge Functions → Create a new function** chiamata `dose-scheduler` e incolla il contenuto di `supabase/functions/dose-scheduler/index.ts`. Disattiva "Verify JWT".

## 3. Attiva pg_cron per invocare la function ogni minuto

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

## 4. Auth — URL configuration

In **Authentication → URL Configuration** aggiungi ai *Redirect URLs*:

- `https://<tuo-dominio-lovable>/reset-password`
- `http://localhost:5173/reset-password` (per dev locale)

## 5. Test rapido

1. Registrati come **caregiver** dall'app.
2. Registrati (in un altro browser/incognito) come **paziente**.
3. Dal caregiver, tab "Tutti i pazienti" → clic su **Segui**.
4. Crea una terapia con orario tra 2 minuti.
5. Entro 10 min il paziente riceverà la notifica reminder; passati 10 min oltre l'orario senza conferma, il caregiver riceverà "missed".
