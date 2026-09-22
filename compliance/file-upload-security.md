# File Upload & Input Sanitization — audit e protezioni

**Data:** 20 Settembre 2026
**Perimetro:** ogni file che un utente può caricare (foto terapia, avatar
caregiver) e ogni campo di testo libero raggiungibile da un utente
autenticato (nome, note, allergie, diagnosi, ecc.).

---

## 1. Upload di file (foto)

### 1.1 Cosa protegge cosa — il modello di minaccia reale

Un dato tecnico importante, verificato ora: **la restrizione
`allowed_mime_types` di un bucket Supabase Storage controlla solo l'header
`Content-Type` dichiarato dal client al momento dell'upload, non il
contenuto reale (i byte) del file.** È un limite noto e tuttora aperto della
piattaforma stessa (non una svista di questo progetto). In altre parole: da
solo, un allow-list di MIME type **non impedisce** a un utente autenticato
di caricare un file qualunque dichiarando un `Content-Type` falso (es. un
file eseguibile o uno SVG con `<script>` dichiarato come `image/jpeg`).

Questo significa che la protezione reale contro un upload malevolo non può
basarsi solo su quella singola impostazione. Le protezioni effettive, a più
livelli, sono:

| Livello | Cosa fa | Bypassabile da chi controlla il client (bypassando la UI)? |
|---|---|---|
| **1. Ricompressione via canvas** (`src/lib/image-utils.ts`) | Ogni foto passa da `createImageBitmap()` (il decoder immagini reale del browser) e viene ridisegnata su un `<canvas>`, poi ri-esportata come JPEG nuovo. Il file che arriva a Storage non è mai il byte originale caricato: è un'immagine nuova generata dai soli pixel decodificati. Qualunque payload nascosto nel file originale (script, dati dopo la fine dell'immagine, metadati malevoli) non sopravvive a questo passaggio. | **Sì** — un utente che chiama direttamente l'API Storage (bypassando l'app) evita questo passaggio. |
| **2. Controllo "magic bytes"** (stessa funzione, appena aggiunto) | Prima di tentare la decodifica, si controllano i primi byte del file contro le firme reali di JPEG/PNG/WebP — non l'estensione, non il MIME dichiarato. Esclude esplicitamente SVG anche nei browser che lo decodificherebbero comunque. | Sì, stesso discorso — è un controllo lato client, migliora l'esperienza (errore chiaro, subito) ma non è di per sé un confine di sicurezza contro un attaccante che parla direttamente con l'API. |
| **3. `allowed_mime_types` + `file_size_limit` sui bucket** | Blocca upload che dichiarano un Content-Type fuori dall'elenco (jpeg/png/webp) o superano 5 MB (therapy-photos) / 2 MB (caregiver-avatars). Header-based, quindi aggirabile mentendo sull'header — ma resta un filtro reale contro errori accidentali e contro chi non si prende la briga di falsificarlo. | Sì (mentendo sull'header), ma alza comunque la soglia di sforzo richiesto. |
| **4. RLS su storage.objects** | Anche riuscendo a caricare un file "cattivo", solo chi ha già una relazione autorizzata (proprietario, caregiver collegato) può vederlo — non è un problema di accesso pubblico, resta comunque dentro il perimetro di fiducia della famiglia. | No — questo è enforcement lato database, non aggirabile dal client in nessun modo. |
| **5. Rendering SOLO via `<img>`, mai navigazione diretta** | **Questa è la protezione decisiva contro lo scenario peggiore** (SVG con script eseguibile mascherato da JPEG): i browser disabilitano l'esecuzione di script in un'immagine SVG caricata dentro un tag `<img>` — è un comportamento nativo dei browser, non qualcosa che il nostro codice deve implementare. Funziona SOLO se l'app non apre mai quell'URL in altro modo (navigazione diretta, `window.open`, `<a href target="_blank">` la eseguirebbe). Verificato: **nessun punto dell'app apre una foto in un altro modo** — commento di guardia aggiunto in `PrivatePhotoImg.tsx` per chi svilupperà in futuro. | No — è enforcement del browser, non del nostro codice, e non richiede che l'attaccante collabori. |

### 1.2 Conclusione onesta sul rischio residuo

Un utente autenticato e determinato **potrebbe** riuscire a far archiviare
nel bucket un file che non è davvero un'immagine, chiamando l'API Storage
direttamente con un `Content-Type` falsificato. Le conseguenze pratiche di
questo scenario, dato tutto il resto:
- **Non porta a esecuzione di codice** nel browser di altri utenti, perché il
  file viene sempre e solo mostrato dentro un `<img>` (punto 5 sopra).
- **Non è raggiungibile da estranei**, perché resta comunque dietro la RLS
  (punto 4) — al massimo lo vedrebbero altri familiari già collegati.
- Il rischio realistico che resta è: occupare quota Storage con file inutili
  (mitigato dal limite di dimensione), o — se qualcuno scaricasse
  manualmente il file e lo aprisse con un programma sbagliato sul proprio
  dispositivo — un rischio che ricade nella normale igiene "non aprire file
  da fonti che non controlli", non specifico di questa app.

### 1.3 Se in futuro si vuole eliminare anche questo rischio residuo

L'unico modo per validare davvero il *contenuto* di un file lato server (non
solo l'header dichiarato) è un controllo **dopo** l'upload, che scarichi il
file e ne legga i byte reali — in un'architettura solo-Supabase questo
richiede un Database Webhook su `storage.objects` (evento INSERT) che
invochi una Edge Function la quale scarica il file, verifica i magic bytes
lato server, ed elimina l'oggetto se non conforme. Non l'ho implementato ora
perché reintrodurrebbe una Edge Function proprio dopo aver ripulito quelle
inutilizzate (vedi conversazione precedente) — ma è un'opzione disponibile,
economica in termini di quota (un'invocazione per ogni upload di foto, un
volume tipicamente basso), se in futuro si vuole chiudere anche questo
scenario residuo (che oggi, per le ragioni sopra, non porta comunque a un
impatto concreto).

---

## 2. Input testuali — audit e cosa è stato corretto

### 2.1 XSS (script iniettato tramite testo salvato)

**Verificato: nessun rischio trovato.** Cercato in tutto `src/`:
`dangerouslySetInnerHTML` e assegnazioni dirette a `.innerHTML` — **zero
occorrenze**. Ogni testo utente (nome terapia, note, allergie, ecc.) passa
sempre dal rendering standard di React (`{variabile}`), che **esegue
automaticamente l'escape** di qualunque carattere HTML — uno stored-XSS
classico non è possibile in nessun punto di questa app.

### 2.2 SQL injection

**Verificato: nessun rischio trovato.** Cercato in tutte le funzioni del
database: nessun uso di `EXECUTE` con stringhe costruite dinamicamente (il
pattern classico vulnerabile). Ogni funzione usa query statiche con
parametri tipizzati — l'unico modo in cui Postgres esegue query in questa
codebase, che per costruzione non permette a un valore di essere
interpretato come SQL eseguibile.

### 2.3 🟠 Trovato e corretto: nessun limite di lunghezza da nessuna parte

**Questo era un problema reale.** Nessuna colonna di testo del database
aveva un vincolo di lunghezza (verificato: zero `CHECK char_length`/`length`
in tutto lo schema). Un utente autenticato poteva, con una chiamata diretta
all'API (bypassando l'interfaccia), inviare stringhe di qualunque dimensione
per nome terapia, note cliniche, allergie, ecc. — un modo semplice per far
crescere il database verso il limite di 500 MB del piano free, oltre a un
problema di igiene dei dati generale.

**Corretto** con la migrazione `20260920000000_input_length_limits.sql`,
che aggiunge un limite ragionevole (generoso rispetto all'uso reale, ma non
illimitato) a ogni colonna di testo libero raggiungibile da un utente:

| Tabella.colonna | Limite | Tipo di controllo |
|---|---|---|
| `therapies.name` | 120 car. | CHECK |
| `therapies.dosage` | 60 car. | CHECK |
| `therapies.category` | 60 car. | CHECK |
| `therapies.notes` | 5.000 car. | CHECK |
| `therapies.times` | 20 elementi | CHECK (array) |
| `therapies.recurrence` | 2.000 car. (JSON serializzato) | CHECK |
| `patients.name` | 80 car. | CHECK |
| `caregivers.name` | 80 car. | CHECK |
| `caregivers.relation` | 60 car. | CHECK |
| `caregivers.notify` | 500 car. (JSON) | CHECK |
| `caregiver_patients.relationship` | 60 car. | CHECK |
| `patient_medical_profiles.diagnoses` | 3.000 car. | CHECK |
| `patient_medical_profiles.notes` | 3.000 car. | CHECK |
| `patient_medical_profiles.allergies` | 50 elementi, 200 car. ciascuno | CHECK (array + funzione di supporto) |
| `patient_medical_profiles.emergency_contacts` | 5.000 car. (JSON) | CHECK |
| `vital_signs.notes` | 500 car. | CHECK |
| `wellness_notes.note` | 2.000 car. | CHECK |
| `wellness_notes.symptoms` | 30 elementi, 100 car. ciascuno | CHECK |
| `events.note` | 500 car. | CHECK |
| `events.timeline` | 5.000 car. (JSON) | CHECK |
| `stock_movements.reason` | 200 car. | CHECK (difensivo: generato dal codice, non digitato) |
| `notifications.title`/`message` | 200 / 1.000 car. | CHECK (difensivo) |
| `audit_log.summary`/`detail`/`meta` | 2.000 / 5.000 / 5.000 car. | CHECK (difensivo) |

Aggiunti con `NOT VALID`: si applicano subito a ogni nuova scrittura, ma
**non** validano retroattivamente le righe già esistenti (evita che la
migrazione fallisca su dati storici sconosciuti da qui). Vedi il commento in
testa al file di migrazione per come validare anche lo storico in un
secondo momento, se lo si desidera.

**Allineati anche i limiti lato client** (`maxLength` sugli `<Input>`/
`<Textarea>` corrispondenti), così l'utente riceve un feedback immediato
nell'interfaccia invece di scoprire il limite solo con un errore dell'API:
`AddPatientDialog.tsx`, `AddTherapyDialog.tsx`, `MedicalProfileCard.tsx`,
`CaregiverProfileCard.tsx`, `pazienti.$id.famiglia.tsx`, `diario.tsx`,
`parametri.tsx`.

### 2.4 Path traversal / injection nei path di Storage

**Verificato: non applicabile.** I path degli oggetti Storage (foto
terapia, avatar caregiver) sono costruiti esclusivamente da identificativi
generati dal sistema (UUID/ID paziente, ID terapia, timestamp) — **mai** da
testo digitato dall'utente (nome, note, ecc.). Non c'è quindi alcun modo per
un valore testuale malevolo di alterare il percorso di un file su Storage.