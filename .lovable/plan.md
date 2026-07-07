Rifacimento della vista **/paziente** con focus su chiarezza, timeline giornaliera e stato vuoto.

## Cosa cambia in `src/routes/paziente.tsx`

### 1. Header con logout
- A sinistra: saluto compatto ("FamilyMed").
- A destra: pulsante campanella con badge notifiche non lette (link a `/notifiche`) + menu con **Logout** (usa `logout()` già presente nello store, poi redirect a `/login`).
- Rimosso il link "Modalità caregiver" (non ha senso per un paziente puro).

### 2. Hero giornata
- Saluto "Buongiorno/pomeriggio/sera, {nome}" + data lunga.
- Barra di progresso: "X di Y dosi completate oggi".

### 3. Azione attiva "adesso"
Sezione in evidenza in cima solo se esiste una dose con stato `reminder`/`late` o `scheduled` entro ±15 min:
- Card grande con nome farmaco, orario, dosaggio, foto scatola se presente.
- Pulsanti: **Ho preso** (primario grande), **Ritarda 10 min**, **Salta**.
- Se nessuna dose è "attiva ora", la sezione non appare.

### 4. Timeline giornaliera
Lista verticale di tutte le dosi del giorno in ordine cronologico, con indicatore visivo dello stato:
- Pallino colorato + linea che collega (timeline verticale).
- Passate: taken (verde ✓), skipped (grigio ✕), missed (rosso).
- Future: scheduled (neutro con orario).
- La dose "corrente" evidenziata; le future mostrano solo info (senza pulsanti azione, per evitare conferme anticipate).

### 5. Riassunto terapie attive
Sezione "Le mie terapie" con card compatta per ogni `therapy` attiva del paziente:
- Nome, dosaggio, frequenza in linguaggio naturale (es. "2 volte al giorno · 8:00, 20:00"), pillole rimanenti con warning se sotto soglia.
- Tap → naviga a `/terapie` (dettaglio esistente).

### 6. Stato vuoto
Quando `therapies.length === 0`:
- Card centrale amichevole: illustrazione/emoji, titolo "Nessuna terapia assegnata", testo "Quando un caregiver ti assegnerà una cura, la troverai qui. Nel frattempo puoi rilassarti."
- Link secondario a `/notifiche` e `/impostazioni`.

Quando ci sono terapie ma zero dosi oggi (es. terapia a giorni alterni):
- Messaggio "Oggi non hai medicine da prendere" nella sezione timeline, ma le terapie restano visibili sotto.

### 7. Fix logica esistente
- Il fallback attuale `data?.patients?.[0]` funziona male per un paziente loggato: uso `patients.find(p => p.userId === user.id)` come primaria, con fallback `currentPatientId`.
- Se `user` è loggato come `paziente` ma `patient` non esiste ancora (recovery in corso nello store), mostra skeleton invece del blocco "Ancora nessun paziente".

## File toccati
- `src/routes/paziente.tsx` — riscritto secondo la struttura sopra.
- Nessuna modifica a store, servizi, DB o altre route.

## Fuori scope
- Nessun cambio a schema DB, edge function, notifiche push.
- Nessun cambio a `/caregiver` o altre route.
- Nessun refactor dello store.