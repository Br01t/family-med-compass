# Deploy gratuito su Cloudflare Workers

FamilyMed è una app TanStack Start che builda in output Cloudflare (Worker + asset statici). Il piano gratuito di Cloudflare Workers è sufficiente per progetti piccoli/medi (100.000 richieste/giorno).

## 1. Prerequisiti

- Account Cloudflare gratuito → https://dash.cloudflare.com/sign-up
- Node/Bun installato in locale
- Installa Wrangler:
  ```bash
  bun add -D wrangler
  # oppure globale: npm i -g wrangler
  ```
- Login:
  ```bash
  bunx wrangler login
  ```

## 2. Configura le variabili d'ambiente

### 2a. `.env` locale (OBBLIGATORIO prima del build)

Vite inlinea le `VITE_*` **dentro il bundle JS al momento del build**. Se manca il `.env`, il sito deployato punta ai placeholder e vedrai errori tipo `ERR_NAME_NOT_RESOLVED` verso `placeholder-project.supabase.co`.

Crea `.env` nella root del progetto:

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
VITE_SUPABASE_PROJECT_ID=<project-ref>
```

Questi valori sono pubblici (publishable key + URL), ma aggiungi comunque `.env` al `.gitignore`.

### 2b. Secret runtime del Worker (server-side)

Servono solo per SSR / server functions, NON per il codice client:

```bash
bunx wrangler secret put SUPABASE_URL
bunx wrangler secret put SUPABASE_PUBLISHABLE_KEY
bunx wrangler secret put VAPID_PUBLIC_KEY
bunx wrangler secret put VAPID_PRIVATE_KEY
bunx wrangler secret put VAPID_SUBJECT
```

## 3. Build & deploy

```bash
bun install
bun run build          # genera .output/server + .output/public
bunx wrangler deploy   # deploya usando wrangler.toml
```

Al primo deploy Cloudflare ti assegna un URL tipo `https://familymed.<tuo-account>.workers.dev`.

## 4. Dominio personalizzato (opzionale)

Dashboard Cloudflare → Workers & Pages → familymed → Settings → Domains & Routes → Add Custom Domain.

## 5. Aggiornamenti

Ogni volta che modifichi codice:

```bash
bun run build && bunx wrangler deploy
```

## 6. Backend (Supabase / Lovable Cloud)

Il backend rimane su Supabase — Cloudflare ospita solo il frontend + il server SSR di TanStack Start. Per il setup del database e delle edge function (`dose-scheduler`, `push-sender`, cron, redirect URL auth) vedi `DEPLOY.md`.

**Importante**: dopo il primo deploy aggiungi l'URL Cloudflare tra i *Redirect URLs* del provider auth Supabase, altrimenti login/reset password non funzionano.
