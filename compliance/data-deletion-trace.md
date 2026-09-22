# Data Deletion Trace — "Dove rimangono copie dei dati dopo la cancellazione?"

**Progetto:** FamilyMed
**Data:** 15 Settembre 2026
**Relazione con altri documenti:** `compliance/deletion-procedure.md` descrive
*come* si cancella (RPC `delete_my_account()`). Questo documento risponde alla
domanda diversa e complementare: **dopo quella cancellazione, dove possono
sopravvivere copie dei dati, per quanto tempo, ed è documentato?**

---

## 1. Mappa di tutti i punti in cui un dato può sopravvivere

```
                    ┌─────────────────────────┐
                    │   delete_my_account()    │
                    │   (RPC, esegue i DELETE)  │
                    └───────────┬───────────────┘
                                │
        ┌───────────────────────┼───────────────────────────┐
        ▼                       ▼                           ▼
┌───────────────┐     ┌──────────────────┐         ┌──────────────────┐
│ Postgres righe │     │ Postgres backup/  │         │ Supabase Storage  │
│ (tabelle app)  │     │ PITR (snapshot)    │         │ bucket            │
│ ✅ cancellate   │     │ ⚠️ sopravvivono    │         │ therapy-photos     │
│ subito          │     │ fino a rotazione   │         │ 🔴 NON cancellati  │
│                │     │ del backup          │         │ mai (bug trovato) │
└───────────────┘     └──────────────────┘         └──────────────────┘
        │
        ▼
┌────────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ audit_log            │     │ Log Cloudflare     │     │ Email già inviate │
│ (log applicativo)    │     │ Workers / WAF       │     │ (conferma, reset)  │
│ ⚠️ la riga            │     │ ⚠️ non sotto         │     │ ✅ fuori scope: una │
│ "account_deleted"     │     │ controllo di        │     │ email già recapitata│
│ con nome in chiaro    │     │ delete_my_account,  │     │ nella casella di    │
│ resta fino a 90gg     │     │ retention non        │     │ posta dell'utente   │
│ (cron già presente)   │     │ documentata          │     │ non è cancellabile  │
└────────────────────┘     └──────────────────┘     └──────────────────┘
        │
        ▼
┌────────────────────┐     ┌──────────────────┐
│ PDF report            │     │ Analytics           │
│ ✅ generato client-side │     │ ❌ N/A: nessun        │
│ (jsPDF), mai caricato   │     │ analytics in uso     │
│ su server → non è un   │     │ (verificato in        │
│ punto di persistenza   │     │ subprocessor-audit)   │
│ lato FamilyMed          │     │                      │
└────────────────────┘     └──────────────────┘
```

## 2. Verdetto per ciascun nodo

| Nodo | Sopravvive alla cancellazione? | Per quanto tempo | È documentato? |
|---|---|---|---|
| Righe Postgres nelle tabelle applicative | No | — | ✅ `deletion-procedure.md` |
| Backup/PITR di Postgres | **No — confermato** | Il progetto è sul piano **Free** di Supabase (confermato: `supabase projects list` mostra un solo progetto, nessun upgrade a Pro). Il piano Free **non include backup automatici né PITR** in nessuna forma (verificato nella documentazione ufficiale Supabase 2026): questo nodo del diagramma **non esiste per questo progetto**. Se in futuro passerete a Pro, torna a esistere con retention di 7 giorni di default. `deletion-procedure.md` va aggiornato per togliere il riferimento generico a "7-30 giorni a seconda del piano" e dire semplicemente "nessun backup sul piano attuale". | ✅ Confermato, non più da verificare |
| **Supabase Storage (`therapy-photos`)** | **Sì, sempre, indefinitamente** | ∞ (nessun meccanismo di scadenza/pulizia) | 🔴 **No** — gap reale trovato oggi, vedi §3 |
| `audit_log` (riga `account_deleted` con nome in chiaro) | Sì | Max 90 giorni (cron `audit-log-cleanup-daily`, già esistente e documentato in `retention-policy.md`) | ✅ Sì, anche se non era stato collegato esplicitamente allo scenario "dopo la cancellazione account" — lo collego qui esplicitamente |
| Log Cloudflare (Workers/WAF, IP delle richieste) | Sì, indipendentemente dall'account applicativo (i log sono per IP/richiesta HTTP, non per user id) | ⚠️ Non documentata nel repo — dipende dal piano/prodotto Cloudflare (Logpush vs log base) | ⚠️ No — da aggiungere a `retention-policy.md` dopo verifica in Dashboard |
| Email transazionali già recapitate | Sì (fuori dal controllo tecnico di FamilyMed: vive nella casella email dell'utente e nei log del provider SMTP) | Dipende dal provider SMTP (§4 di `subprocessor-audit-checklist.md`, ancora da identificare con certezza) | ⚠️ No |
| PDF di resoconto terapia | **Non applicabile**: generato interamente lato client (`jsPDF`, `src/lib/therapy-report.ts`) e scaricato direttamente nel browser dell'utente — **non transita né viene salvato sui server FamilyMed**. Una volta scaricato, la sua conservazione dipende dal dispositivo dell'utente, fuori perimetro. | — | ✅ Chiarito qui per la prima volta (non era esplicito altrove) |
| Analytics | Non applicabile — nessun fornitore di analytics attivo | — | ✅ |
| Cache locale del browser (`localStorage`, cache Service Worker) | In teoria potrebbe restare fino al prossimo `resetDemoData()`/pulizia esplicita | Il flusso di cancellazione già invoca la pulizia locale (`deletion-procedure.md` §2.3) | ✅ |

---

## 3. 🔴 Gap trovato: le foto delle terapie non vengono mai cancellate

`delete_my_account()` esegue `DELETE FROM public.therapies WHERE patient_id = ...`
(e le tabelle collegate via `ON DELETE CASCADE`), ma questo **cancella solo la
riga della tabella `therapies`**, cioè il record che contiene l'URL pubblico
della foto (`photo_package`/`photo_drug`). **Non cancella il file fisico** nel
bucket Supabase Storage `therapy-photos`.

Il file è caricato con un path prevedibile e stabile:
```
therapies/{therapyId}/{drug|package}-{timestamp}.{ext}
```
ed è servito tramite **URL pubblico** (`getPublicUrl()`, vedi
`src/lib/supabase-service.ts`), cioè senza controllo di autenticazione al momento
della lettura del file. Conseguenza pratica:

> Dopo che un utente cancella l'account, la foto della confezione del farmaco che
> aveva caricato **resta accessibile in eterno** a chiunque possieda o recuperi
> quell'URL (cronologia browser, screenshot condivisi, cache di terzi, ecc.),
> anche se in DB non esiste più alcuna traccia della terapia o del paziente.

Questo era già annotato in `deletion-procedure.md` §4.2 in modo generico ("i file
fisici non vengono eliminati in automatico quando la riga viene cancellata via
SQL"), ma qui lo confermo esplicitamente anche per il caso specifico
"cancellazione account", che è lo scenario a maggior impatto GDPR (diritto
all'oblio), non solo per la cancellazione di una singola terapia.

### 3.1 Fix proposto

Poiché le funzioni SQL di Postgres non possono chiamare l'API di Supabase
Storage direttamente, la pulizia va fatta **lato client, prima** di invocare
`delete_my_account()` (mentre le righe `therapies` — necessarie per sapere quali
path cancellare — esistono ancora):

```ts
// src/components/AccountDataCard.tsx — prima di supabase.rpc("delete_my_account")

async function purgeOwnedTherapyPhotos() {
  if (!supabase) return;
  const { data: patients } = await supabase
    .from("patients")
    .select("id")
    .or(`user_id.eq.${userId},owner_user_id.eq.${userId}`);

  for (const patient of patients ?? []) {
    const { data: therapies } = await supabase
      .from("therapies")
      .select("id")
      .eq("patient_id", patient.id);

    for (const therapy of therapies ?? []) {
      const { data: files } = await supabase.storage
        .from("therapy-photos")
        .list(`therapies/${therapy.id}`);
      if (files && files.length > 0) {
        const paths = files.map((f) => `therapies/${therapy.id}/${f.name}`);
        await supabase.storage.from("therapy-photos").remove(paths);
      }
    }
  }
}

// nel gestore del pulsante "Elimina account e tutti i dati":
await purgeOwnedTherapyPhotos();
const { error } = await supabase.rpc("delete_my_account");
```

**Prerequisito da verificare:** le policy RLS del bucket `therapy-photos` (schema
`storage`, non `public` — non incluse in `supabase/schema_backup.sql`, quindi non
verificabili da qui) devono permettere all'utente autenticato di eseguire
`remove()` sui propri file. Se non esiste ancora una policy che lo consenta, va
creata (analoga, per logica, a `is_primary_of(patient_id)` ma applicata
all'oggetto storage tramite il suo `name`/path).

**Soluzione più robusta (consigliata per il medio termine):** spostare questa
pulizia in una Edge Function con `service_role` invocata dalla stessa RPC (o
subito prima), così la cancellazione non dipende dal completamento del client
(se l'utente chiude la scheda a metà, oggi la pulizia lato client si
interromperebbe) — fuori dallo scope immediato di questa modifica ma da mettere
in backlog.

---

## 4. Test end-to-end richiesto

**Non ho potuto eseguirlo dal vivo**: questo ambiente non ha le credenziali del
progetto Supabase reale (nessuna `SUPABASE_URL`/`SUPABASE_ANON_KEY` disponibile,
e comunque **non andrebbe mai eseguito contro il database di produzione**).
Preparo però lo script pronto perché il team lo esegua contro un **progetto
Supabase di staging/test** (mai produzione), più una checklist per la parte
client (upload foto, generazione PDF) che non è automatizzabile in puro SQL.

### 4.1 Script SQL (da eseguire nell'SQL editor di un progetto di TEST)

```sql
-- =====================================================================
-- TEST END-TO-END: crea un utente/paziente/terapia/eventi di prova,
-- verifica lo stato "prima", esegue delete_my_account(), verifica lo
-- stato "dopo" in OGNI tabella collegata.
-- ESEGUIRE SOLO SU UN PROGETTO SUPABASE DI STAGING/TEST.
-- =====================================================================

-- 1. Crea l'utente di test in auth.users (in alternativa: registrarsi
--    normalmente dalla UI con un'email usa-e-getta, più realistico
--    perché passa anche da Supabase Auth / trigger di creazione profilo).
--    Qui assumiamo che l'utente sia stato creato e il suo UUID sia noto:
--    sostituire 'TEST-UUID-QUI' con l'id reale (auth.users.id).

-- 2. Crea paziente, terapia, evento di test come farebbe l'app
--    (via client, per rispettare i trigger/limiti di piano già presenti,
--    non con INSERT diretti che aggirerebbero le regole di business).
--    -> Fare questa parte manualmente dalla UI in staging:
--       registrazione -> aggiungi paziente -> aggiungi terapia con foto
--       -> genera il resoconto PDF -> conferma una dose.

-- 3. FOTOGRAFIA "PRIMA" — annotare gli id generati e contare le righe:
SELECT 'patients' AS tabella, count(*) FROM public.patients WHERE owner_user_id = 'TEST-UUID-QUI'
UNION ALL SELECT 'therapies', count(*) FROM public.therapies WHERE patient_id IN (SELECT id FROM public.patients WHERE owner_user_id = 'TEST-UUID-QUI')
UNION ALL SELECT 'events', count(*) FROM public.events WHERE patient_id IN (SELECT id FROM public.patients WHERE owner_user_id = 'TEST-UUID-QUI')
UNION ALL SELECT 'caregiver_patients', count(*) FROM public.caregiver_patients WHERE caregiver_id = 'TEST-UUID-QUI'
UNION ALL SELECT 'profiles', count(*) FROM public.profiles WHERE id = 'TEST-UUID-QUI'
UNION ALL SELECT 'user_consents', count(*) FROM public.user_consents WHERE user_id = 'TEST-UUID-QUI'
UNION ALL SELECT 'audit_log (tutte le righe di questo attore)', count(*) FROM public.audit_log WHERE actor_id = 'TEST-UUID-QUI';

-- Annotare anche manualmente, dal Dashboard -> Storage -> therapy-photos:
-- il/i path caricati, es. therapies/<therapy_id>/package-....jpg

-- 4. ESECUZIONE DELLA CANCELLAZIONE (come utente autenticato, non come
--    service_role, per testare esattamente ciò che fa l'app reale):
--    dalla UI: Impostazioni -> Elimina account -> conferma -> "ELIMINA"
--    oppure, autenticati come quell'utente via client SDK:
--    supabase.rpc('delete_my_account')

-- 5. FOTOGRAFIA "DOPO" — rieseguire (da un ruolo con privilegi, es.
--    service_role/SQL editor, perché l'utente non esiste più e le sue
--    query autenticate non sarebbero più possibili):
SELECT 'auth.users' AS tabella, count(*) FROM auth.users WHERE id = 'TEST-UUID-QUI'
UNION ALL SELECT 'patients (dovrebbero essere 0)', count(*) FROM public.patients WHERE owner_user_id = 'TEST-UUID-QUI'
UNION ALL SELECT 'therapies (dovrebbero essere 0)', count(*) FROM public.therapies WHERE patient_id NOT IN (SELECT id FROM public.patients)
UNION ALL SELECT 'caregiver_patients (dovrebbero essere 0)', count(*) FROM public.caregiver_patients WHERE caregiver_id = 'TEST-UUID-QUI'
UNION ALL SELECT 'profiles (dovrebbero essere 0)', count(*) FROM public.profiles WHERE id = 'TEST-UUID-QUI'
UNION ALL SELECT 'user_consents (dovrebbero essere 0)', count(*) FROM public.user_consents WHERE user_id = 'TEST-UUID-QUI'
UNION ALL SELECT 'audit_log — riga account_deleted (dovrebbe essere 1, per i 90gg successivi)', count(*)
  FROM public.audit_log WHERE actor_id = 'TEST-UUID-QUI' AND action = 'account_deleted';

-- Verifica esplicita del contenuto rimasto nell'audit log (nome in chiaro):
SELECT actor_id, actor_name, action, summary, created_at
FROM public.audit_log
WHERE actor_id = 'TEST-UUID-QUI'
ORDER BY created_at DESC;

-- 6. VERIFICA STORAGE (dal Dashboard -> Storage -> therapy-photos, oppure
--    via client con service_role):
--    -> cercare il path annotato al punto 3. Con il bug attuale (§3),
--       il file SARÀ ANCORA LÌ. Dopo aver applicato il fix di §3.1,
--       questa lista dovrebbe risultare vuota.

-- 7. VERIFICA BACKUP/PITR: non testabile via SQL — richiede di avviare
--    un ripristino di test (operazione delicata, da NON fare su
--    produzione) o semplicemente documentare la retention dichiarata dal
--    piano Supabase attivo, come da §2 di questo documento.
```

### 4.2 Checklist manuale (parti non automatizzabili in SQL)

- [ ] Registrare un utente di test con email usa-e-getta.
- [ ] Creare un paziente, una terapia **con foto caricata** (drug e package).
- [ ] Confermare almeno una dose (per popolare `events`).
- [ ] Generare il resoconto PDF dalla pagina Terapie → verificare che il
      download avvenga **senza alcuna chiamata di rete verso Supabase Storage
      o verso un endpoint di generazione server-side** (controllare la tab
      Network del browser: dovrebbero comparire solo chiamate di lettura dati,
      nessun upload/POST legato al PDF stesso).
- [ ] Annotare l'URL pubblico della foto caricata (visibile aprendo la
      DevTools o direttamente dal Dashboard Storage).
- [ ] Eliminare l'account dalla UI.
- [ ] Aprire l'URL della foto annotato **in una finestra anonima, da
      disconnesso**: oggi risponderà ancora con l'immagine (conferma del bug
      di §3); dopo il fix, dovrebbe risultare 404/non trovato.
- [ ] Verificare via SQL editor (script sopra) che tutte le righe collegate
      siano sparite, tranne la riga `audit_log` con `action='account_deleted'`
      (attesa, e correttamente a scadenza 90 giorni).