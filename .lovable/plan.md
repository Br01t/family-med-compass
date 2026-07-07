## Obiettivi

1. **Terapia senza data di fine** — la durata deve poter essere "per sempre".
2. **Vista paziente: pagina dedicata "Le mie terapie"** — separata da quella del caregiver.
3. **Caregiver: unificare Storico + Report in una sola pagina "Storico & Report"**, alimentata dai dati reali del DB (eventi di assunzione salvati) invece che da conteggi puramente derivati.

---

## 1. Terapia "per sempre" (endDate opzionale)

**File toccati**: `src/components/AddTherapyDialog.tsx`, `src/lib/supabase-service.ts` (già gestisce `null`), `src/lib/therapy.ts` (già ok), `src/lib/ics.ts` (già ok).

Modifiche:
- Schema Zod: `endDate: z.string().optional().or(z.literal(""))`, rimuovere il messaggio "obbligatoria".
- Aggiungere una checkbox / switch **"Terapia senza scadenza (a tempo indeterminato)"** sopra il campo data fine. Se attiva, disabilita e svuota `endDate`.
- In `onSubmit`: passare `endDate: values.endDate || undefined` sia in `addTherapy` che `updateTherapy`.
- Etichetta campo → "Data fine (opzionale)".
- In `defaultValues` (edit) usare `editTherapy.endDate ?? ""` e checkbox precompilata se assente.

Nessuna migrazione DB: `end_date date` è già nullable.

---

## 2. Pagina "Le mie terapie" per il paziente

**Nuovo file**: `src/routes/le-mie-terapie.tsx` (route `/le-mie-terapie`).

Contenuto (tono paziente, semplice, grande):
- Header con nome paziente + link back a `/paziente`.
- Elenco delle terapie attive assegnate al paziente loggato:
  - Foto farmaco/confezione grande.
  - Nome, dosaggio, quantità per dose.
  - Orari (badge grandi).
  - Ricorrenza in italiano (`recurrenceLabel`).
  - Periodo: "dal 5 lug 2026" o "dal 5 lug al 30 lug 2026" (se `endDate` presente); altrimenti "in corso, senza scadenza".
  - Note/istruzioni.
  - Reminder configurato: "Ti avviso {X} minuti prima".
  - Scorte rimanenti + alert se `pillsRemaining <= lowStockThreshold`.
- Empty state se nessuna terapia.
- **Vista paziente rimane read-only**: nessun pulsante "Modifica"/"Elimina", nessun accesso a `AddTherapyDialog`. Solo consultazione.

**Aggiornamenti collaterali**:
- In `src/routes/paziente.tsx`, il link "Vedi tutto" nella sezione "Le mie terapie" attualmente punta a `/terapie` (vista caregiver). Cambiarlo a `/le-mie-terapie`.
- Anche i card della lista puntano a `/terapie` → cambiarli a `/le-mie-terapie`.
- La route `/terapie` (vista caregiver) resta invariata; il paziente non ha voci di menu che ci portano.

---

## 3. Caregiver: pagina unica "Storico & Report" con dati reali

**Nuovo file**: `src/routes/storico-report.tsx` (route `/storico-report`, titolo "Storico & Report").

**File modificati**:
- `src/components/AppShell.tsx`: rimuovere le voci **Storico** e **Report** dalla `nav`, sostituirle con un'unica voce **"Storico & Report"** → `/storico-report` (icona `PieChart` o `CalendarDays`).
- `src/routes/storico.tsx` e `src/routes/report.tsx`: rimuovere i file (redirect non necessari perché non pubblicati esternamente).

**Struttura della nuova pagina** (usa `AppShell`):

1. **Selettore paziente** (chip come nello Storico attuale).
2. **Filtro periodo**: 7g / 30g / 90g (default 30g).
3. **KPI reali** (calcolati dagli eventi in `data.events` + dosi programmate del periodo):
   - Aderenza % (dosi con `event.status = 'taken'` / dosi programmate passate).
   - Dosi in ritardo (status `late`).
   - Dosi saltate (status `skipped`).
   - Ritardo medio di conferma (minuti) — calcolato da `event.confirmedAt - scheduledAt`.
   - Dosi totali programmate nel periodo.
4. **Grafico a barre giornaliero** (una barra per giorno del periodo, aderenza %).
5. **Calendario mensile** (come `storico.tsx` attuale) con click → dettaglio giornaliero a lato:
   - Elenco dosi del giorno con orario, nome terapia, stato, orario di conferma (se preso), chi ha confermato (`event.confirmedBy`).
6. **Breakdown per terapia** del periodo: tabella con nome, dosi programmate, prese, in ritardo, saltate, aderenza %.

**Sorgente dati reali**: la funzione `getDosesForPatientOnDate(data, patientId, d, now)` già combina `data.therapies` (dal DB) con `data.events` (dal DB, `medication_events`). Non servono migrazioni. Rimuoviamo dati mock non usati; se `data.events` è vuoto, i KPI mostrano 0 con stato "Nessuna assunzione registrata".

**Verifica**: confermare che `store.tsx` popoli `data.events` da `medication_events` (già fatto secondo il codice esistente).

---

## Verifica finale

- Creare una terapia lasciando "Data fine" vuota → salva e la timeline paziente la mostra ogni giorno.
- Loggarsi come paziente, navigare a `/le-mie-terapie` → vedere l'elenco read-only con foto e orari.
- Loggarsi come caregiver, aprire `/storico-report` → KPI e calendario riflettono `medication_events` reali; se si conferma una dose e si ricarica, i numeri si aggiornano.
- Voci menu caregiver: "Storico" e "Report" sostituite da "Storico & Report".

Nessuna migrazione SQL richiesta.