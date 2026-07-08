## Diagnosi

La preflight `OPTIONS` verso `push-sender` risponde **HTTP 500 `WORKER_ERROR` "Function exited due to an error"**. Non è un problema di header CORS: la function crasha all'avvio, quindi il runtime Supabase risponde 500 anche alla preflight e il browser blocca tutto con l'errore CORS che vedi.

Causa quasi certa: nel tuo Supabase esterno (`qdwadqkpobtxivlypbio`) mancano (o hanno valore vuoto) uno o più dei secret `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Il file `supabase/functions/push-sender/index.ts` li legge con `Deno.env.get("...")!` a livello di modulo e chiama subito `webpush.setVapidDetails(...)`: se uno è mancante il modulo esplode al boot → 500 su qualsiasi richiesta, preflight compresa.

Stesso pattern potrebbe colpire `dose-scheduler` e `dose-action` quando li richiami.

## Cosa farò

### 1. `supabase/functions/push-sender/index.ts` — boot resiliente
- Rispondere `OPTIONS` **subito**, prima di leggere env o importare `web-push`, con gli header CORS attuali (aggiungo `apikey`, `x-client-info` che già ci sono, e `Access-Control-Max-Age`).
- Spostare `webpush.setVapidDetails(...)` dentro un init lazy chiamato solo dentro l'handler `POST`, in `try/catch`, così un secret mancante restituisce un JSON `500 {error:"missing VAPID_*"}` invece di crashare il worker.
- Ritornare errore esplicito e leggibile se `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` non sono impostati.

### 2. Stesso trattamento a `dose-scheduler` e `dose-action`
- OPTIONS gestito prima di qualunque `Deno.env.get(...)!` o import pesante.
- Env obbligatorie lette dentro l'handler, con errore JSON chiaro se mancano.

### 3. Nessuna modifica al DB o al frontend
Il codice client (`src/lib/push-subscription.ts`, service worker) è già corretto: passa da `supabase.functions.invoke` che imposta gli header giusti. Il problema è solo lato edge function.

### 4. Istruzioni di re-deploy (da eseguire tu, Supabase esterno)
Dopo che avrò aggiornato i file:

```bash
supabase functions deploy push-sender --no-verify-jwt
supabase functions deploy dose-scheduler --no-verify-jwt
supabase functions deploy dose-action --no-verify-jwt
```

E verifica/imposta i secret nel tuo Supabase:

```bash
supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:tu@dominio
```

(I VAPID keys devono essere gli **stessi** già usati lato client in `src/lib/vapid.ts`, altrimenti le subscription salvate non sono valide.)

### 5. Verifica
Dopo il redeploy, ripeterò la preflight via `curl -X OPTIONS` verso `push-sender`: deve tornare `204` con gli header `Access-Control-Allow-*`. Poi da telefono "Registra dispositivo" → deve funzionare e la notifica di test deve arrivare.

## Dettagli tecnici

- Root cause: top-level throw in Deno edge → il runtime marca la function come non healthy e serve `500 WORKER_ERROR` su ogni metodo, inclusa `OPTIONS`, che il browser interpreta come "preflight didn't pass".
- Fix pattern standard: `if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });` come prima riga dell'handler, e init dei secret lazy dentro il `POST`.
