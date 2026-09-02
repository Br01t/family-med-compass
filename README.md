# FamilyMed [nome definitivo da confermare]

App per la gestione familiare delle terapie: promemoria dosi, scorte farmaci, monitoraggio parametri vitali e coordinamento tra caregiver e paziente. In italiano, pensata per famiglie che gestiscono terapie di un parente (spesso anziano o non autonomo nell'uso dell'app).

## Stack

- **Frontend:** React 19 + TanStack Start (SSR) + TanStack Router, Tailwind CSS
- **Backend:** Supabase (Postgres, Auth, Realtime, Storage, cron via `pg_cron`)
- **Deploy:** Cloudflare Pages/Workers
- **Grafici:** Recharts
- **PDF:** jsPDF (report terapie/parametri esportabili)

## Setup locale

```bash
npm install
cp .env.example .env   # poi compila i valori, vedi sotto
npm run dev
```

L'app parte su `http://localhost:5173` (porta di default Vite).

### Variabili d'ambiente

Vedi `.env.example` per l'elenco completo con spiegazione di ognuna. In sintesi:

- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — pubbliche, dal progetto Supabase (Project Settings → API)
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — **solo server-side**, mai esporle al client. Usate per operazioni con privilegi admin (script di migrazione, funzioni server)
- `VITE_TURNSTILE_SITE_KEY` — opzionale in sviluppo, obbligatoria in produzione se il captcha è attivo su Supabase Auth

## Script disponibili

| Comando | Cosa fa |
|---|---|
| `npm run dev` | Avvia il server di sviluppo |
| `npm run build` | Build di produzione |
| `npm run preview` | Serve la build di produzione in locale |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

## Database e migrazioni

Lo schema vive in `supabase/migrations/`, applicato tramite [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase login
supabase link --project-ref <il-tuo-project-ref>
supabase db pull    # sincronizza le migrazioni locali con lo stato reale del DB
supabase db push    # applica nuove migrazioni al DB remoto
```

**Non incollare più SQL direttamente nell'SQL Editor di Supabase per modifiche permanenti allo schema** — usa `supabase migration new <nome>` per creare un file versionato, così lo schema resta ricostruibile da zero e verificabile in code review. L'SQL Editor va bene solo per query di lettura/debug estemporaneo.

## Struttura del progetto

```
src/
  routes/          Pagine (file-based routing di TanStack Router)
  components/      Componenti riutilizzabili
  lib/             Logica di business, servizi Supabase, utility
  integrations/    Client Supabase (client.ts per il browser, client.server.ts solo server)
supabase/
  migrations/      Schema del database, versionato
  functions/       Edge functions (attualmente nessuna: dose-scheduler è stata
                    sostituita da una funzione PL/pgSQL nativa schedulata via pg_cron)
```

## Sicurezza — cose da sapere prima di modificare il codice

- **Row Level Security (RLS)** è attiva su tutte le tabelle con dati utente: qualsiasi nuova tabella con dati sensibili deve avere RLS abilitata e policy esplicite prima del deploy.
- Le foto (farmaco/confezione) vanno **sempre** su Supabase Storage (bucket `therapy-photos`), mai salvate come base64 direttamente nelle colonne del DB — un vincolo SQL lo impedisce a livello di database (`therapies_photo_drug_not_base64` / `therapies_photo_package_not_base64`).
- `SUPABASE_SERVICE_ROLE_KEY` bypassa ogni RLS: va usata solo in contesti server-side o script eseguiti manualmente da terminale, mai nel codice del client.

## Licenza e titolarità

[Da compilare quando definiti i dati della tua attività — vedi `src/routes/privacy.tsx` sezione 1]