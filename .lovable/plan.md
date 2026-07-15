# Ruoli Caregiver: Primario vs Secondario (v2)

## Definizione di Caregiver Primario

Regola in ordine di precedenza per un dato paziente:

1. Se `patients.owner_user_id` è valorizzato → **Primario = owner_user_id** (il caregiver-figlio che ha creato l'account del paziente).
2. Altrimenti (paziente che ha creato da solo il proprio account, quindi `user_id` valorizzato e `owner_user_id` NULL) → **Primario = il primo caregiver che si è collegato via codice invito**.

Per rendere la regola 2 stabile e query-friendly aggiungo una nuova colonna `patients.primary_caregiver_id uuid`. Viene valorizzata **una sola volta**, dentro `redeem_family_invite`, quando è ancora NULL e il paziente non ha owner. I redeem successivi non la sovrascrivono: quel caregiver resta primario per sempre finché non viene esplicitamente cambiato.

Riassumendo, `is_primary_of(_patient_id)` ritorna true quando:
```
auth.uid() = patients.owner_user_id
  OR (owner_user_id IS NULL AND auth.uid() = primary_caregiver_id)
```

Il paziente NON è mai "primario": il primario è sempre e solo un caregiver.

## Capacità (tabella corretta)

| Azione | Paziente | Primario (owner o primo collegato) | Secondario |
|---|---|---|---|
| Vedere paziente / terapie / eventi / scorte / storico / notifiche | ✅ | ✅ | ✅ |
| Confermare / rimandare / saltare una dose | ✅ | ✅ | ✅ |
| Modificare la propria anagrafica (nome, foto, anno di nascita) | ✅ (solo self) | ✅ | ❌ |
| Generare / revocare codici invito famiglia | ✅ | ✅ | ❌ |
| Creare / modificare / eliminare terapie e sospensioni | ❌ | ✅ | ❌ |
| Modifica scorte manuali (`stock_movements` INSERT) | ❌ | ✅ | ❌ |
| Rimuovere un altro caregiver dalla famiglia | ❌ | ✅ | ❌ |
| Scollegarsi (unfollow di sé) | — | ✅ | ✅ |

Il paziente perde quindi le capacità cliniche/gestionali (terapie, scorte, rimozione caregiver): tutta la gestione medica è del primario. Al paziente restano solo: rispondere alle dosi, gestire i propri inviti famiglia, aggiornare la propria anagrafica.

## Cambi al database (una migration)

1. `ALTER TABLE patients ADD COLUMN primary_caregiver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;` + indice.
2. Backfill: per ogni paziente con `owner_user_id IS NULL`, imposta `primary_caregiver_id` al `caregiver_id` di `caregiver_patients` con `min(created_at)`.
3. `redeem_family_invite`: dopo l'insert in `caregiver_patients`, se `patients.owner_user_id IS NULL AND primary_caregiver_id IS NULL`, imposta `primary_caregiver_id = auth.uid()`.
4. Nuova helper `is_primary_of(_patient_id) SECURITY DEFINER STABLE` con la logica sopra.
5. Refactor policy (drop + create):
   - **`therapies`**: split della policy `rw` — SELECT per tutti i linked (invariato); INSERT/UPDATE/DELETE solo `is_primary_of(patient_id)`.
   - **`stock_movements`**: SELECT invariato; INSERT solo `is_primary_of(patient_id)` (i trigger `SECURITY DEFINER` continuano a scrivere per tutti).
   - **`patients` UPDATE**: consentito se `is_primary_of(id)` **oppure** `user_id = auth.uid()` (il paziente aggiorna solo la sua anagrafica).
   - **`patients` DELETE**: solo `is_primary_of(id)` oppure `user_id = auth.uid()`.
   - **`events`**: split — SELECT + UPDATE per tutti i linked (paziente incluso, così può confermare); INSERT + DELETE solo `is_primary_of(patient_id)`.
   - **`caregiver_patients` DELETE**: mantieni "il caregiver può scollegare sé stesso" e aggiungi "il primario può rimuovere un secondario dal suo paziente" (`is_primary_of(patient_id) AND caregiver_id <> auth.uid()` per non rimuovere sé stesso da qui — l'unfollow di sé passa dall'altra clausola).
6. `create_family_invite`: già limitato a paziente + owner. Aggiungo il caso `primary_caregiver_id = auth.uid()` così anche il primario "primo collegato" può generare codici.
7. `family_invites` SELECT/DELETE: idem, aggiungo il ramo `primary_caregiver_id`.

## Cambi al client

**`src/lib/store.tsx`** — nuovi derivati:
```
isPrimaryCaregiverOf(patientId): boolean
isSecondaryCaregiverOf(patientId): boolean
```
Basati su `patient.ownerUserId`, `patient.primaryCaregiverId`, `patient.userId` (aggiungo `primaryCaregiverId` al tipo Patient e al mapping da Supabase).

**`src/routes/pazienti.$id.tsx`**
- Badge "Primario" / "Secondario" accanto al nome del paziente.
- Card `FamilyInviteCard`: mostra a paziente **e** a `is_primary_of` (non solo owner).
- Nascondi al secondario: pulsanti di modifica/eliminazione/sospensione terapia.

**`src/routes/terapie.tsx`, `src/routes/scorte.tsx`, `src/routes/le-mie-terapie.tsx`**
- Se l'utente è secondario o è il paziente (non primario) per il paziente selezionato: nascondi CTA "Aggiungi terapia", "Modifica", "Sospendi", "Elimina", "Rettifica scorta". Le pagine restano in sola lettura (storico + stato scorte visibili).

**`src/routes/impostazioni.tsx` + `FamilyInviteCard`**
- Aggiorno il gate del generatore inviti: mostrato se `is_primary_of(patient)` **o** `patient.userId === user.id`. Rimuovo il vincolo "solo owner".

**`src/routes/pazienti.index.tsx`**
- Badge Primario/Secondario su ogni card paziente della lista.

**`src/routes/paziente.tsx` (dashboard del paziente)**
- Le azioni di gestione terapia/scorte (se presenti oggi) vengono nascoste al paziente. Restano: rispondere alle dosi, modificare la propria anagrafica dalle Impostazioni, generare codici invito.

**Nessuna modifica** a: `AlarmRinger`, dose-scheduler edge function, pagina Sospensione, timeline caregiver, `handle_new_user`, `handle_dose_taken`/`handle_dose_status_change`.

## Ordine di esecuzione

1. Migration DB: colonna `primary_caregiver_id`, backfill, aggiornamento `redeem_family_invite` + `create_family_invite`, helper `is_primary_of`, refactor policy.
2. Types + store: `primaryCaregiverId` sul modello, derivati `isPrimaryCaregiverOf` / `isSecondaryCaregiverOf`.
3. UI: gate CTA e badge ruolo dove elencato sopra.
4. Verifica manuale: paziente-owner-account + due caregiver linked → solo il primo collegato vede i pulsanti terapia/scorte/rimozione caregiver; il secondo caregiver può solo confermare le dosi.
