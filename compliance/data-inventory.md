# Registro e Inventario dei Trattamenti Dati (Data Inventory)
**Progetto:** FamilyMed  
**Riferimento normativo:** Art. 30 Regolamento (UE) 2016/679 (GDPR)  
**Data ultimo aggiornamento:** 14 Settembre 2026  
**Stato:** Bozza tecnica di audit interno  

---

## 1. Premessa e Ambito di Applicazione

FamilyMed è un'applicazione web progressiva (PWA) finalizzata alla gestione, monitoraggio e promemoria della terapia farmacologica e dello stato di salute per persone fragili/anziane e per il relativo gruppo di cura familiare (caregiver).

Trattandosi di un servizio che elabora **dati relativi alla salute (art. 9 GDPR)**, il presente inventario mappa puntualmente:
- Ciascuna categoria di dato in ingresso;
- La base giuridica e la finalità;
- Il flusso di memorizzazione (tabelle DB, bucket storage, storage client);
- I soggetti autorizzati all'accesso (tramite Row Level Security e ruoli);
- I tempi massimi di conservazione (Data Retention Policy);
- Le misure di cifratura e sicurezza applicate.

---

## 2. Inventario Dati per Entità del Modello Dati

### 2.1 Utenti & Account (`auth.users`, `public.profiles`, `public.user_roles`)

| Campo / Dato | Tipologia GDPR | Finalità | Origine / Input | Dove risiede | Chi può leggerlo (RLS) | Retention | Note Tecniche |
|---|---|---|---|---|---|---|---|
| **ID Utente** (`id` / `user_id`) | Dato identificativo univoco (pseudonimo) | Identificazione univoca e segregazione RLS | Generato da Supabase Auth (UUID v4) | `auth.users`, `public.profiles`, foreign keys | Solo utente loggato e trigger di sistema | Fino a cancellazione account | Utilizzato in tutte le policy RLS come `auth.uid()` |
| **Email** (`email`) | Dato personale comune | Autenticazione, comunicazioni di servizio, reset password | Form Registrazione / Login | `auth.users` (Auth schema protetto), `profiles.email` | Solo il proprietario dell'account (`id = auth.uid()`) | Fino a cancellazione account | Gestita da Supabase Auth. Mai condivisa con terzi |
| **Password** (Hash) | Credenziale di sicurezza | Autenticazione | Form Registrazione / Reset | `auth.users.encrypted_password` | Inaccessibile (solo Auth engine interno di Supabase) | Fino a cancellazione o cambio password | Cifrata con bcrypt/argon2. Nessun operatore può vederla in chiaro |
| **Nome visualizzato** (`name`) | Dato personale comune | Personalizzazione UI, identificazione all'interno del gruppo di cura | Form Registrazione / Impostazioni profilo | `public.profiles.name`, `public.caregivers.name` | Utente stesso; Caregiver collegati allo stesso paziente; Paziente collegato | Fino a cancellazione account | Visibile ai membri autorizzati della cerchia di cura |
| **Ruolo primario** (`role`) | Dato personale comune | Logica applicativa (Paziente vs Caregiver) | Scelta utente alla registrazione | `public.user_roles.role`, `profiles.role` | Utente autenticato (`user_id = auth.uid()`) | Fino a cancellazione account | Valori ammessi: `'caregiver'`, `'paziente'` |
| **Piano di abbonamento** (`subscription_plan`, `subscription_plan_own`) | Dato contrattuale/amministrativo | Gating funzionalità e limiti applicativi (Free, Pro, Max) | Scelta utente / acquisto | `public.profiles` | Utente stesso; propagato via trigger DB ai membri del gruppo | Fino a cancellazione account | Sincronizzato con trigger DB (`compute_effective_plan`) |

---

### 2.2 Pazienti (`public.patients`)

| Campo / Dato | Tipologia GDPR | Finalità | Origine / Input | Dove risiede | Chi può leggerlo (RLS) | Retention | Note Tecniche |
|---|---|---|---|---|---|---|---|
| **ID Paziente** (`id`) | Identificativo tecnico | Collegamento relazioni cliniche | Generato client/DB (es. `p_uuid`) | `public.patients.id` | Paziente stesso; Titolare (Owner); Caregiver collegati con link attivo | Fino a cancellazione paziente / account | Chiave primaria testuale |
| **Nome Paziente** (`name`) | Dato personale comune / identificativo | Identificazione della persona assistita | Inserito dall'Owner o dal Paziente | `public.patients.name` | Paziente stesso, Owner, Caregiver collegati | Fino a cancellazione paziente / account | Escluso se paziente sospeso da downgrade |
| **Anno di Nascita** (`birth_year`) | Dato anagrafico | Calcolo età approssimativa (senza data esatta per minimizzazione) | Inserito dall'Owner | `public.patients.birth_year` | Paziente stesso, Owner, Caregiver collegati | Fino a cancellazione paziente / account | **Dato minimizzato**: non si richiede la data di nascita completa |
| **ID Utente collegato** (`user_id`) | Identificativo | Se il paziente ha un account proprio per confermare le dosi | Associazione profilo utente | `public.patients.user_id` | Paziente stesso, Owner, Caregiver collegati | Fino a cancellazione | Nullable se il paziente è gestito al 100% da caregiver |
| **Owner / Caregiver Primario** (`owner_user_id`, `primary_caregiver_id`) | Identificativo | Titolarità del gruppo e gestione permessi | UUID utente creatore | `public.patients` | Paziente stesso, Owner, Caregiver collegati | Fino a cancellazione | Determina la proprietà e il piano applicato |
| **Data Sospensione** (`suspended_at`) | Dato tecnico / stato servizio | Gestione finestra 30 giorni pre-cleanup downgrade | Trigger / RPC `perform_downgrade` | `public.patients.suspended_at` | Owner (per gestione e ripristino); Caregiver non vedono righe sospese | Max 30 giorni, poi DELETE definitivo | Pulizia automatica notturna via cron `pg_cron` |

---

### 2.3 Terapie Farmacologiche (`public.therapies`) — *DATO SANITARIO (ART. 9 GDPR)*

| Campo / Dato | Tipologia GDPR | Finalità | Origine / Input | Dove risiede | Chi può leggerlo (RLS) | Retention | Note Tecniche |
|---|---|---|---|---|---|---|---|
| **Nome Farmaco** (`name`) | **Dato Sanitario (Art. 9)** | Indicazione del farmaco da assumere | Inserito da Caregiver/Paziente | `public.therapies.name` | Owner del paziente; Paziente; Caregiver collegati (se non sospeso) | Fino a cancellazione terapia o account; 30gg se sospeso da downgrade | Rivela condizioni di salute patologiche (es. insulina, antidepressivo, chemioterapico) |
| **Dosaggio & Quantità** (`dosage`, `quantity`) | **Dato Sanitario (Art. 9)** | Posologia terapeutica | Inserito in form terapia | `public.therapies.dosage`, `quantity` | Owner, Paziente, Caregiver attivi | Durata della terapia | Es. "1 compressa", "20 gocce", "500 mg" |
| **Categoria, Icona, Colore** (`category`, `icon`, `color`) | Dato descrittivo | Facilitazione visiva per persone anziane | Form creazione terapia | `public.therapies` | Owner, Paziente, Caregiver attivi | Durata della terapia | Aiuta l'anziano a riconoscere il farmaco |
| **Orari & Ricorrenza** (`times`, `recurrence`) | **Dato Sanitario (Art. 9)** | Schedulazione assunzioni | Form creazione terapia | `public.therapies.times`, `recurrence` | Owner, Paziente, Caregiver attivi | Durata della terapia | JSONB con tipo ricorrenza (`daily`, `weekdays`, `every_x_days`) |
| **Date Inizio/Fine** (`start_date`, `end_date`) | Dato clinico/temporale | Arco temporale della cura | Form creazione terapia | `public.therapies` | Owner, Paziente, Caregiver attivi | Durata della terapia | Permette di disattivare automaticamente terapie a termine |
| **Note Cliniche** (`notes`, `notes_enc`) | **Dato Sanitario (Art. 9)** | Indicazioni speciali (es. "a stomaco pieno") | Form terapia | `public.therapies.notes` / `notes_enc` (bytea cifrato) | Owner, Paziente, Caregiver attivi | Durata della terapia | Predisposto per cifratura simmetrica AES-256 (Vault) |
| **Foto Farmaco & Confezione** (`photo_drug`, `photo_package`) | **Dato Sanitario (Art. 9)** | Identificazione visiva della pillola / scatola | Fotocamera / Upload file utente | Bucket Supabase Storage `therapy-photos`, URL in DB | *Policy Storage: attualmente anon/auth (Vedi Sezione 4 - Rilievo Tecnico)* | Durata della terapia | Foto caricate su storage; vietato salvataggio base64 in DB |
| **Scorte & Alert** (`packs`, `pills_remaining`, `low_stock_threshold`) | Dato gestionale sanitario | Monitoraggio esaurimento scorte farmaci | Form terapia / Aggiornato da conferme | `public.therapies` | Owner, Paziente, Caregiver attivi | Durata della terapia | Utilizzato per avvisi di riordino farmaci |
| **Stato Sospensione** (`suspended`, `suspended_at`, `suspended_reason`) | Dato gestionale | Sospensione clinica o amministrativa (downgrade) | Client / RPC Downgrade | `public.therapies` | Owner vede tutto; Caregiver vedono solo attivi | Se downgrade: 30gg conservazione poi eliminazione cron | `suspended_reason = 'downgrade'` |

---

### 2.4 Eventi & Dosi Assunte (`public.events`) — *DATO SANITARIO (ART. 9 GDPR)*

| Campo / Dato | Tipologia GDPR | Finalità | Origine / Input | Dove risiede | Chi può leggerlo (RLS) | Retention | Note Tecniche |
|---|---|---|---|---|---|---|---|
| **Dose Schedulata** (`therapy_id`, `scheduled_at`) | **Dato Sanitario (Art. 9)** | Promemoria assunzione programmata | Generato da `process_dose_schedule()` | `public.events` | Owner, Paziente, Caregiver attivi (Free: max 7gg; Pro/Max: 180gg) | **Pro/Max:** 180 giorni; **Free:** 30 giorni (cron notturni) | Traccia orari esatti in cui il farmaco doveva essere assunto |
| **Esito Assunzione** (`status`: taken, skipped, snoozed, missed) | **Dato Sanitario (Art. 9)** | Verifica dell'aderenza terapeutica | Tap utente (Paziente o Caregiver) | `public.events.status`, `stage` | Owner, Paziente, Caregiver attivi (Free: max 7gg; Pro/Max: 180gg) | 180 giorni (Pro/Max), 30 giorni (Free) | Dimostra se e quando il paziente ha preso il farmaco |
| **Data/Ora Effettiva** (`taken_at`, `confirmed_by`) | **Dato Sanitario (Art. 9)** | Tracciabilità oraria effettiva | Timestamp al momento della conferma | `public.events` | Owner, Paziente, Caregiver attivi | 180 giorni (Pro/Max), 30 giorni (Free) | `confirmed_by` memorizza l'UUID di chi ha registrato l'assunzione |
| **Timeline Evento** (`timeline`) | Dato di audit clinico | Tracciamento stati (programmato -> notificato -> confermato/rimandato) | Trigger & funzioni di sistema | `public.events.timeline` (JSONB) | Owner, Paziente, Caregiver attivi | 180 giorni (Pro/Max), 30 giorni (Free) | Array storico eventi dose |

---

### 2.5 Parametri Vitali & Note di Benessere (`public.vital_signs`, `public.wellness_notes`) — *DATO SANITARIO (ART. 9 GDPR)*

| Campo / Dato | Tipologia GDPR | Finalità | Origine / Input | Dove risiede | Chi può leggerlo (RLS) | Retention | Note Tecniche |
|---|---|---|---|---|---|---|---|
| **Parametri Vitali** (`kind`, `value_primary`, `value_secondary`, `measured_at`) | **Dato Sanitario (Art. 9)** | Monitoraggio parametri clinici (pressione, glicemia, peso, saturazione, temperatura, battito) | Inserito da Caregiver o Paziente | `public.vital_signs` | Solo piani Pro/Max: Owner, Paziente, Caregiver autorizzati | 90 giorni full resolution -> 1 misurazione/die -> delete a 24/60 mesi | Include valori come sistolica/diastolica, glicemia mg/dL |
| **Note Cliniche / Sintomi** (`category`, `symptoms`, `note`, `occurred_at`) | **Dato Sanitario (Art. 9)** | Diario clinico e osservazioni dello stato di salute | Inserito da Caregiver/Paziente | `public.wellness_notes` | Owner, Paziente, Caregiver (Free: solo ultimi 7 giorni; Pro/Max: 24 mesi) | 24 mesi (cron notturno `wellness-notes-cleanup-daily`) | Descrizioni testuali dello stato di benessere o malessere dell'anziano |

---

### 2.6 Cartella Clinica & Anamnesi (`public.patient_medical_profiles`) — *DATO SANITARIO (ART. 9 GDPR)*

| Campo / Dato | Tipologia GDPR | Finalità | Origine / Input | Dove risiede | Chi può leggerlo (RLS) | Retention | Note Tecniche |
|---|---|---|---|---|---|---|---|
| **Gruppo Sanguigno** (`blood_type`) | **Dato Sanitario (Art. 9)** | Informazione salvavita in caso di emergenza | Form profilo medico | `patient_medical_profiles` | Owner, Paziente, Caregiver attivi | Fino a cancellazione paziente / account | Es. "A+", "0-" |
| **Allergie** (`allergies`) | **Dato Sanitario (Art. 9)** | Prevenzione reazioni avverse gravi | Form profilo medico | `patient_medical_profiles` | Owner, Paziente, Caregiver attivi | Fino a cancellazione paziente / account | Es. "Allergia penicillina", "Lattosio" |
| **Patologie Croniche** (`chronic_conditions`) | **Dato Sanitario (Art. 9)** | Quadro anamnestico del paziente | Form profilo medico | `patient_medical_profiles` | Owner, Paziente, Caregiver attivi | Fino a cancellazione paziente / account | Es. "Ipertensione", "Diabete tipo 2", "Cardiopatia" |
| **Dispositivi Medici** (`medical_devices`) | **Dato Sanitario (Art. 9)** | Informazione per soccorritori/caregiver | Form profilo medico | `patient_medical_profiles` | Owner, Paziente, Caregiver attivi | Fino a cancellazione paziente / account | Es. "Pacemaker", "Apparecchio acustico" |
| **Contatti Emergenza & Medico** (`primary_physician_name`, `primary_physician_phone`, `emergency_contacts`) | Dati di contatto / terzi | Contatto rapido in caso di emergenza o consulto | Inserito dal caregiver | `patient_medical_profiles` | Owner, Paziente, Caregiver attivi | Fino a cancellazione paziente / account | Dati personali di terzi (medico curante, contatti familiari) |

---

### 2.7 Log di Audit & Consensi (`public.audit_log`, `public.user_consents`)

| Campo / Dato | Tipologia GDPR | Finalità | Origine / Input | Dove risiede | Chi può leggerlo (RLS) | Retention | Note Tecniche |
|---|---|---|---|---|---|---|---|
| **Consensi Privacy/Termini** (`kind`, `granted`, `user_agent`, `created_at`) | Prova giuridica di conformità (Art. 7.1) | Dimostrare il consenso esplicito a privacy e dati sanitari | Form di registrazione / aggiornamento | `public.user_consents` | Solo l'utente autenticato (`user_id = auth.uid()`) | Tutta la durata dell'account + periodo prescrizionale (10 anni) | Memorizza timestamp UTC, tipo consenso, User-Agent browser |
| **Log di Audit Clinico/Sicurezza** (`actor_id`, `actor_role`, `action`, `changed_fields`, `detail`) | Accountability & Sicurezza (Art. 5.2, Art. 32) | Tracciamento modifiche a farmaci, dosi, accessi | Trigger automatici su INSERT/UPDATE/DELETE | `public.audit_log` | Owner e caregiver collegati al paziente | 90–180 giorni (cron notturno) | Immutabile: policy abilitata solo per INSERT di sistema |

---

## 3. Servizi Esterni & Terze Parti (Subprocessori)

| Fornitore / Servizio | Ruolo GDPR | Sede Legale & Server | Dati Trattati | Base Giuridica Trasferimento |
|---|---|---|---|---|
| **Supabase Inc.** | Responsabile del Trattamento (Sub-processor) | USA (Sede) / **Server EU (es. AWS Frankfurt `eu-central-1`)** | Database PostgreSQL, Auth, Storage foto, Cron jobs, Realtime | Data Processing Addendum (DPA) con Clausole Contrattuali Standard (SCC) / Data Privacy Framework |
| **Cloudflare, Inc.** | Responsabile del Trattamento (Sub-processor) | USA (Sede) / **Global Edge Network (CDN/WAF)** | Indirizzi IP di transito, Turnstile Captcha (token crittografico anti-bot), Hosting asset statici frontend | DPA Cloudflare con SCC / Data Privacy Framework. Nessun dato sanitario salvato nei log CDN |
| **Provider Email Transazionali** (Supabase Auth / Custom SMTP) | Sub-processor comunicazioni | Dipende dalla configurazione (EU/USA) | Indirizzo email destinatario, token monouso per conferma/reset password | Necessario per l'esecuzione del contratto (reset password, inviti) |
| **Web Browser Notification API** | Locale / OS | Sul dispositivo dell'utente | Titolo notifica, orario farmaco | **Nessun server terzo**: le notifiche web attuali sfruttano l'API HTML5 nativa locale del browser |
| **Libreria PDF (`jspdf`)** | Locale nel browser | 100% Client-side nel browser dell'utente | Dati terapia, storico dosi | **Zero trasmissione a terzi**: il PDF viene generato nella memoria RAM del browser e scaricato in locale |
| **Lovable (Development & Error Reporting)** | Piattaforma di sviluppo (Staging/Dev) | USA / Cloud | Stack trace errori client, route URL (in `reportLovableError`) | Da disattivare o anonimizzare totalmente in produzione |

---

## 4. Rilievi Tecnici Emersi dall'Audit del Codice (Azioni Correttive)

Nel corso dell'analisi tecnica del codice e delle migrazioni sono emerse 3 evidenze critiche da sanare:

1. **Storage Bucket `therapy-photos` con lettura pubblica `anon`**:
   - *Evidenza attuale:* La policy `therapy_photos_public_read` su `storage.objects` consente `SELECT TO anon, authenticated USING (bucket_id = 'therapy-photos')`.
   - *Rischio GDPR:* Le foto dei farmaci (dati sanitari art. 9) sono accessibili a chiunque conosca o indovini l'URL del file, anche senza autenticazione.
   - *Azione correttiva:* Trasformare il bucket in **Private** e generare Signed URLs a scadenza breve (es. 60 minuti), oppure limitare la SELECT solo a utenti autenticati autorizzati (`is_primary_of` o `is_caregiver_of`).
2. **RPC `export_my_data()` incompleta rispetto alle nuove tabelle**:
   - *Evidenza attuale:* La funzione di esportazione per la portabilità dati (Art. 20) estrae profili, pazienti, terapie, eventi e notifiche, ma **non include** `vital_signs`, `wellness_notes` e `patient_medical_profiles`.
   - *Azione correttiva:* Aggiungere l'estrazione di queste tabelle nella RPC per garantire la portabilità integrale dei dati.
3. **RPC `delete_my_account()` orfana di file Storage**:
   - *Evidenza attuale:* Quando un utente elimina il proprio account, il database cancella a cascata le righe di `patients` e `therapies`, ma le immagini caricate sul bucket `therapy-photos` restano orfane nello storage di Supabase.
   - *Azione correttiva:* Integrare nella procedura di cancellazione la pulizia degli oggetti collegati in `storage.objects`.
