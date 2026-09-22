# SECURITY_INCIDENT.md — Runbook Operativo per Incidenti di Sicurezza

**Progetto:** FamilyMed
**Scopo:** guida rapida "cosa fare in caso di incidente", pensata per essere seguita
sotto stress, senza dover cercare informazioni altrove.
**Riferimento normativo esteso:** vedi [`compliance/breach-procedure.md`](./compliance/breach-procedure.md)
per gli obblighi GDPR completi (art. 33/34), i testi delle notifiche e il registro
violazioni. Questo file è il "quando succede qualcosa, apri questo file e segui i
passi" — l'altro è il riferimento legale/di dettaglio.

> ⚠️ Compila la sezione **Contatti e Responsabilità** con i dati reali prima di
> considerare questo documento operativo. I placeholder `<...>` vanno sostituiti.

---

## Le 10 fasi

### 1. Detect — Rilevamento
Un incidente può emergere da:
- alert Supabase (accessi anomali, spike di query, errori di autenticazione ripetuti);
- alert Cloudflare (WAF, DDoS, traffico anomalo sui Workers);
- audit log applicativo (`public.audit_log`, log di accesso ai dati paziente);
- segnalazione di un utente ("non riconosco questo accesso", "vedo dati di un altro paziente");
- segnalazione di uno sviluppatore (es. trovato un bug che espone dati non suoi).

**Azione immediata:** chi rileva l'anomalia lo comunica **subito** al Responsabile
Incidenti (vedi tabella contatti), anche in caso di dubbio — meglio un falso
allarme che un ritardo. Annotare data/ora esatta del rilevamento: da questo
momento partono i termini di legge (72h per la notifica al Garante, se dovuta).

### 2. Contain — Contenimento
Obiettivo: fermare subito la perdita/esposizione di dati, senza distruggere le prove.
- Se c'è compromissione di credenziali: rigenerare `service_role` key e le chiavi
  anon/publishable su Supabase; forzare logout globale (`auth.admin.signOut()`).
- Se c'è un bug applicativo attivo (es. RLS non applicata su una tabella): attivare
  `MAINTENANCE_MODE = true` in `src/routes/__root.tsx`, deploy immediato
  (`bun run build && bunx wrangler deploy`).
- Se c'è attacco in corso dall'esterno (bot, scraping, brute force): bloccare IP/user-agent
  via WAF Cloudflare.
- **Non cancellare nulla** in questa fase: disabilitare l'accesso, non distruggere
  righe/log che serviranno per l'investigazione.

### 3. Investigate — Investigazione
- Ricostruire la timeline: quando è iniziato, come è stato possibile, quali sistemi
  sono coinvolti (frontend, Supabase Auth, Postgres/RLS, Storage, Edge Functions,
  Cloudflare Worker).
- Consultare: log Postgres, log Auth di Supabase, log Cloudflare Workers/WAF,
  `public.audit_log`, log delle Edge Functions (`dose-scheduler`, ecc.).
- Determinare se è stato un errore umano, un bug (es. policy RLS mancante), una
  vulnerabilità sfruttata, o una compromissione di credenziali.

### 4. Assess impact — Valutazione dell'impatto
Rispondere per iscritto (serve per il registro e per l'eventuale notifica):
- Quali **categorie di dati** sono coinvolte? (anagrafici semplici vs. dati sanitari
  ex art. 9 GDPR — terapie, dosaggi, note cliniche, parametri vitali → impatto sempre
  presunto **elevato** se coinvolti).
- **Quanti interessati** e quanti record?
- I dati erano cifrati/pseudonimizzati (quindi inutilizzabili da terzi) o in chiaro?
- Conseguenze concrete possibili: furto d'identità, discriminazione, interruzione
  della continuità assistenziale (es. dosi non somministrate per un blocco del
  servizio).

### 5. Preserve evidence — Conservazione delle prove
- Esportare e mettere al sicuro (fuori dal sistema compromesso) log Postgres, log
  Auth, log Cloudflare, `audit_log`, eventuali screenshot/segnalazioni ricevute.
- Annotare chi ha avuto accesso a queste prove e quando (catena di custodia minima).
- Non modificare i sistemi coinvolti più del necessario prima di aver esportato i log.

### 6. Notify internal responsible person — Notifica interna
- Il rilevatore informa il **Responsabile Incidenti** (o, in sua assenza, il backup)
  entro il prima possibile e comunque non oltre poche ore dal rilevamento.
- Il Responsabile Incidenti convoca (anche solo per messaggio/call) il Titolare del
  trattamento e, se nominato, il DPO/consulente privacy.
- Da questo momento il Titolare è "a conoscenza" della violazione ai fini del
  termine di 72h dell'art. 33 GDPR.

### 7. Determine GDPR notification obligations — Obblighi di notifica
- Il Titolare (con supporto del DPO/consulente, se presente) valuta se c'è un
  rischio per i diritti e le libertà degli interessati.
- Se **sì** → notifica al Garante Privacy entro **72 ore** dalla conoscenza
  dell'evento, tramite il portale ufficiale:
  https://www.garanteprivacy.it/home/modulistica-e-servizi-online/notifica-data-breach
- Se il rischio è **nullo o trascurabile** → non notificare, ma **documentare
  comunque la motivazione** nel registro interno (obbligo art. 33 par. 5, vale
  anche per le violazioni non notificate).
- Il testo/contenuto della notifica è dettagliato in `compliance/breach-procedure.md`,
  Fase 4.

### 8. Notify affected parties if required — Notifica agli interessati
- Se il rischio è **elevato** (quasi sempre il caso, trattandosi di dati sanitari) →
  comunicazione diretta agli utenti coinvolti "senza ingiustificato ritardo"
  (art. 34 GDPR), via email + avviso in-app.
- Linguaggio semplice, senza tecnicismi (l'utenza include persone anziane/fragili
  e i loro familiari).
- Includere: cosa è successo, quali dati, cosa consigliamo di fare (cambiare
  password, verificare le terapie salvate), a chi rivolgersi per assistenza.
- Template e contenuto dettagliato in `compliance/breach-procedure.md`, Fase 5.

### 9. Remediate — Rimedio
- Correggere la causa radice (patch del bug, fix della policy RLS, rotazione
  definitiva delle credenziali, hardening della configurazione coinvolta).
- Verificare che il fix funzioni davvero prima di disattivare `MAINTENANCE_MODE`.
- Se necessario, rafforzare i controlli per prevenire ricorrenze (es. aggiungere
  un test automatico sulla policy RLS che ha fallito).

### 10. Document incident — Documentazione
Registrare l'evento nel **Registro Interno dei Data Breach** (art. 33 par. 5 GDPR),
anche se non notificato, con:
1. data/ora del rilevamento e data/ora stimata dell'accaduto;
2. descrizione dell'evento e causa;
3. categorie e numero di dati/interessati coinvolti;
4. valutazione del rischio (Basso / Medio / Elevato) e motivazione;
5. decisione sulla notifica (Notificato / Non notificato + perché);
6. azioni correttive intraprese e lezioni apprese.

Il registro può essere tenuto anche semplicemente come file interno
(es. `compliance/breach-log/AAAA-MM-GG-descrizione.md`, non pubblico/non nel
repository pubblico se contiene dettagli sensibili) — l'importante è che esista e
sia consultabile in caso di ispezione del Garante.

---

## Contatti e Responsabilità

> Compilare con i dati reali. Anche un progetto piccolo, senza un SOC, deve avere
> chiaro **chi fa cosa** quando succede qualcosa — questa tabella è il punto di
> partenza di ogni fase sopra.

| Ruolo | Nome / Riferimento | Contatto | Responsabilità in caso di incidente |
|---|---|---|---|
| **Titolare del trattamento** | `<nome/ragione sociale>` | `privacy@familymed.it` | Decisione finale su notifica al Garante e agli interessati; firma delle comunicazioni ufficiali. |
| **Responsabile Incidenti (Incident Owner)** | `<nome>` | `<email>` / `<telefono reperibilità>` | Punto di contatto unico da avvisare per primo (fase 1); coordina contenimento e investigazione; tiene traccia della timeline. |
| **Responsabile Tecnico (Backup)** | `<nome>` | `<email>` / `<telefono>` | Sostituisce l'Incident Owner se irraggiungibile; ha accesso alle dashboard Supabase/Cloudflare per agire in fase 2 (rotazione chiavi, maintenance mode, blocco WAF). |
| **DPO / Consulente Privacy** (se nominato) | `<nome/studio>` | `<email>` | Supporta la valutazione del rischio (fase 4/7) e la redazione della notifica al Garante. |
| **Canale di allarme immediato** | — | `privacy@familymed.it` (+ numero di reperibilità tecnica) | Primo punto di contatto per chiunque rilevi un'anomalia, incluso da parte di utenti esterni. |

**Accessi critici da avere sempre pronti (elenco per l'Incident Owner e il backup):**
- Dashboard Supabase (progetto FamilyMed) — accesso a chiavi API, Auth Admin, log.
- Dashboard Cloudflare (Workers, WAF, DNS).
- Accesso al repository GitHub per deploy rapido di `MAINTENANCE_MODE`.
- Portale del Garante Privacy per la notifica: https://www.garanteprivacy.it/home/modulistica-e-servizi-online/notifica-data-breach

**Regola pratica:** non serve un SOC enterprise. Serve che, aprendo questo file
durante un incidente, una sola persona sappia esattamente chi chiamare e quale
pulsante premere entro i primi 30 minuti.