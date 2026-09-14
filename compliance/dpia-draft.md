# Bozza di Valutazione d'Impatto sulla Protezione dei Dati (DPIA Draft)
**Progetto:** FamilyMed  
**Riferimento normativo:** Art. 35 Regolamento (UE) 2016/679 (GDPR) e Linee Guida WP248 rev.01 (EDPB)  
**Data ultimo aggiornamento:** 14 Settembre 2026  
**Stato:** Documentazione tecnica di audit interno  

---

## 1. Perché la DPIA è Obbligatoria per FamilyMed

Ai sensi dell'art. 35, par. 1 del GDPR, quando un trattamento può presentare un **rischio elevato** per i diritti e le libertà delle persone fisiche, il Titolare del trattamento effettua, prima di procedere al trattamento, una valutazione dell'impatto dei trattamenti previsti sulla protezione dei dati personali.

In base ai criteri definiti dall'European Data Protection Board (EDPB) e dal Garante Privacy italiano (Delibera n. 467/2018 - Elenco delle tipologie di trattamenti soggetti a DPIA), FamilyMed soddisfa contemporaneamente **almeno 3 criteri scatenanti**:
1. **Dati particolari (Art. 9 GDPR):** Trattamento di dati relativi alla salute, farmaci, dosaggi e parametri biometrici/vitali;
2. **Soggetti vulnerabili:** Trattamento di dati riferiti a persone anziane, malati cronici o soggetti con ridotta autonomia o decadimento cognitivo;
3. **Monitoraggio sistematico e tracciamento temporale:** Schedulazione automatizzata al minuto di orari, dosi e verifica continua dell'aderenza terapeutica.

---

## 2. Descrizione Sistematica del Trattamento

- **Finalità del trattamento:** Supportare la gestione domiciliare e familiare della terapia farmacologica, riducendo gli errori di dosaggio e le dimenticanze tramite promemoria automatici, monitoraggio condiviso tra familiari e storicizzazione delle assunzioni.
- **Natura dei dati:** Dati anagrafici minimizzati (nome, anno di nascita), dati di contatto (email caregiver), dati sanitari particolari (nome farmaci, dosaggi, confezioni, scorte, esiti assunzione dosi, note cliniche, pressione, glicemia, peso, saturazione).
- **Destinatari dei dati:** Esclusivamente i membri autorizzati dello specifico "gruppo di cura" (il paziente stesso e i caregiver da lui o dal suo titolare espressamente invitati tramite codice monouso).
- **Infrastruttura tecnologica:** PWA moderna con frontend su Cloudflare Edge, backend PostgreSQL e Storage su Supabase (AWS Germania), nessun tracciamento di terze parti (Zero cookie di profilazione/marketing).

---

## 3. Valutazione della Necessità e Proporzionalità

| Requisito GDPR | Come è Garantito in FamilyMed | Valutazione di Conformità |
|---|---|:---:|
| **Liceità del Trattamento (Artt. 6 e 9)** | Il trattamento è fondato sull'esecuzione del contratto di servizio (Art. 6.1.b) e sul **consenso esplicito** dell'utente per i dati sanitari (Art. 9.2.a), raccolto al momento dell'iscrizione e revocabile in ogni momento. | **CONFORME** |
| **Minimizzazione dei Dati (Art. 5.1.c)** | Non viene richiesto Codice Fiscale, indirizzo di casa o data esatta di nascita (solo l'anno). I parametri vitali non obbligatori sono facoltativi. | **CONFORME** |
| **Limitazione della Conservazione (Art. 5.1.e)** | Dosi ed eventi sono eliminati automaticamente a 30gg (Free) o 180gg (Pro/Max); le notifiche a 30gg; i parametri vitali sono sottoposti a downsampling a 90gg e cancellazione a 24/60 mesi. | **CONFORME** |
| **Trasparenza e Diritti (Artt. 12-22)** | Informativa privacy dedicata, funzione di esportazione JSON in-app (Art. 20) e cancellazione istantanea con un clic (Art. 17). | **CONFORME** |

---

## 4. Identificazione e Valutazione dei Rischi per gli Interessati

### Rischio 1: Accesso Abusivo o Divulgazione di Dati Sanitari (Confidenzialità)
- **Scenario di minaccia:** Un caregiver malintenzionato o un attaccante esterno riesce a visualizzare la lista dei farmaci assunti dal paziente (es. farmaci per disturbi psichiatrici, HIV, demenza o oncologia).
- **Impatto sull'interessato:** Molto grave (danno morale, discriminazione, perdita di privacy personale).
- **Probabilità originaria:** Media.
- **Misure di mitigazione implementate:**
  - Segregazione assoluta via Row Level Security (RLS) a livello di motore PostgreSQL;
  - Connessioni cifrate con TLS 1.3 / HTTPS;
  - Codici invito famiglia temporanei (7 giorni) e a riscatto singolo;
  - Database cifrato a riposo (AES-256).
- **Livello di rischio residuo:** **BASSO / ACCETTABILE**.

---

### Rischio 2: Manomissione o Alterazione di Terapie e Dosaggi (Integrità)
- **Scenario di minaccia:** Modifica non autorizzata dell'orario o del quantitativo di una compressa (es. raddoppio dose o eliminazione promemoria vitale).
- **Impatto sull'interessato:** Molto grave / critico (rischio di sovradosaggio o interruzione di cure salvavita).
- **Probabilità originaria:** Media.
- **Misure di mitigazione implementate:**
  - Solo i caregiver con ruolo autorizzato (`is_primary_of`) possono inserire o modificare terapie (`therapies: insert primary`, `therapies: update primary`);
  - Registrazione automatica e immutabile di ogni modifica terapeutica nella tabella `public.audit_log`;
  - Disclaimer contrattuale esplicito: FamilyMed è uno strumento di ausilio mnemonico e non si sostituisce al medico o al controllo umano.
- **Livello di rischio residuo:** **BASSO / ACCETTABILE**.

---

### Rischio 3: Mancato Funzionamento dei Promemoria (Disponibilità)
- **Scenario di minaccia:** Disservizio dell'hosting o blocco del cron `familymed-dose-scheduler`, con conseguente mancata ricezione dell'allarme per l'assunzione del farmaco.
- **Impatto sull'interessato:** Medio / Grave (dimenticanza della dose).
- **Probabilità originaria:** Bassa / Media.
- **Misure di mitigazione implementate:**
  - Il motore delle dosi genera in anticipo le dosi delle successive 24 ore;
  - La PWA è progettata per memorizzare in cache locale lo stato delle dosi;
  - Presenza di allarmi audio di riserva all'interno del client;
  - Ottimizzazione spinta del cron job per evitare blocchi e timeout sui limiti del piano Free.
- **Livello di rischio residuo:** **MEDIO-BASSO / ACCETTABILE**.

---

### Rischio 4: Accesso non autorizzato alle Immagini dei Farmaci tramite Storage
- **Scenario di minaccia:** URL delle fotografie dei farmaci (scatole con nome paziente o dosaggio) accessibili senza autenticazione tramite il bucket Supabase Storage.
- **Impatto sull'interessato:** Medio.
- **Probabilità originaria:** Rilevata come punto di attenzione nell'audit (`therapy_photos_public_read`).
- **Misure di mitigazione pianificate (Action Plan):**
  - Chiusura dell'accesso pubblico al bucket `therapy-photos`;
  - Adozione di URL firmati temporanei (Signed URLs) a scadenza oraria generati esclusivamente su richiesta autenticata del caregiver autorizzato.
- **Livello di rischio post-intervento:** **TRASCURABILE**.

---

## 5. Parere Conclusivo e Condizioni di Esercizio

Alla luce delle misure tecniche e organizzative attuate (RLS rigorosa, cifratura, minimizzazione, retention automatizzata da cron, audit log immutabile), il trattamento dei dati personali effettuato da FamilyMed presenta un **livello di rischio complessivo RESIDUO ACCETTABILE**, subordinato all'implementazione dei seguenti adempimenti operativi:
1. Chiusura a chiave privata del bucket Storage foto farmaci;
2. Formalizzazione della nomina a Responsabili del Trattamento (DPA) con Supabase e Cloudflare;
3. Pubblicazione dell'informativa privacy aggiornata con indicazione esatta degli estremi fiscali del Titolare.
