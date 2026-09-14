# Registro dei Fornitori Terzi e Sub-Responsabili (Sub-processors)
**Progetto:** FamilyMed  
**Riferimento normativo:** Art. 28 Regolamento (UE) 2016/679 (GDPR)  
**Data ultimo aggiornamento:** 14 Settembre 2026  
**Stato:** Documentazione tecnica di audit interno  

---

## 1. Ambito e Finalità

Ai sensi dell'art. 28 GDPR, qualora un trattamento debba essere eseguito per conto del Titolare del trattamento, quest'ultimo ricorre unicamente a Responsabili del trattamento (e sub-responsabili) che presentino garanzie sufficienti per mettere in atto misure tecniche e organizzative adeguate.

Il presente documento elenca tutti i fornitori tecnologici e infrastrutturali terzi utilizzati dall'applicazione FamilyMed, indicando per ciascuno:
- Sede legale e localizzazione dei server/data center;
- Tipologia di dati personali/sanitari trattati;
- Strumento giuridico che disciplina il trattamento e il trasferimento internazionale (DPA, SCC, Data Privacy Framework);
- Misure di sicurezza applicate.

---

## 2. Elenco dei Sub-Responsabili Attivi

### 2.1 Supabase Inc. (Infrastruttura Database, Auth, Storage, Realtime)

- **Ragione Sociale:** Supabase, Inc.
- **Sede Legale:** 970 Toa Payoh North #07-04, Singapore 318992 (Presenza operativa: San Francisco, CA, USA).
- **Infrastruttura Cloud sottostante:** Amazon Web Services (AWS).
- **Regione Data Center:** **Europa (AWS Frankfurt `eu-central-1`)** *(da verificare nelle impostazioni del progetto Supabase `qdwadqkpobtxivlypbio`)*.
- **Servizi erogati:**
  - Database relazionale gestito PostgreSQL (tabelle applicative, eventi clinici, terapie, parametri vitali, note cliniche).
  - Gestione identità e autenticazione utenti (Supabase Auth / GoTrue).
  - Storage a oggetti (bucket `therapy-photos`).
  - Schedulatore di sistema (`pg_cron`).
  - WebSocket Realtime per la sincronizzazione immediata dei promemoria.
- **Dati personali trattati:**
  - Dati anagrafici e di contatto (Email, Nome, UUID, Password hashata).
  - **Dati particolari sulla salute (Art. 9 GDPR):** Nomi farmaci, posologie, scorte, esiti assunzioni, note cliniche, parametri vitali, anamnesi medica, foto confezioni.
  - Log tecnici di accesso (IP, User-Agent, timestamp).
- **Base giuridica del trasferimento Extra-UE:**
  - Data Processing Addendum (DPA) sottoscritto con Supabase.
  - Standard Contractual Clauses (SCC) approvate dalla Commissione Europea (Decisione 2021/914/UE).
  - Archiviazione primaria configurata fisicamente all'interno dello Spazio Economico Europeo (Data Center Germania).
- **Misure di sicurezza del fornitore:**
  - Cifratura dei dati a riposo (AES-256 su volumi EBS).
  - Cifratura in transito (TLS 1.3).
  - Certificazioni di conformità SOC 2 Type II, ISO 27001, HIPAA compliant.

---

### 2.2 Cloudflare, Inc. (Hosting Frontend Edge, CDN, Sicurezza & Anti-Bot)

- **Ragione Sociale:** Cloudflare, Inc.
- **Sede Legale:** 101 Townsend St, San Francisco, CA 94107, USA (Filiale europea: Cloudflare Germany GmbH / Cloudflare Portugal).
- **Servizi erogati:**
  - Distribuzione del codice frontend (Cloudflare Workers / Pages).
  - Rete per la distribuzione dei contenuti (CDN) e terminazione SSL/TLS.
  - Web Application Firewall (WAF) e mitigazione attacchi DDoS.
  - Servizio anti-bot e anti-abuso senza tracciamento (**Cloudflare Turnstile** nella form di registrazione).
- **Dati personali trattati:**
  - Indirizzi IP di transito, metadati di connessione HTTP (User-Agent, headers tecnici).
  - Token crittografici monouso generati dal widget Turnstile (nessun cookie invasivo, zero tracciamento cross-site).
  - *Nessun dato clinico memorizzato in modo persistente sui server Cloudflare (gli asset statici sono compilati).*
- **Base giuridica del trasferimento Extra-UE:**
  - Adesione all'**EU-U.S. Data Privacy Framework (DPF)**.
  - Data Processing Addendum (DPA) globale con Clausole Contrattuali Standard (SCC).
- **Misure di sicurezza del fornitore:**
  - Connessioni rigorosamente protette tramite HTTPS / TLS 1.3.
  - Rigide policy interne di minimizzazione dei log (log di transito cancellati a rotazione rapida).

---

### 2.3 Provider Email Transazionali (Supabase Auth SMTP)

- **Fornitore attuale:** Servizio SMTP predefinito integrato in Supabase Auth (oppure server SMTP personalizzato es. Resend, Sendgrid o provider PEC/SMTP europeo).
- **Servizi erogati:** Invio email transazionali di servizio:
  - Conferma indirizzo email di registrazione.
  - Link crittografico monouso per il reset della password.
- **Dati personali trattati:** Indirizzo email dell'utente, timestamp di invio, link crittografico monouso.
- **Base giuridica:** Esecuzione del contratto / misure precontrattuali (Art. 6.1.b GDPR).
- **Nota di audit:** È fondamentale verificare nella console di Supabase se si sta utilizzando il rate-limit di prova integrato o un proprio provider SMTP (es. Resend/Postmark configurato in Europa).

---

### 2.4 Lovable (Piattaforma di Prototipazione e Sviluppo)

- **Fornitore:** Lovable (GPT Engineer Inc.)
- **Servizi erogati:** Ambiente di sviluppo e deploy integrato. Nel codice client è presente il modulo `src/lib/lovable-error-reporting.ts`.
- **Dati trattati:** In caso di crash dell'applicazione, intercetta lo stack trace JavaScript e la rotta del browser (`window.location.pathname`).
- **Valutazione di Rischio GDPR:**
  - Se un errore JavaScript si verifica durante la manipolazione di un oggetto terapia o paziente, il payload di errore potrebbe teoricamente includere dati sanitari nello stack trace o nel context.
  - **Raccomandazione tecnica:** Disattivare o filtrare rigorosamente `reportLovableError` in ambiente di produzione (Production build), eliminando qualsiasi trasmissione di eccezioni contenenti variabili di stato clinico verso piattaforme esterne.

---

## 3. Servizi Esaminati ma NON Utilizzati (Assenza di Terze Parti)

Per massima trasparenza di audit e minimizzazione dei dati:

1. **Google Analytics / Meta Pixel / Cookie di Tracciamento:** **ASSENTI**. L'applicazione non include alcuno script pubblicitario, analitico o di profilazione commerciale.
2. **Push Notification Gateway Terzi (Firebase Cloud Messaging, OneSignal):** **ASSENTI**. Le notifiche attualmente sfruttano la Web Notification API del browser e WebSocket interni di Supabase.
3. **Server di Rendering PDF Esterni:** **ASSENTI**. La compilazione dei referti avviene al 100% nel browser tramite codice JavaScript locale (`jspdf`).

---

## 4. Tabella Riassuntiva di Conformità

| Fornitore | Sede / Giurisdizione | Dati Trattati | Presenza DPA | Base Trasferimento Extra-UE | Misure di Sicurezza |
|---|---|---|:---:|:---:|---|
| **Supabase** | Singapore / USA (Server AWS Francoforte) | Anagrafici + **Sanitari (Art. 9)** | SI | SCC + DPF + Hosting EU | AES-256 at-rest, TLS 1.3, RLS, SOC 2 |
| **Cloudflare** | USA (Edge globale) | IP, Headers, Token Turnstile | SI | EU-U.S. Data Privacy Framework + SCC | TLS 1.3, WAF, No cookie tracking |
| **Provider SMTP** | Variabile in base alla config | Email, Token auth | Da verificare | SCC / Esecuzione contratto | TLS transito |
| **Lovable** | USA | Stack trace errori (Dev/Staging) | In revisione | Da rimuovere in Produzione | HTTPS |
