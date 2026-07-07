## Fix 403 su `caregiver_patients` (upsert)

### Cause
`followPatient` in `src/lib/supabase-service.ts` usa `.upsert(...)`. PostgREST richiede sia `INSERT` sia `UPDATE` per l'upsert; su `caregiver_patients` ho concesso solo `select, insert, delete` → 403 con code `42501`.

### Modifiche

**1. Client (fix immediato)** — `src/lib/supabase-service.ts`:
- Sostituisco `.upsert()` con `.insert()` in `followPatient`.
- Se Postgres torna `23505` (duplicate key), lo ignoro: seguire due volte lo stesso paziente è idempotente, non serve aggiornare nulla.

```ts
const { error } = await supabase
  .from("caregiver_patients")
  .insert({ caregiver_id: caregiverId, patient_id: patientId });
if (error && error.code !== "23505") throw error;
```

**2. Database (hardening)** — aggiorno `MIGRATION_FIX.sql` e `RESET.sql` con:
- `GRANT UPDATE ON public.caregiver_patients TO authenticated;`
- Policy UPDATE self-scoped:
  ```sql
  create policy "cp: caregiver can update own"
    on public.caregiver_patients for update to authenticated
    using (caregiver_id = auth.uid()) with check (caregiver_id = auth.uid());
  ```

Così anche un futuro `.upsert()` funziona, ma le modifiche restano confinate alle proprie righe.

### Azioni richieste all'utente
Rieseguire **`MIGRATION_FIX.sql`** in Supabase SQL Editor (idempotente, safe).

### Fuori scope
Nessun refactor del flusso UI, nessun cambio a terapie o notifiche.