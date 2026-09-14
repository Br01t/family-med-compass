# Procedura di Gestione delle Violazioni dei Dati Personali (Data Breach Policy)
**Progetto:** FamilyMed  
**Riferimento normativo:** Artt. 33 e 34 Regolamento (UE) 2016/679 (GDPR)  
**Data ultimo aggiornamento:** 14 Settembre 2026  
**Stato:** Documentazione tecnica di audit interno  

---

## 1. Definizione di Data Breach

Ai sensi dell'art. 4, par. 12 del GDPR, per **violazione dei dati personali** (*data breach*) si intende:
> *"la violazione di sicurezza che comporta accidentalmente o in modo illecito la distruzione, la perdita, la modifica, la divulgazione non autorizzata o l'accesso ai dati personali trasmessi, conservati o comunque trattati"*.

Nel contesto di FamilyMed, una violazione può riguardare:
- **Dati comuni:** Email, password hashate, nomi, ruoli.
- **Dati relativi alla salute (Art. 9 GDPR):** Nomi dei farmaci, posologie, scorte, esiti assunzione dosi, note cliniche, parametri vitali, anamnesi.

A causa della presenza di **dati sanitari di persone anziane/fragili**, qualsiasi incidente che comporti esfiltrazione o accesso abusivo è presunto a **RISCHIO ELEVATO** per i diritti e le libertà degli interessati.

---

## 2. Le 5 Fasi della Procedura di Risposta all'Incidente

```
[1. Rilevamento & Segnalazione] 
            ↓ (< 2 ore)
[2. Contenimento & Isolamento Tecnico]
            ↓ (< 12 ore)
[3. Valutazione del Rischio & Impatto]
            ↓ (< 48 ore)
[4. Notifica all'Autorità Garante (se dovuta, entro 72h)]
            ↓
[5. Comunicazione agli Interessati (se rischio elevato) & Remediation]
```

---

### Fase 1: Rilevamento e Segnalazione Interna
- **Fonti di rilevamento:**
  - Alert di sicurezza da Supabase (es. accessi anomali, spike anomali di chiamate API o egress dati);
  - Alert di sicurezza da Cloudflare (es. attacco DDoS, anomalie WAF);
  - Segnalazione da parte di un utente o sviluppatore;
  - Audit log interno (`public.audit_log`) con riscontro di accessi o cancellazioni non conformi.
- **Canale di allarme immediato:** Qualsiasi anomalia deve essere segnalata tempestivamente all'indirizzo tecnico del Titolare (`privacy@familymed.it` / cellulare di reperibilità tecnica).

---

### Fase 2: Contenimento Immediato e Azioni di Isolamento Tecnico
Obiettivo: bloccare immediatamente la perdita di dati e preservare le evidenze forensi.

1. **Attivazione Modalità Manutenzione / Kill Switch:**
   - Nel repository, commutare istantaneamente `MAINTENANCE_MODE = true` in `src/routes/__root.tsx` e rilasciare con `bun run build && bunx wrangler deploy`. L'applicazione blocca ogni interazione client mostrando la schermata di manutenzione.
2. **Revoca delle Chiavi API e Credenziali:**
   - Se vi è sospetto di compromissione delle credenziali di backend: rigenerare immediatamente la `service_role` key e le anon/publishable keys nella dashboard di Supabase.
   - Forzare il logout globale di tutte le sessioni utente tramite Supabase Auth Admin (`auth.admin.signOut()`).
3. **Blocco IP a Livello Edge (Cloudflare):**
   - Inserire regole di blocco WAF su Cloudflare per gli indirizzi IP o i pattern di user-agent malevoli.
4. **Preservazione dei Log:**
   - Salvare ed esportare i log di Postgres, i log di autenticazione Supabase e i log di accesso Cloudflare per le successive perizie.

---

### Fase 3: Valutazione del Rischio per i Diritti e le Libertà
Il Titolare del trattamento (con il supporto del consulente privacy/DPO se nominato) analizza:
- **Natura dei dati coinvolti:** Sono stati violati solo dati anagrafici o anche dati sanitari su terapie/patologie?
- **Volume e numero di interessati coinvolti:** Si tratta di un singolo account (es. credenziali deboli rubate) o dell'intero database?
- **Conseguenze potenziali:** Rischio di discriminazione, furto d'identità, danno alla reputazione, interruzione della continuità assistenziale (es. dosi farmaco non somministrate).
- **Crittografia applicata:** I dati esfiltrati erano cifrati in modo tale da risultare incomprensibili a chiunque non sia autorizzato?

---

### Fase 4: Notifica al Garante Privacy (Art. 33 GDPR)
Se la violazione presenta un rischio per i diritti e le libertà degli interessati:
- **Termine tassativo:** Entro **72 ore** dal momento in cui il Titolare ne è venuto a conoscenza.
- **Canale ufficiale:** Portale telematico del Garante per la Protezione dei Dati Personali (Italia):  
  👉 https://www.garanteprivacy.it/home/modulistica-e-servizi-online/notifica-data-breach
- **Contenuto della notifica preliminare:**
  1. Descrizione della natura della violazione (categoria e numero stimato di interessati e di record di dati personali);
  2. Nome e dati di contatto del punto di contatto dove ottenere ulteriori informazioni;
  3. Descrizione delle probabili conseguenze della violazione;
  4. Descrizione delle misure adottate o proposte per porre rimedio e attenuare i possibili effetti negativi.

---

### Fase 5: Comunicazione agli Interessati (Art. 34 GDPR)
Quando la violazione comporta un **rischio elevato** per i diritti e le libertà degli interessati:
- **Obbligo:** Il Titolare deve comunicare la violazione all'interessato **senza ingiustificato ritardo**.
- **Canale:** Email diretta a tutti gli utenti coinvolti + avviso prominente nell'applicazione.
- **Linguaggio:** Semplice e chiaro (evitare tecnicismi astrusi, specialmente rivolgendosi ad anziani e famiglie).
- **Consigli pratici forniti all'utente:**
  - Invito a cambiare immediatamente la password di FamilyMed e di altri servizi se utilizzavano la stessa password;
  - Istruzioni per verificare la correttezza delle terapie salvate e accertarsi che nessun dosaggio sia stato manomesso;
  - Contatti dedicati per supporto e assistenza privacy.

---

## 3. Registro Interno dei Data Breach

Ai sensi dell'art. 33, par. 5 del GDPR, il Titolare deve documentare qualsiasi violazione dei dati personali, comprese le circostanze, le conseguenze e le misure adottate, **anche per le violazioni non notificate al Garante** (per le quali è stato valutato un rischio nullo o trascurabile).

Il registro interno deve contenere per ogni evento:
1. Data e ora del rilevamento e data e ora stimata dell'accaduto;
2. Descrizione dell'evento e causa (es. errore umano, vulnerabilità software, attacco esterno, smarrimento dispositivo);
3. Categorie e numero di dati e interessati coinvolti;
4. Valutazione motivata del rischio (Basso / Medio / Elevato);
5. Decisione in merito alla notifica al Garante (Notificato / Non notificato, con motivazione);
6. Azioni correttive intraprese e lezioni apprese (Lesson Learned).
