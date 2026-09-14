# Misure Tecniche e Organizzative di Sicurezza (TOMs)
**Progetto:** FamilyMed  
**Riferimento normativo:** Art. 32 Regolamento (UE) 2016/679 (GDPR)  
**Data ultimo aggiornamento:** 14 Settembre 2026  
**Stato:** Documentazione tecnica di audit interno  

---

## 1. Quadro Generale di Sicurezza

L'art. 32 del GDPR impone al Titolare e al Responsabile del trattamento di mettere in atto misure tecniche e organizzative adeguate per garantire un livello di sicurezza adeguato al rischio, tenendo conto dello stato dell'arte, dei costi di attuazione, della natura, dell'oggetto, del contesto e delle finalità del trattamento, nonché del rischio di varia probabilità e gravità per i diritti e le libertà delle persone fisiche.

Dovendo FamilyMed trattare **dati particolari relativi alla salute (Art. 9 GDPR)** relativi a soggetti fragili o anziani, il livello di rischio intrinseco è classificato come **ELEVATO**. Di conseguenza, le misure di sicurezza adottate riflettono standard rigorosi di *Security & Privacy by Design*.

---

## 2. Misure Tecniche Implementate

### 2.1 Crittografia in Transito (Encryption in Transit)
- **HTTPS & TLS 1.3:** Tutte le comunicazioni tra browser dell'utente, rete edge Cloudflare e backend Supabase avvengono rigorosamente tramite protocollo cifrato HTTPS con TLS 1.3 (e fallback minimo a TLS 1.2 con cipher suite ad alta sicurezza).
- **WebSockets Cifrati (WSS):** Il canale di sincronizzazione in tempo reale delle notifiche e delle conferme di dose transita su protocollo `wss://` cifrato.
- **HSTS (HTTP Strict Transport Security):** Configurato a livello di Edge per forzare tutti i client a comunicare esclusivamente tramite canale protetto.

### 2.2 Crittografia a Riposo (Encryption at Rest)
- **Cifratura Storage & Volumi:** Tutti i dischi di database (AWS EBS) e gli storage bucket di Supabase sono cifrati a riposo con algoritmo standard **AES-256**.
- **Cifratura a Livello di Colonna (Column-Level Encryption):** Nel database è predisposta la funzione `encrypt_therapy_note()` e `decrypt_therapy_note()` che sfrutta l'estensione crittografica `pgcrypto` e la gestione chiavi di **Supabase Vault** per consentire la cifratura simmetrica a 256 bit delle note cliniche più sensibili (`notes_enc`).

### 2.3 Controllo degli Accessi Logici: Row Level Security (RLS)
La sicurezza applicativa di FamilyMed è incapsulata direttamente nel motore di PostgreSQL. Tutte le 15 tabelle del database hanno la modalità **ROW LEVEL SECURITY (RLS) abilitata**.
- Nessuna query (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) può accedere ai dati senza che il client fornisca un token JWT valido e che la corrispondente policy SQL restituisca `TRUE`.
- **Segregazione dei ruoli:**
  - `anon`: Ha accesso solo alla verifica di login/registrazione e asset pubblici.
  - `authenticated`: Ha accesso esclusivamente alle righe in cui è verificata la titolarità del paziente o il legame di cura attivo.
  - Funzioni `SECURITY DEFINER`: Utilizzate solo per operazioni ad alta sensibilità (es. riscatto invito, cancellazione account, schedulazione dosi) con percorsi di ricerca circoscritti (`SET search_path TO 'public'`) per prevenire attacchi di Search Path Hijacking.

### 2.4 Autenticazione e Gestione Sessioni
- **Protezione Password:** Le password degli utenti non vengono mai salvate in chiaro; sono sottoposte ad algoritmo di hashing crittografico a senso unico (bcrypt / argon2 con salt univoco per utente) gestito dal sottosistema GoTrue di Supabase.
- **Token a Breve Termine:** Gli access token JWT hanno una validità limitata (1 ora).
- **Refresh Token Rotation:** Il rinnovo del token invalida il refresh token precedente; l'eventuale intercettazione o riuso anomalo provoca la revoca immediata dell'intera catena di sessioni dell'utente.
- **Protezione Anti-Bot:** Nella form di registrazione è integrato **Cloudflare Turnstile**, che blocca attacchi di forza bruta, credential stuffing e creazioni massive di account fake senza impiegare cookie invasivi di profilazione.

### 2.5 Protezione da Iniezioni e Integrità dei Dati
- **Prevenzione SQL Injection:** Nessuna query viene composta concatenando stringhe nel codice client. Tutte le chiamate sfruttano PostgREST e prepared statements con parametri tipizzati.
- **Validazione degli Schemi:** Tutte le form client e i payload di richiesta sono validati tramite librerie di validazione rigorosa (**Zod** / React Hook Form) prima di qualsiasi invio.
- **Vincoli SQL sull'archiviazione multimediale:** I vincoli `therapies_photo_drug_not_base64` e `therapies_photo_package_not_base64` vietano l'iniezione di stringhe base64 incontrollate nel database relazionale, obbligando il passaggio tramite bucket storage controllato.

### 2.6 Privacy by Design nella Generazione Documentale (Report PDF)
- A differenza di soluzioni che inviano i dati clinici a servizi terzi di compilazione PDF (es. serverless Chromium remoti o API esterne), la generazione dei resoconti clinici in FamilyMed è implementata **interamente lato client (client-side)** tramite la libreria `jsPDF`.
- I dati sanitari non lasciano mai la memoria locale del browser dell'utente per la creazione del file.

### 2.7 Meccanismo di Isolamento in Manutenzione
- Nel file `src/routes/__root.tsx` è presente il flag di sicurezza `MAINTENANCE_MODE`: in caso di incidente di sicurezza, sospetto data breach o manutenzione straordinaria, è possibile commutare l'applicazione in isolamento istantaneo, impedendo l'accesso alla dashboard e mostrando la `MaintenancePage`.

---

## 3. Misure Organizzative Implementate

1. **Minimizzazione dei Dati Richiesti:**
   - Non viene mai richiesto il Codice Fiscale, il numero di tessera sanitaria o l'indirizzo di residenza della persona assistita.
   - Per l'età del paziente viene memorizzato solo l'anno di nascita (`birth_year`) anziché la data esatta.
2. **Accountability & Log di Audit:**
   - La tabella `public.audit_log` traccia le modifiche alle terapie, alle assunzioni e agli eventi di sistema. Le righe del log sono protette e non possono essere modificate o cancellate dagli utenti comuni.
3. **Procedura di Cancellazione Sicura (Diritto all'Oblio):**
   - Disponibile direttamente nell'interfaccia utente (Self-service) tramite la RPC `delete_my_account`, che elimina a cascata tutti i record personali e sanitari dal database relazionale.

---

## 4. Punti di Miglioramento della Sicurezza Identificati (Action Plan)

1. **Bucket `therapy-photos` da rendere Private:** Sostituire la policy di lettura pubblica con generazione di Signed URLs temporanei (durata 1 ora) accessibili solo a caregiver autorizzati.
2. **CSP (Content Security Policy) Rigida:** Implementare header HTTP `Content-Security-Policy` negli header generati dal Cloudflare Worker (`_headers`) per impedire cross-site scripting (XSS) e iniezioni di script esterni.
3. **Autenticazione a Due Fattori (MFA / 2FA):** Valutare l'attivazione della funzionalità MFA di Supabase (TOTP) per i caregiver con ruolo di titolare del gruppo.
