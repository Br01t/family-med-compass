# Security Audit Tecnico — Authentication, Authorization, Supabase RLS

**Data:** 15 Settembre 2026
**Metodo:** revisione statica del codice (`src/`), dello schema Postgres
(`supabase/schema_backup.sql` — 16 tabelle, 53 funzioni, tutte le policy RLS),
della configurazione (`supabase/config.toml`) e delle Edge Functions.
**Non è stato eseguito un penetration test dal vivo** (nessun accesso al progetto
Supabase reale): alcuni item richiedono una verifica nella Dashboard, indicata
esplicitamente dove serve.

## Sintesi per chi ha poco tempo

| # | Cosa | Severità | Dove |
|---|---|---|---|
| 1 | `audit_log`: chiunque sia autenticato può leggere nome + azione GDPR (export/cancellazione account) di **qualunque altro utente** | 🔴 **Critica** | §3.1 |
| 2 | `caregiver_patients` non ha una policy INSERT: il collegamento caregiver↔paziente creato durante "aggiungi paziente" viene probabilmente rifiutato dalla RLS, con effetti a cascata su audit/cronologia/note cifrate | 🟠 **Alta** | §3.2 |
| 3 | `check_caregiver_invite_limit()` referenzia una colonna (`owner_id`) che non esiste sulla tabella `patients` → il trigger va in errore ad ogni redenzione di un codice invito | 🟠 **Alta (funzionale)** | §3.3 |
| 4 | ~~`dose-scheduler` raggiungibile senza autenticazione~~ — **CORREZIONE (18/09): non applicabile.** Verificato su Dashboard → Edge Functions: nessuna funzione è mai stata deployata. Il codice esisteva nel repo ma non è mai stato pubblicato, ed è stato rimosso in questa pulizia. L'unico scheduler realmente attivo è `process_dose_schedule()`, nativo in Postgres via `pg_cron` — non raggiungibile via HTTP, non richiede questo fix. | ~~🟠 Alta~~ ❌ Non applicabile | §4.1 |
| 5 | Rate limiting/lockout di login sono **solo client-side** (stato React in memoria) — bypassabili ricaricando la pagina o chiamando l'API Supabase direttamente | 🟡 **Media** | §2.6 |
| 6 | CSP con `script-src 'unsafe-inline'` + token di sessione in `localStorage` → un XSS diventerebbe furto di sessione completo | 🟡 **Media** | §2.7 |
| 7 | Config Auth di Supabase (MFA obbligatoria, policy password, rate limit server-side, leaked-password protection) non è in `supabase/config.toml` → non verificabile da codice, solo da Dashboard | 🔵 Info | §2.8 |
| 8 | Tutto il resto (16/16 tabelle con RLS attiva, isolamento "User A → Patient B", differenziazione primario/secondario per terapie ed eventi, note cliniche cifrate con controllo autorizzazione anche nella funzione di decrypt, funzioni GDPR scoping corretto per `auth.uid()`, feature-gating vitali enforced anche lato DB) | ✅ Pass | §3, §5 |

---

## 1. Authentication

| Controllo | Stato | Note |
|---|---|---|
| **Password reset** | ✅ | `supabase.auth.resetPasswordForEmail` + redirect a `/reset-password`; risposta uniforme indipendentemente dall'esistenza dell'email (comportamento di default Supabase, non enumerabile). Cooldown 60s lato client (facilmente bypassabile, vedi §2.6) — ma Supabase applica comunque un rate limit server-side di default su questo endpoint. |
| **Session expiration** | ✅ | `persistSession: true`, `autoRefreshToken: true`; JWT a vita breve (1h, come documentato in `compliance/security-measures.md`) con refresh token rotation gestiti da Supabase Auth (GoTrue). |
| **Email verification** | ⚠️ Da verificare in Dashboard | Il codice non forza esplicitamente `email_confirmed_at` prima di concedere accesso alle route protette; dipende dal toggle "Confirm email" di Supabase Auth (non presente in `config.toml`, quindi gestito solo da Dashboard — verificare che sia **attivo**). |
| **MFA** | ✅ | TOTP opzionale via `supabase.auth.mfa` (`enroll`/`challenge`/`verify`), correttamente richiesto al login quando `aal.nextLevel === "aal2"` (`src/routes/login.tsx`). Ben implementato. |
| **Session revocation** | ⚠️ Parziale | `signOut()` presente (`store.tsx:851`). Non risulta però un **logout globale forzato** in punti critici: cambio password, attivazione MFA, o eliminazione account (`delete_my_account()` cancella la riga `auth.users`, il che di norma invalida le sessioni lato Supabase, ma non c'è un `auth.admin.signOut(scope:'global')` esplicito per lo scenario "ho attivato MFA, voglio invalidare le sessioni aal1 già aperte altrove"). |
| **Account enumeration** | ⚠️ Da verificare | Login: messaggio generico (Supabase di default non distingue "utente inesistente" da "password errata"). **Registrazione**: `formatAuthError()` inoltra il messaggio grezzo di Supabase in caso di email già registrata — se il progetto ha "Confirm email" attivo, Supabase per design non rivela l'esistenza dell'account in `signUp`; se disattivato, l'errore "User already registered" può diventare un canale di enumerazione. Verificare il comportamento reale in Dashboard/test manuale. |
| **Brute force / rate limiting** | ⚠️ Vedi §2.6 | Lockout progressivo (backoff 0/1/2/4/8s, blocco 5 minuti dopo 5 tentativi) implementato **solo lato client**. Cloudflare Turnstile è invece verificato **server-side** da Supabase (il `captchaToken` viene passato a `signInWithPassword`/`signUp`), quindi quella parte è un controllo reale, non solo UX. |

### 2.6 Dettaglio: rate limiting solo client-side
`failedAttempts`, `lockedUntil`, `lastResetRequest` in `src/routes/login.tsx` sono
`useRef`/variabili React: vivono solo nella tab del browser. Un attaccante che:
- ricarica la pagina, o
- chiama direttamente `POST https://<project>.supabase.co/auth/v1/token?grant_type=password`,

bypassa completamente lockout e backoff. La CAPTCHA Turnstile resta un ostacolo reale
(verificata server-side), ma non è detto sia sufficiente da sola contro un attacco
mirato con solver automatici o token riusati/prelevati in altro modo.
**Raccomandazione:** verificare in Dashboard Supabase → Authentication → Rate Limits
che i limiti nativi (per-IP, per-email) siano configurati in modo aggressivo, e
considerare di non fare affidamento sul countdown mostrato in UI come unica difesa.

### 2.7 Dettaglio: CSP `unsafe-inline` + token in localStorage
`src/server.ts` imposta `script-src 'self' 'unsafe-inline' ...`. `'unsafe-inline'`
neutralizza gran parte del valore anti-XSS della CSP (permette l'esecuzione di
qualunque script iniettato inline). Il client Supabase (`src/integrations/supabase/client.ts`)
usa storage di default (`localStorage`, tramite `brokeredPreviewStorage()` quando non
in preview Lovable) per il JWT di sessione. Combinazione: se in futuro venisse
introdotta una falla XSS (es. contenuto utente non sanitizzato renderizzato come HTML),
l'impatto sarebbe **furto completo della sessione**, non solo defacement.
**Raccomandazione:** se possibile rimuovere `'unsafe-inline'` da `script-src` (richiede
spostare lo script di hydration inline in un file esterno o usare un nonce/hash — da
valutare con TanStack Start), e mantenere una disciplina rigorosa di sanitizzazione per
qualunque contenuto utente mostrato come HTML (bio, note, nomi...).

### 2.8 Config Auth non versionata
`supabase/config.toml` non contiene una sezione `[auth]`: policy password minima,
MFA obbligatoria/opzionale, rate limit nativi, protezione password compromesse
("leaked password protection" di Supabase) sono quindi configurati **solo** nella
Dashboard, senza tracciabilità nel repository. La validazione password lato client
(`registrati.tsx`: min 8 caratteri, 1 lettera, 1 numero) **non ha equivalente
verificabile lato server** nel codice: se la policy minima di Supabase è più debole
(default storico: 6 caratteri), un client che bypassa la UI (chiamata diretta
all'API) potrebbe registrare una password più debole di quella pensata.
**Raccomandazione:** allineare "Minimum password length" e "Password requirements"
nella Dashboard Supabase alla stessa policy della UI (8+, lettera+numero), e
considerare di versionare questi parametri (Supabase CLI supporta `[auth]` in
`config.toml` da un certo punto in poi) per averne traccia in review.

---

## 2. Authorization — i due scenari richiesti

### Scenario A — `User A → Patient B` (nessuna relazione)
**Verificato: PASS.** La policy `"patients: silo read"` su `patients` è:
```sql
USING (user_id = auth.uid() OR owner_user_id = auth.uid() OR is_caregiver_of(id))
```
Per un utente A senza alcuna relazione con il paziente B, nessuna delle tre
condizioni è vera → **zero righe restituite**, sia in lettura che in scrittura
(le policy INSERT/UPDATE/DELETE hanno la stessa logica restrittiva). Lo stesso
pattern (owner/owner_user_id/caregiver collegato) è applicato coerentemente su
`therapies`, `events`, `patient_medical_profiles`, `stock_movements`,
`vital_signs`, `wellness_notes`, `notifications`, `adherence_monthly`. Non è
stato trovato nessun varco diretto via REST per questo scenario.

⚠️ **Eccezione trovata** (vedi §3.1): `audit_log` **non** segue questo pattern per
le righe con `patient_id IS NULL` — lì lo scenario "User A legge dati di User B"
si verifica davvero, anche se il dato non è "un paziente" ma un evento GDPR
personale di un altro utente.

### Scenario B — `Caregiver A → Patient B` (relazione reale, ruolo limitato)
**Verificato: PASS**, con un buon esempio di autorizzazione differenziata:

| Tabella | Caregiver secondario (in `caregiver_patients`, non primario) può... |
|---|---|
| `therapies` | Solo **leggere** (`insert`/`update`/`delete` richiedono `is_primary_of`) |
| `patient_medical_profiles` | Solo **leggere** |
| `events` (conferma/rimanda dose) | **Leggere e aggiornare** (per confermare le dosi), ma non creare/eliminare |
| `wellness_notes` | Leggere e **creare** (journal collaborativo), modificare solo le proprie note o se primario |
| `vital_signs` | Leggere/creare **solo se il piano del proprietario è pro/max** — enforced anche lato DB, non solo UI |
| `stock_movements` | Solo **leggere** (ledger immutabile, nessun UPDATE/DELETE per nessuno) |

Questo è esattamente il comportamento "vede solo ciò che il suo ruolo permette"
richiesto, ed è imposto a livello di database (RLS), non solo di UI — quindi
resiste anche a un client modificato o a chiamate dirette all'API REST.

---

## 3. Findings dettagliati

### 3.1 🔴 CRITICO — `audit_log` espone eventi GDPR di altri utenti

**Cosa succede:** sulla tabella `audit_log` esistono **due** policy SELECT
(probabilmente residuo di una migrazione/rename non ripulita):

```sql
CREATE POLICY "audit: read linked" ON audit_log FOR SELECT
  USING ( (patient_id IS NULL) OR ( EXISTS (... patients ...) ) );

CREATE POLICY "audit_log: read linked" ON audit_log FOR SELECT
  USING ( actor_id = auth.uid() OR (patient_id IS NOT NULL AND (owns_patient(...) OR is_caregiver_of(...))) );
```

In Postgres le policy permissive per lo stesso comando sono unite in **OR**: basta
che *una* delle due sia vera. La prima policy, per qualunque riga con
`patient_id IS NULL`, ha la clausola `(patient_id IS NULL) OR (...)` che risulta
**sempre vera**, indipendentemente da chi sia `auth.uid()`.

`log_gdpr_event('data_exported' | 'account_deleted')` — chiamata quando un utente
esporta i propri dati o cancella l'account — inserisce righe con **`patient_id =
NULL`** di default, e con un `summary` leggibile tipo *"Mario Rossi ha richiesto
la cancellazione dell'account"* (nome reale incluso).

**Risultato:** qualunque utente autenticato, con una singola query
`supabase.from('audit_log').select('*')`, può leggere nome e azione GDPR di
**tutti gli altri utenti della piattaforma** che hanno esportato i dati o
cancellato l'account. Non tocca dati sanitari direttamente, ma è un vero
authorization bug (IDOR) e un problema di riservatezza (associare un nome a
un'azione "ho cancellato il mio account medico" non è banale).

**Fix consigliato** (migrazione SQL, da rivedere e applicare):
```sql
-- La policy "audit: read linked" è quella difettosa: la condizione
-- "(patient_id IS NULL) OR (...)" concede accesso incondizionato quando
-- patient_id è NULL. "audit_log: read linked" copre già correttamente sia
-- il caso "sono l'attore" sia il caso "sono owner/caregiver del paziente".
DROP POLICY IF EXISTS "audit: read linked" ON public.audit_log;
```
Dopo il fix, verificare che `get_family_group_data()` (che legge `audit_log`
internamente, SECURITY DEFINER, con la propria autorizzazione replicata) e la UI
di "Gruppo di cura" continuino a funzionare — non dovrebbero essere toccate,
perché quella funzione non passa dalle policy RLS del chiamante per l'accesso
interno (gira come owner), ma è comunque il punto giusto da testare dopo la
modifica.

### 3.2 🟠 ALTO — `caregiver_patients` senza policy INSERT

Nessuna `CREATE POLICY ... FOR INSERT ON caregiver_patients` esiste per il ruolo
`authenticated`. Le uniche vie per inserire in questa tabella sono:
1. la funzione `redeem_family_invite()` (SECURITY DEFINER — corretto, previsto);
2. il codice client in `addPatientDoc()` (`src/lib/supabase-service.ts`), che fa
   `supabase.from("caregiver_patients").insert(relationRows)` **direttamente dal
   client**, per collegare un caregiver al paziente che ha appena creato lui
   stesso.

Il punto 2 **non passa da nessuna policy INSERT** e con RLS abilitata senza una
policy che lo permetta, l'INSERT viene rifiutato di default. Il codice logga
già l'errore (`logger.error("[addPatientDoc] Errore salvataggio relazioni:", ...)`)
senza bloccare il flusso, il che fa sospettare che questo fallimento sia già
noto/tollerato in produzione — ma ha un effetto a cascata: senza quella riga in
`caregiver_patients`, funzioni come `is_caregiver_of()`, `decrypt_therapy_note()`,
`get_patient_dose_history()`, e la policy corretta di `audit_log` (dopo il fix di
3.1) **non riconoscono il caregiver-proprietario come autorizzato**, perché
controllano `caregiver_patients`/`owns_patient()` (basato su `patients.user_id`)
e non sempre `patients.owner_user_id`.

**Fix consigliato:**
```sql
CREATE POLICY "cp: primary can self-insert" ON public.caregiver_patients
  FOR INSERT TO authenticated
  WITH CHECK (
    caregiver_id = auth.uid()
    AND public.is_primary_of(patient_id)
  );
```
Questo permette al caregiver che è già `owner_user_id`/`primary_caregiver_id` del
paziente (impostato dall'INSERT su `patients` immediatamente precedente nello
stesso flusso) di collegarsi da solo, senza aprire la porta a un utente qualunque
che si auto-assegni come caregiver di un paziente altrui.

### 3.3 🟠 ALTO (funzionale) — `check_caregiver_invite_limit()` referenzia una colonna inesistente

```sql
SELECT subscription_plan INTO v_plan
FROM public.profiles
WHERE id = ( SELECT owner_id FROM public.patients WHERE id = NEW.patient_id );
```
La tabella `patients` **non ha una colonna `owner_id`** (ha `user_id` e
`owner_user_id`). Questo trigger è agganciato `BEFORE INSERT ON caregiver_patients`
(quindi si attiva anche dentro `redeem_family_invite()`) e fallirebbe con un
errore SQL (`column "owner_id" does not exist`) alla prima esecuzione reale,
bloccando l'intero flusso di redenzione di un codice invito.

**Fix consigliato:**
```sql
CREATE OR REPLACE FUNCTION public.check_caregiver_invite_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_plan text;
  v_current_count int;
  v_max_allowed int;
BEGIN
  SELECT COALESCE(pr.subscription_plan, 'free') INTO v_plan
  FROM public.patients p
  LEFT JOIN public.profiles pr
    ON pr.id = COALESCE(p.owner_user_id, p.user_id)
  WHERE p.id = NEW.patient_id;

  v_plan := COALESCE(v_plan, 'free');

  SELECT COUNT(*) INTO v_current_count
  FROM public.caregiver_patients
  WHERE patient_id = NEW.patient_id;

  v_max_allowed := CASE v_plan WHEN 'max' THEN 10 WHEN 'pro' THEN 5 ELSE 1 END;

  IF v_current_count >= v_max_allowed THEN
    RAISE EXCEPTION 'Limite caregiver per questo paziente raggiunto per il piano % (Max % persone). Passa a Pro o Max per collaborare con altre persone.', v_plan, v_max_allowed;
  END IF;

  RETURN NEW;
END;
$$;
```
Ho aggiunto anche `SECURITY DEFINER SET search_path TO 'public'`, mancante
nell'originale (incoerente con `check_patient_limit`/`check_therapy_limit`, che
ce l'hanno): senza, la sotto-query su `profiles` passa dalle policy RLS
dell'utente che sta redimendo l'invito, che potrebbe non avere ancora i
permessi per leggere il profilo del proprietario del paziente, con lo stesso
tipo di fallimento silenzioso già visto altrove.

**Verificare con priorità alta** se questo bug è presente anche nel database
live (questo file è uno `schema_backup.sql`, potrebbe non essere allineato al
100% con l'ultima migrazione applicata) — se sì, gli inviti caregiver sono
probabilmente rotti in produzione in questo momento.

### 3.4 🟡 Nota — `caregivers`/`audit_log`/`caregiver_patients` hanno policy duplicate
Oltre al caso critico di 3.1, sono presenti altre policy SELECT ridondanti sullo
stesso comando/tabella (es. `"cp: family peers read"` e `"cp: read own"` su
`caregiver_patients`; tre policy SELECT su `caregivers`). Non risultano
pericolose quanto quella di `audit_log` (la logica extra è comunque
restrittiva), ma vale la pena consolidarle in un'unica policy per tabella/comando
per ridurre la superficie di errore futuro — è più facile introdurre un bug come
3.1 quando le regole sono sparse in più policy che si sommano in OR.

---

## 4. Edge Functions

### 4.1 ❌ CORREZIONE (18/09/2026) — `dose-scheduler` non era mai deployata

**Questa sezione, scritta il 15/09, è stata verificata errata e va ignorata:**
l'utente ha controllato Dashboard Supabase → Edge Functions e **non risulta
nessuna funzione deployata**, né `dose-scheduler` né `push-sender` né
`dose-action`. Il codice di `dose-scheduler` esisteva in questo repository ma
non è mai stato pubblicato su Supabase — di conseguenza non era mai stata
raggiungibile via HTTP da nessuno, e il rischio di abuso/DoS descritto sotto
non si è mai concretizzato. Il codice è stato rimosso nella pulizia del
18/09 insieme ai riferimenti in `supabase/config.toml` e ai commenti VAPID
in `wrangler.toml` (le notifiche push sono una funzionalità volutamente
rimossa — vedi il commento in testa a `public/sw.js` — non un canale attivo
da proteggere).

L'unico scheduler realmente attivo è `process_dose_schedule()`, nativo in
Postgres via `pg_cron`: gira internamente al database, non è un endpoint
HTTP, e non è soggetto a questo tipo di rischio.

Testo originale conservato sotto solo come riferimento storico di cosa
sarebbe stato necessario correggere *se* la funzione fosse stata deployata
con quella configurazione — utile se in futuro si decidesse di reintrodurre
un'Edge Function invocata da cron.

<details>
<summary>Analisi originale (non applicabile allo stato attuale)</summary>

`supabase/config.toml`:
```toml
[functions.dose-scheduler]
verify_jwt = false
```
La funzione usa la **service_role key** (bypassa completamente la RLS, accesso
totale al DB) ed è pensata per essere invocata da `pg_cron` una volta al minuto.
Con `verify_jwt = false`, il gateway Supabase non richiede alcun token per
raggiungerla: **chiunque conosca l'URL può invocarla via HTTP, senza limiti**,
oltre a quelli generici della piattaforma. La funzione stessa non applica CORS
restrittivo (`Access-Control-Allow-Origin: "*"`) né verifica un segreto condiviso.

**Impatto concreto:**
- Non c'è un leak diretto di dati (la risposta è solo `{ok:true, at}`), quindi
  non è uno scenario "User A legge Patient B".
- **È però un vettore di abuso/DoS e di consumo quota**: la funzione, ad ogni
  chiamata, esegue query su *tutte* le terapie attive di *tutti* gli utenti e fa
  scrivere righe in `events`/`notifications`. Un attaccante che la chiama molto
  più spesso di una volta al minuto moltiplica il carico su Postgres e le
  invocazioni Edge Function — esattamente il tipo di rischio che minaccia i
  limiti del piano free menzionati nella richiesta originale.

**Fix che sarebbe stato necessario** (pattern standard per funzioni invocate da cron):
```ts
// in cima al gestore della funzione
const cronSecret = req.headers.get("x-cron-secret");
if (cronSecret !== Deno.env.get("CRON_SECRET")) {
  return new Response("Unauthorized", { status: 401 });
}
```
e configurare `pg_cron`/il job schedulato per inviare quell'header (il segreto
va impostato come variabile d'ambiente della funzione, mai nel codice). In
alternativa, impostare `verify_jwt = true` e far chiamare la funzione dal cron
con la `service_role` key come Bearer token (Supabase la accetta come JWT
valido). Restringere anche il CORS a `"null"` o rimuoverlo del tutto, dato che
questa funzione non deve mai essere chiamata da un browser.

</details>

---

## 5. Matrice RLS per tabella

Tutte le **16 tabelle esposte hanno RLS abilitata** (nessuna tabella "aperta" per
dimenticanza). ✅ = policy presente e verificata coerente; **—** = nessuna
policy per quel comando (di norma perché la scrittura è centralizzata in una
funzione `SECURITY DEFINER`, indicata in "Note"); ⚠️ = problema descritto sopra.

| Tabella | RLS | SELECT | INSERT | UPDATE | DELETE | Note |
|---|---|---|---|---|---|---|
| `patients` | ✅ | ✅ silo (self/owner/caregiver) | ✅ | ✅ | ✅ | Cuore dell'isolamento "User A → Patient B"; verificato PASS. |
| `therapies` | ✅ | ✅ (linked) | ✅ primary-only | ✅ primary-only | ✅ primary-only | Caregiver secondario: solo lettura. |
| `patient_medical_profiles` | ✅ | ✅ (linked) | ✅ primary-only | ✅ primary-only | ✅ primary-only | Idem. |
| `events` | ✅ | ✅ (linked) | ✅ primary-only | ✅ (linked, incl. secondario) | ✅ primary-only | Secondario può confermare/rimandare dosi, non creare/eliminare. |
| `stock_movements` | ✅ | ✅ (linked) | ✅ primary-only | — | — | Ledger immutabile: nessuno può alterare/cancellare movimenti. |
| `vital_signs` | ✅ | ✅ (linked + **plan pro/max**) | ✅ (linked + plan) | ✅ (primary/creator/self) | ✅ (primary/creator) | Feature-gating vitali enforced anche a livello DB, non solo UI. |
| `wellness_notes` | ✅ | ✅ (linked) | ✅ (linked, incl. secondario) | ✅ (author/owner/primary) | ✅ (author/owner/primary) | Journal collaborativo, modifica ristretta all'autore o al primario. |
| `notifications` | ✅ | ✅ (own o via patient) | — | ✅ solo `mark as read` (proprie) | — | Scrittura solo server-side (service_role), previene spoofing. |
| `caregiver_patients` | ✅ | ✅ (ridondanti, §3.4) | **⚠️ mancante (§3.2)** | ✅ (self) | ✅ (self-unfollow / primario rimuove secondario) | Vedi finding 3.2. |
| `caregivers` | ✅ | ✅ (×3, §3.4) | ✅ (self upsert) | ✅ (self) | — | Delete via `delete_my_account()`. |
| `family_invites` | ✅ | ✅ (creator/primary) | — (via `create_family_invite()`) | — (via `redeem_family_invite()`) | ✅ (creator/primary) | Corretto: token/contatori non modificabili direttamente dal client. |
| `profiles` | ✅ | ✅ (self + caregiver-of-linked-patient) | ✅ (self) | ✅ (self) | — | Verificare se esporre `email` al caregiver collegato è intenzionale (severità bassa). |
| `user_roles` | ✅ | ✅ (self) | ✅ (self, whitelist ruoli) | ✅ (self, whitelist ruoli) | — | Solo 2 ruoli esistono (`caregiver`,`paziente`), quindi il whitelist è ridondante ma innocuo. |
| `user_consents` | ✅ | ✅ (self) | ✅ (self) | — | — | Corretto per GDPR: storico consensi append-only, non riscrivibile. |
| `adherence_monthly` | ✅ | ✅ (linked) | — | — | — | Popolata da `rollup_adherence_monthly()` (SECURITY DEFINER). |
| `audit_log` | ✅ | **⚠️ vulnerabile (§3.1)** | — | — | — | Scrittura solo via funzioni/trigger interni: corretto. Lettura da correggere subito. |

---

## 6. Prossimi passi consigliati (in ordine di priorità)

1. **Applicare il fix di §3.1** (`DROP POLICY "audit: read linked"`) — è l'unico
   item con impatto di riservatezza concreto e immediatamente sfruttabile.
2. **Verificare in produzione** se il bug di §3.3 (`owner_id` inesistente) sta
   già rompendo la redenzione degli inviti caregiver; se sì, applicare il fix.
3. Applicare il fix di §3.2 (policy INSERT mancante su `caregiver_patients`) e
   verificare che il flusso "aggiungi paziente" da parte di un caregiver
   funzioni end-to-end dopo la modifica.
4. ~~Mettere un segreto/allow-list su `dose-scheduler`~~ — non più necessario:
   nessuna Edge Function risulta deployata (verificato 18/09), il codice è
   stato rimosso. Nessuna azione richiesta su questo punto.
5. Verificare in Dashboard Supabase: "Confirm email" attivo, policy password
   minima allineata alla UI, rate limit nativi su login/signup, leaked-password
   protection attiva (item §2.5/§2.6/§2.8 — nessuno di questi è verificabile da
   codice).
6. Valutare, quando possibile, la rimozione di `'unsafe-inline'` dalla CSP
   (§2.7) come indurimento difesa-in-profondità per il rischio "token in
   localStorage".