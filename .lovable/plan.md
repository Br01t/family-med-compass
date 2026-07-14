## Obiettivo
Ogni famiglia (paziente + caregiver linkati) diventa un silo di dati stagno. Chiudo le due falle attuali:
- La tabella `patients` ha una policy SELECT `true` → chiunque abbia un account vede tutti i pazienti registrati.
- `caregiver_patients` permette a un caregiver di linkarsi a qualsiasi paziente senza consenso.

La pagina Sospensione e il flusso attuale di sospensione terapia NON vengono toccati.

## Modello scelto
Collegamento tramite **codice invito generato dal paziente**. Nessuna lista pubblica di pazienti. I caregiver della stessa famiglia si vedono tra loro (nome, relazione, foto).

## Cambi al database (migration)

Nuova tabella `family_invites` con codice a 6 caratteri alfanumerici, scadenza (default 24h), usi rimanenti (default 1), `patient_id`, `created_by`, `used_by`, `used_at`. RLS: solo il paziente / owner del paziente può creare e vedere i propri codici; il caregiver può leggere UN singolo record solo passando codice+patient_id esatti (via RPC).

Nuove RPC `SECURITY DEFINER`:
- `create_family_invite(_patient_id text, _ttl_minutes int, _max_uses int)` — verifica che l'utente sia paziente o owner; genera codice unico; inserisce record.
- `redeem_family_invite(_code text)` — verifica ruolo caregiver, codice valido, non scaduto, usi > 0; inserisce riga in `caregiver_patients`; decrementa usi; ritorna `patient_id`.

Sostituzione policy `patients: authenticated can read all` con:
```
patients SELECT = (user_id = auth.uid())
              OR (owner_user_id = auth.uid())
              OR EXISTS (caregiver_patients cp WHERE cp.patient_id = patients.id AND cp.caregiver_id = auth.uid())
```

`caregiver_patients` INSERT diventa più stretto: consentito solo tramite la RPC `redeem_family_invite` (che gira `SECURITY DEFINER`); rimuovo la policy INSERT diretta dal client.

Aggiungo policy SELECT su `caregivers` per "caregiver linkati allo stesso paziente si vedono tra loro":
```
EXISTS (cp1, cp2 WHERE cp1.caregiver_id = auth.uid()
                   AND cp2.caregiver_id = caregivers.id
                   AND cp1.patient_id = cp2.patient_id)
```

Verifica che therapies / events / notifications restino coerenti — le loro policy attuali già scopano via `caregiver_patients`, quindi automaticamente diventano silo dopo la stretta su `patients`.

GRANT su `family_invites` a `authenticated` + `service_role` (nessun `anon`).

## Cambi al client

**src/lib/supabase-service.ts**
- Rimuovo `fetchAllPatients` e `followPatient` diretti (o li lascio come no-op che avvisano).
- Aggiungo `createFamilyInvite(patientId, ttlMinutes, maxUses)` e `redeemFamilyInvite(code)` che invocano le RPC.

**src/lib/store.tsx**
- Rimuovo `allPatients`, `refreshAllPatients`, `followPatient` dal context (o li mantengo con firma nuova). Aggiungo `createInvite`, `redeemInvite`.

**src/routes/pazienti.index.tsx**
- Rimuovo la sezione "Tutti i pazienti registrati" (fonte del leak).
- Aggiungo, per il caregiver, una card "Aggiungi un paziente con codice" con input a 6 caratteri → chiama `redeemInvite`.
- Il pulsante `Trash2` sui pazienti followed diventa "Scollega dalla famiglia" (unfollow rimane funzionale via `caregiver_patients DELETE`).

**src/routes/impostazioni.tsx** (o scheda paziente per il caregiver-owner)
- Nuova sezione "Codici invito famiglia" per il paziente / owner: pulsante "Genera codice" → mostra codice + validità; lista dei codici attivi con pulsante revoca.

**src/routes/pazienti.$id.tsx**
- Sezione "Caregiver della famiglia" che elenca tutti i caregiver collegati allo stesso paziente (leggibili grazie alla nuova policy).

## Ordine di esecuzione
1. Migration DB (tabella, RPC, policy patients, policy caregivers, revoca INSERT libero su caregiver_patients, GRANT).
2. Refactor `supabase-service.ts` + `store.tsx`.
3. UI: rimozione lista pubblica, form redeem invito, generatore codici nelle impostazioni paziente, elenco caregiver di famiglia nella scheda paziente.
4. Verifica: due account caregiver di test devono vedere solo il proprio silo.

Non tocco: pagina Sospensione, logica di sospensione terapia, notifiche/trigger DB esistenti, componenti Alarm/Timeline.