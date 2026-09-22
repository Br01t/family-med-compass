# Logging Audit — Report e Remediation

**Data:** 15 Settembre 2026
**Perimetro:** intero `src/` (client React/TanStack Start) + `supabase/functions/` (Edge Functions Deno).

---

## 1. Cosa è stato cercato

Ricerca di tutte le chiamate `console.log`, `console.error`, `console.warn`,
`console.info`, `console.debug` nel codice applicativo, incrociata con i punti in
cui si maneggiano oggetti "di dominio" potenzialmente sensibili: `patient`,
`therapy`, `medication`/`farmaco`, `dose`, `diary`/`diario`, `vitals`, `notes`.

**Risultato:** 75 occorrenze totali (74 in `src/`, 1 in `supabase/functions/`).

## 2. Cosa è stato trovato

Buona notizia: **nessuna chiamata loggava direttamente un oggetto di dominio
completo** (niente `console.log("Creating therapy", therapy)` con nome/dosaggio in
chiaro). Il pattern dominante era invece:

```ts
console.error("[AddTherapyDialog] salvataggio fallito:", err);
```

dove `err` è quasi sempre un `Error` o un `PostgrestError` di Supabase. Il rischio
reale qui non è "nome del paziente in console", ma due cose più subdole:

1. **`PostgrestError.details`/`.hint`** possono contenere frammenti dei valori
   coinvolti in una violazione di vincolo (es. `Key (email)=(...) already exists`
   — capita raramente con dati sanitari diretti, ma è comunque un campo da non
   loggare mai in blocco, per policy).
2. **Nessun controllo centralizzato**: ogni file decideva da solo cosa loggare,
   quindi bastava una futura modifica ("aggiungo `console.log(patient)` per
   debuggare") per introdurre una fuga di dati sanitari senza che nessuno se ne
   accorgesse in review.

Un solo punto era già corretto per definizione ed è stato lasciato invariato:
`supabase/functions/dose-scheduler/index.ts:88`, che logga solo `error.message`
(stringa), mai la riga di notifica.

## 3. Cosa è stato fatto

### 3.1 Nuovo modulo `src/lib/logger.ts`
Wrapper centralizzato con queste garanzie:
- **Errori sanitizzati sempre**: `logger.warn(msg, err)` / `logger.error(msg, err)`
  riducono qualunque errore a `{ message, code, name }`, scartando `details`/`hint`
  e qualunque altro campo custom. Anche se in futuro un `err` dovesse contenere
  un payload di dominio annidato, non finirebbe mai in console.
- **Metadati solo primitivi**: `logger.info(msg, meta)` accetta solo
  stringhe/numeri/booleani come valori di `meta` — un oggetto o array passato per
  errore viene scartato in silenzio, non stampato. Così `logger.info("Therapy
  created", { therapyId, userId })` funziona, ma un ipotetico
  `logger.info("Therapy created", { therapy })` non stamperebbe l'oggetto.
- **`debug`/`info` silenziati in produzione**: riducono il rumore (e quindi il
  volume di log) sui Cloudflare Workers e sulle Supabase Edge Functions, dove sul
  piano free la retention/quota dei log è limitata. Non è un vincolo per il
  client-side in sé (i log del browser non "costano" nulla a Supabase), ma per le
  parti server-side (`src/server.ts`, `src/start.ts`, edge functions) sì.
- **`warn`/`error` restano sempre attivi**, sanitizzati: servono per diagnosticare
  problemi in produzione.

### 3.2 Sostituzione in tutto il codice applicativo
Tutte le 74 chiamate `console.*` in `src/` sono state sostituite con
`logger.debug/info/warn/error`, aggiungendo import `logger` dove mancava. In
particolare, sono stati corretti a mano i casi con firma diversa da
`(message, err?)`, aggiungendo un messaggio descrittivo dove ne mancava uno
(es. `console.error(err)` → `logger.error("[dose-da-confermare] Conferma dose
fallita", err)`), così anche i log restano leggibili e non solo "sicuri".

File toccati (21):
`src/components/{AccountDataCard,AddPatientDialog,AddTherapyDialog,AlarmRinger,MfaSecurityCard,TurnstileWidget}.tsx`,
`src/integrations/supabase/{client,client.server,auth-middleware}.ts`,
`src/lib/{supabase-service,store,auth-service,feature-toggles,feedback}.ts`,
`src/lib/services/notifications.ts`,
`src/routes/{__root,registrati,storico-report,dose-da-confermare,impostazioni}.tsx`,
`src/server.ts`, `src/start.ts`.

`supabase/functions/dose-scheduler/index.ts` non è stato toccato: gira su Deno
(risoluzione moduli diversa da Vite/TanStack, non può importare `@/lib/logger`
così com'è) ed era già conforme (logga solo `error.message`). Se in futuro si
aggiungono altre Edge Functions con logging più ricco, vale la pena estrarre una
versione minima dello stesso sanitizzatore in `supabase/functions/_shared/`.

### 3.3 Verifica
- `npx tsc --noEmit` → 0 errori.
- `npx eslint` sui file toccati → **nessun nuovo errore introdotto** rispetto allo
  stato precedente (confrontato file per file con `git stash`); i pochi errori
  `prettier/prettier` residui in 3 file di `src/integrations/supabase/` sono
  debito tecnico pre-esistente (quote style), non introdotto da questa modifica.

## 4. Cosa NON è ancora coperto (follow-up consigliati)

1. **Nessun linter automatico blocca un futuro `console.log(patient)`.** Consiglio:
   aggiungere la regola ESLint `no-console` (con eccezione per `src/lib/logger.ts`
   stesso) in `eslint.config.js`, così qualsiasi nuovo `console.*` fallisce in CI
   invece di passare in review per distrazione.
2. **Se in futuro verrà aggiunto un error tracker esterno** (Sentry, LogRocket,
   ecc. — al momento non presente nel repo, verificato), va integrato **a valle**
   di `logger.ts` (cioè `logger.error` deve inviare al servizio esterno solo i
   campi già sanitizzati), mai agganciando l'SDK direttamente ai `console.error`
   grezzi sparsi nel codice.
3. **`row.id` e altri identificativi UUID** vengono ora inclusi nei messaggi di
   log per contesto (es. `[migrateAllTherapyPhotosToStorage] errore su terapia
   ${row.id}`): sono identificativi tecnici, non dati sanitari, e sono
   necessari per correlare un errore a un record durante il debug — scelta
   intenzionale, coerente con le regole del logger.