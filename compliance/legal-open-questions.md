# Questioni Legali e Tecniche Aperte (Legal & Technical Open Questions)
**Progetto:** FamilyMed  
**Riferimento normativo:** GDPR (Reg. UE 2016/679), D.lgs. 196/2003, MDR (Reg. UE 2017/745)  
**Data ultimo aggiornamento:** 14 Settembre 2026  
**Stato:** Documento di lavoro per confronto con il consulente legale / DPO / commercialista  

---

## 1. Natura Giuridica del Titolare e Nomina del DPO

### ❓ Domanda 1.1: Qual è la forma giuridica del Titolare del Trattamento?
- **Stato attuale:** Nel file `src/routes/privacy.tsx` e `src/lib/legal-contact.ts` sono presenti i placeholder `[NOME COGNOME / RAGIONE SOCIALE]`, `[P.IVA]` e `[CITTÀ]`.
- **Azione richiesta:** Sostituire con i dati fiscali reali prima della pubblicazione online (es. Ditta Individuale, Libero Professionista o SRL/Startup Innovativa).

### ❓ Domanda 1.2: È obbligatoria la nomina del DPO (Data Protection Officer)?
- **Norma di riferimento:** Art. 37.1.c GDPR (il DPO è obbligatorio se le attività principali del Titolare consistono nel trattamento, **su larga scala**, di categorie particolari di dati personali ex Art. 9).
- **Quesito per il legale:** In fase iniziale (MVP / primi 100-500 utenti), l'app non è considerata "su larga scala". A partire da quale soglia metrica (numero di assistiti / traffico mensile) scatta l'obbligo formale di nominare un DPO esterno e comunicarlo al Garante della Privacy?

---

## 2. Consenso Informato per Pazienti Anziani o Fragili (Rappresentanza)

### ❓ Domanda 2.1: Chi può prestare il consenso per il genitore anziano non autosufficiente?
- **Scenario tipico in FamilyMed:** Un figlio (caregiver) crea l'account per monitorare la terapia del genitore 85enne affetto da decadimento cognitivo lieve o impossibilitato a usare lo smartphone.
- **Rischio giuridico:** Il caregiver inserisce dati sanitari particolari di una terza persona senza che quest'ultima abbia firmato o cliccato personalmente il consenso privacy.
- **Quesiti per il legale:**
  1. È sufficiente prevedere nel form di aggiunta paziente una dichiarazione di manleva del tipo: *"Dichiaro sotto la mia responsabilità di essere autorizzato ad assistere il paziente e ad inserire i suoi dati in qualità di familiare / caregiver convivente o legale rappresentante"*?
  2. Come gestire i casi di **Amministrazione di Sostegno (AdS)** o tutela legale? È opportuno prevedere un campo facoltativo per caricare o indicare il decreto di nomina del Giudice Tutelare?

---

## 3. Qualificazione del Software: App o Dispositivo Medico (MDR)?

### ❓ Domanda 3.1: FamilyMed rischia di essere classificata come Dispositivo Medico (SaMD)?
- **Norma di riferimento:** Regolamento UE 2017/745 sui Dispositivi Medici (MDR) e Linee Guida MDCG 2019-11 sui software.
- **Analisi tecnica:** 
  - FamilyMed fornisce promemoria orari, conteggio scorte e registrazione di valori (pressione, glicemia).
  - **NON** calcola dosaggi personalizzati in base a formule, **NON** fa diagnosi e **NON** modifica autonomamente la posologia medica.
- **Quesito per il legale:**
  - Quali clausole di limitazione di responsabilità (Disclaimer) devono essere inserite nei Termini di Servizio (`termini.tsx`) per blindare il software come mero *"ausilio organizzativo/mnemonico"* ed escludere categoricamente la qualifica di Dispositivo Medico di Classe I/IIa?

---

## 4. Cookie Banner e Tracciamento (Direttiva ePrivacy)

### ❓ Domanda 4.1: È necessario un banner dei cookie (es. Iubenda, Cookiebot)?
- **Analisi tecnica:**
  - FamilyMed utilizza esclusivamente **LocalStorage** per il token di sessione autenticato Supabase (`sb-*-auth-token`);
  - **Zero cookie di terze parti** (nessun Google Analytics, Meta Pixel, Hotjar o tracker pubblicitari);
  - **Cloudflare Turnstile** opera senza cookie di profilazione o tracciamento dell'identità dell'utente.
- **Quesito per il legale:**
  - È confermato che, in assenza totale di cookie analitici o di profilazione, **NON è obbligatorio il banner di blocco preventivo dei cookie con pulsanti Accetta/Rifiuta**, ma è sufficiente una chiara informativa tecnica nella Privacy Policy?

---

## 5. Rilievi Tecnici Identificati durante l'Audit (Da Sanare)

Questi 3 punti sono stati rilevati durante l'audit del codice e richiedono un intervento correttivo da parte del team di sviluppo:

### ⚠️ Rilievo Tecnico 5.1: Protezione delle Immagini Farmaci nello Storage Supabase
- **Problema:** La policy `therapy_photos_public_read` su `storage.objects` è attualmente permissiva per `anon, authenticated`. Chiunque conosca o indovini il path pubblico dell'immagine può visualizzarla senza effettuare il login.
- **Soluzione proposta:** Rimuovere l'accesso pubblico dal bucket `therapy-photos` e adottare la generazione di **Signed URLs** con scadenza a 60 minuti (`supabase.storage.from('therapy-photos').createSignedUrl(path, 3600)`), generati solo per utenti autenticati e verificati dalle RLS.

### ⚠️ Rilievo Tecnico 5.2: Aggiornamento della Funzione `export_my_data()`
- **Problema:** La stored procedure che gestisce il diritto alla portabilità dei dati (Art. 20 GDPR) esporta profili, terapie ed eventi, ma non include i dati sanitari introdotti successivamente:
  - `public.vital_signs` (parametri vitali)
  - `public.wellness_notes` (note cliniche / sintomi)
  - `public.patient_medical_profiles` (cartella medica / allergie)
- **Soluzione proposta:** Aggiungere queste tre tabelle al payload JSON restituito dalla RPC `export_my_data()`.

### ⚠️ Rilievo Tecnico 5.3: Pulizia Storage su Cancellazione Account (`delete_my_account`)
- **Problema:** Quando un utente elimina il proprio account, la RPC cancella le righe nel database PostgreSQL, ma i file fisici memorizzati nel bucket storage di Supabase rimangono archiviati come file orfani.
- **Soluzione proposta:** Integrare una funzione o chiamata API di rimozione dei file associati alla cartella `therapies/{therapy_id}/*` prima della distruzione delle righe relazionali.
