# Subprocessor Audit — Checklist per fornitore

**Progetto:** FamilyMed
**Data:** 15 Settembre 2026
**Relazione con altri documenti:** `compliance/subprocessors.md` contiene già una
descrizione narrativa dei fornitori principali (Supabase, Cloudflare, provider
email, Lovable). Questo file la ricontrolla riga per riga contro le 11 domande
richieste e la completa con le categorie mancanti (Stripe, Analytics, Error
tracking, Push provider), segnalando esplicitamente cosa è verificabile da
codice e cosa richiede una verifica in Dashboard/contratto (che io non posso
fare da qui: non ho accesso alla console Supabase/Cloudflare né ai contratti
firmati).

**Legenda:** ✅ verificato da codice/config · ⚠️ da verificare in Dashboard o
con il fornitore · ❌ assente/non applicabile · 🔧 azione tecnica consigliata.

---

## 1. Supabase (Database, Auth, Storage, Edge Functions, Realtime)

| Domanda | Risposta |
|---|---|
| **Cosa riceve** | Tutto il traffico applicativo autenticato: query REST/RPC dal client, upload foto, invocazioni Edge Function. |
| **Quali dati** | Dati anagrafici (nome, email, UUID, password hash), **dati sanitari (art. 9)**: terapie, dosaggi, scorte, eventi/dosi, parametri vitali, note cliniche (cifrate a livello applicativo per `notes_enc`, vedi §2 sotto), foto confezioni farmaci. Log tecnici (IP, user-agent) nei log infrastrutturali di Supabase (non nel nostro `audit_log` applicativo, che è un log a parte, vedi `retention-policy.md`). |
| **Dove elaborati** | ✅ Regione dichiarata: AWS `eu-central-1` (Francoforte) — **da riconfermare** nelle impostazioni del progetto Supabase, come già annotato in `subprocessors.md`. |
| **Ruolo GDPR** | Responsabile del trattamento (art. 28) verso il Titolare FamilyMed. |
| **DPA disponibile?** | ⚠️ Supabase pubblica un DPA standard accettabile online; verificare di averlo effettivamente sottoscritto/accettato nel proprio account (non è automatico solo per il fatto di usare il servizio — va accettato esplicitamente nelle impostazioni "Legal" del progetto). |
| **Subprocessor list?** | ⚠️ Supabase pubblica una lista pubblica dei propri sub-subprocessor (es. AWS come infrastruttura sottostante). Va controllata periodicamente (nessun meccanismo di notifica automatica nel nostro progetto). |
| **Trasferimenti extra-UE?** | Se la regione è effettivamente `eu-central-1`, il dato applicativo **resta in UE**. Restano extra-UE: l'azienda Supabase Inc. stessa (sede Singapore/USA) come entità legale che eroga il servizio con accesso di supporto potenziale ai sistemi → coperto da SCC nel DPA. |
| **Retention?** | ✅ Documentata in dettaglio in `compliance/retention-policy.md` (per-tabella, automatizzata con `pg_cron`). |
| **Cancellazione?** | ✅ RPC `delete_my_account()` (vedi `compliance/deletion-procedure.md`). ⚠️ **Gap trovato oggi**: non elimina i file nel bucket `therapy-photos` — vedi `compliance/data-deletion-trace.md` §4. |
| **Encryption?** | ✅ TLS in transito; AES-256 at rest (dichiarato dal fornitore). ✅ Le note cliniche (`therapies.notes_enc`) sono **cifrate anche a livello applicativo** prima di essere scritte su Postgres (funzione `decrypt_therapy_note()` con controllo di autorizzazione, vedi security-audit-technical.md) — livello di protezione aggiuntivo oltre a quello del fornitore. |
| **Certificazioni?** | ⚠️ Supabase dichiara SOC 2 Type II e capacità di supportare configurazioni HIPAA-ready sui piani a pagamento — **verificare la certificazione attuale e se il piano in uso la include**, non darla per scontata sul piano free. |
| **Breach notification?** | ⚠️ Verificare nel DPA i tempi contrattuali di notifica di Supabase verso di voi in caso di incidente (tipicamente "senza ingiustificato ritardo" / entro 72h) — necessario per rispettare a propria volta i termini di `SECURITY_INCIDENT.md`. |

---

## 2. Cloudflare (Hosting frontend, CDN, WAF, Turnstile) — copre anche "Hosting"

| Domanda | Risposta |
|---|---|
| **Cosa riceve** | Tutte le richieste HTTP verso il frontend (incl. header, IP), il widget Turnstile in fase di login/registrazione. |
| **Quali dati** | IP e metadati di connessione; **nessun dato sanitario persistente** (l'app è una SPA/SSR che fa da tramite verso Supabase — Cloudflare non tocca il contenuto delle richieste API verso Supabase se non come instradamento). Eccezione: i log delle Edge Functions (`dose-scheduler`) girano su Supabase, non Cloudflare — separare bene i due piani. |
| **Dove elaborati** | Rete globale Cloudflare (edge computing) — il codice statico è distribuito ovunque; se l'origin/Workers eseguono in un data center specifico va verificato quale region è assegnata al progetto (Cloudflare instrada di norma al POP più vicino all'utente, non necessariamente UE). |
| **Ruolo GDPR** | Responsabile del trattamento per IP/metadati di connessione. |
| **DPA disponibile?** | ✅ Cloudflare fornisce un DPA standard, accettabile online (Cloudflare Customer DPA). Verificare di averlo accettato per l'account usato. |
| **Subprocessor list?** | ⚠️ Cloudflare pubblica una lista di sub-processor; da controllare periodicamente. |
| **Trasferimenti extra-UE?** | Sì per design (rete edge globale, instradamento al POP più vicino, non solo UE) → coperto da adesione all'**EU-U.S. Data Privacy Framework** + SCC, come già annotato in `subprocessors.md`. |
| **Retention?** | ⚠️ Non documentata nel repository: i log di richiesta HTTP di Cloudflare hanno una retention propria (dipende dal piano/prodotto usato — Logpush vs log base). Da verificare e aggiungere a `retention-policy.md`. |
| **Cancellazione?** | ⚠️ Non applicabile a dati applicativi (non persistiti); per i log di accesso, segue la retention di cui sopra — non esiste un meccanismo di cancellazione puntuale per singolo utente lato Cloudflare (i log sono aggregati per IP/richiesta, non per account applicativo). |
| **Encryption?** | ✅ TLS 1.3 end-to-end, dichiarato e già verificato nella configurazione (`server.ts`, CSP, redirect HTTPS). |
| **Certificazioni?** | ⚠️ Cloudflare dichiara ISO 27001, SOC 2 Type II — verificare la copertura specifica dei prodotti effettivamente usati (Workers, Turnstile). |
| **Breach notification?** | ⚠️ Verificare termini contrattuali nel DPA Cloudflare. |

---

## 3. Stripe (Pagamenti/Abbonamenti)

| Domanda | Risposta |
|---|---|
| **Stato attuale** | ❌ **Non presente nel codice.** Ho cercato "stripe" in tutto `src/`, `supabase/` e `package.json`: nessun riferimento. Lo schema DB ha già le colonne `subscription_plan`/`subscription_status` (free/pro/max) ma **non risulta alcuna integrazione di pagamento reale collegata** in questo checkout — probabile gestione manuale/placeholder dei piani, o integrazione non ancora committata. |
| **Cosa fare** | Se Stripe (o altro PSP) è già in uso ma non versionato in questo repo, va comunque censito: **non riceve mai dati sanitari** (per design corretto, i PSP devono restare isolati dai dati clinici), riceve solo dati di fatturazione (nome, email, dati di pagamento tokenizzati). Quando verrà integrato, replicare questa stessa checklist (DPA Stripe è standard e ben documentato, certificazione PCI-DSS Level 1, infrastruttura UE disponibile su richiesta/piano). |

---

## 4. Provider Email Transazionale (Supabase Auth SMTP)

| Domanda | Risposta |
|---|---|
| **Cosa riceve** | Indirizzo email, contenuto dell'email (link di conferma/reset), IP di invio. |
| **Quali dati** | Solo email + nome eventualmente incluso nel template — **nessun dato sanitario**, per design corretto (mai includere terapie/dosaggi nelle email transazionali). |
| **Dove elaborati** | ⚠️ **Non determinabile da codice**: `supabase/config.toml` non ha una sezione `[auth]`/SMTP custom, quindi il progetto usa o l'SMTP di default integrato in Supabase (limitato, sconsigliato in produzione per via dei rate limit) o un provider esterno configurato solo in Dashboard (es. Resend/Postmark). **Azione richiesta:** verificare in Dashboard → Authentication → Email quale sia il provider attivo oggi. |
| **Ruolo GDPR** | Responsabile del trattamento per l'invio delle email. |
| **DPA disponibile?** | ⚠️ Dipende dal provider effettivo — se è l'SMTP di default Supabase, è coperto dal DPA Supabase stesso; se è un provider esterno (Resend/Postmark/altro), serve un DPA separato. |
| **Subprocessor list? / Trasferimenti extra-UE? / Retention? / Cancellazione? / Encryption? / Certificazioni? / Breach notification?** | ⚠️ Tutti da verificare una volta identificato il provider reale — non determinabili da codice. |

---

## 5. Analytics

| Domanda | Risposta |
|---|---|
| **Stato attuale** | ❌ **Assente**, confermato sia da questa verifica sia dalla nota già presente in `subprocessors.md`: nessun Google Analytics, Meta Pixel, PostHog o script di profilazione/tracciamento nel codice. |
| **Nota positiva** | Ottimo dal punto di vista di minimizzazione dei dati — nessuna checklist da compilare perché non c'è alcun sub-processor in questa categoria. Se in futuro se ne aggiunge uno, va scelto **privacy-first** (self-hosted o EU-based, es. Plausible/Umami) proprio per evitare di aprire un nuovo canale di trasferimento extra-UE per dati potenzialmente incrociabili con l'uso dell'app sanitaria. |

---

## 6. Error tracking

| Domanda | Risposta |
|---|---|
| **Stato attuale** | ⚠️ **Parziale e residuale**: `src/lib/lovable-error-reporting.ts` invia eccezioni non gestite a `window.__lovableEvents.captureException`, un hook che **esiste solo quando l'app gira dentro l'iframe dell'editor Lovable** (ambiente di sviluppo/anteprima). In produzione reale (Cloudflare, dominio proprio) `window.__lovableEvents` è `undefined`, quindi la chiamata è un no-op — **nessun dato lascia il browser dell'utente finale verso Lovable in produzione.** |
| **Quali dati (solo in ambiente di sviluppo Lovable)** | Oggetto errore JS (message/stack) + `route` (path della pagina) + un'etichetta statica (`boundary: "tanstack_root_error_component"`). Non risultano chiamate che passino esplicitamente oggetti paziente/terapia — rischio residuo solo se un errore JS include per caso un frammento di stato nel proprio `.message` (raro, ma non impossibile con `TypeError` su oggetti annidati). |
| **Nessun Sentry/LogRocket/Datadog in produzione** | Conferma anche il punto verificato in `compliance/logging-hardening.md`: nessun error-tracker esterno reale è collegato oggi. Positivo per la minimizzazione, ma significa anche che **il team non ha visibilità sugli errori reali degli utenti in produzione** — è un trade-off, non solo un pregio; se in futuro si aggiunge un vero error tracker, va instradato attraverso `src/lib/logger.ts` (già sanitizzante) e non collegato direttamente ai punti dove oggi c'è `reportLovableError`. |
| **DPA/certificazioni/ecc.** | Non applicabile finché non lascia dati in produzione. Se si formalizza l'uso di Lovable anche per il monitoraggio in produzione, va trattato come sub-processor a tutti gli effetti (DPA, subprocessor list, ecc.). |

---

## 7. Push provider — aggiornamento 18/09: nessuna azione necessaria

**Verificato e chiuso.** All'epoca di questo documento (15/09) avevo segnalato
Web Push come categoria "nascosta" da censire, basandomi sui riferimenti a
`VAPID_*` in `wrangler.toml` e alla config di `push-sender` in
`supabase/config.toml`. L'utente ha controllato Dashboard → Edge Functions:
**nessuna funzione è mai stata deployata**. Il service worker (`public/sw.js`)
conferma esplicitamente: *"Le notifiche push sono state rimosse: tutti i
promemoria avvengono in-app tramite modali sulla dashboard paziente"* — una
scelta di prodotto già fatta, non una feature a metà. Tutti i riferimenti
(config, commenti VAPID, codice dell'Edge Function mai pubblicata) sono stati
rimossi dal repository nella pulizia del 18/09.

Nessun sub-processor di infrastruttura push (Google FCM / Mozilla Autopush /
APNs) è quindi coinvolto oggi: le notifiche restano interamente in-app,
nessun dato lascia il dispositivo dell'utente per questo canale. Se in
futuro si reintroducesse Web Push, questa sezione andrebbe ripristinata e
la checklist (DPA, contenuto minimizzato dei payload, ecc.) rifatta da capo.

---

## 8. Sintesi — cosa manca prima di considerare il registro sub-processor completo

1. Confermare via Dashboard la regione Supabase e il DPA accettato (§1).
2. Individuare il provider email realmente attivo (§4) — oggi è un punto cieco.
3. ~~Recuperare e auditare `push-sender`/`dose-action`~~ — risolto 18/09:
   verificato che nessuna Edge Function è mai stata deployata; codice e
   config rimossi dal repository, nessun sub-processor push coinvolto (§7).
4. Se/quando Stripe (o altro PSP) verrà integrato, applicare da subito questa stessa checklist (§3).
5. Aggiungere ai log Cloudflare una riga di retention in `compliance/retention-policy.md` (§2).