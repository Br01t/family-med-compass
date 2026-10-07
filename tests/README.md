# FamilyMed — Guida alla Suite di Test & Sicurezza

Questa suite è progettata per testare a 360° l'applicazione (funzionalità, sicurezza sanitaria Art. 9 GDPR, RLS, attacchi e resilienza), con due vincoli ferrei:
1. **100% Gratuito:** zero costi di licenza o servizi a pagamento.
2. **Zero consumo di quote del piano Free di Supabase:** tutti i test con database e storage girano contro l'istanza locale Docker (`supabase start`), preservando i 500 MB di DB, 1 GB di storage e 5 GB di banda del cloud.

---

## 1. Come eseguire i test

Puoi lanciare i test su richiesta in qualsiasi momento con comandi dedicati:

### A. Test Unitari (Logica Pura, istantanei — ~150ms)
Non richiedono Docker né Supabase acceso:
```bash
npm run test:unit
```
Verifica: calcolo orari dosi, rilevamento ritardi, regole dei piani di abbonamento, conversione retrocompatibile degli URL delle foto.

### B. Test di Sicurezza, RLS, Attacchi & Privacy (~5-10s)
*Prerequisito: avere Docker e Supabase locale avviato (`npx supabase start`)*
```bash
npm run test:security
```
Verifica:
1. **Isolamento Famiglie (`01_family_isolation.test.ts`):** Un estraneo non può leggere, aggiornare o cancellare pazienti, terapie, eventi o parametri di un'altra famiglia.
2. **Ruoli Caregiver (`02_caregiver_roles.test.ts`):** Il caregiver secondario può confermare le dosi, ma la RLS gli impedisce categoricamente di creare, modificare o cancellare terapie (riservato al primario).
3. **Storage & Signed URLs (`03_private_storage.test.ts`):** Il bucket `therapy-photos` e `caregiver-avatars` sono inaccessibili a utenti anonimi ed estranei; solo caregiver collegati possono generare Signed URLs.
4. **Resistenza agli Attacchi (`04_attacks_and_limits.test.ts`):** 
   - Blocco automatico brute-force sui codici invito (bloccato al 9° tentativo fallito).
   - CHECK constraints su lunghezze (blocca payload smisurati per proteggere i 500 MB del DB).
   - Resistenza a SQL Injection e XSS Stored.
5. **GDPR Export & Oblio (`05_gdpr_export_deletion.test.ts`):** Esportazione completa JSON dei dati sanitari; cancellazione definitiva dell'account e pulizia dei file storage; riservatezza dell'audit log (nessuna fuga di eventi GDPR di altri utenti).
6. **Concorrenza & Limiti di Piano (`06_concurrency_and_limits.test.ts`):** Tentativo di doppio clic simultaneo sulla stessa dose; trigger Postgres che impedisce a un utente Free di inserire un secondo paziente o una quarta terapia bypassando l'interfaccia.
7. **Piani, Downgrade, Retention, Cifratura (`07_subscription_tiers_and_downgrade.test.ts`):** limiti pazienti/terapie/caregiver per Free, Pro e Max; `perform_downgrade` (sospensione senza perdita dati e ripristino all'upgrade); impossibilità di auto-upgrade del piano dal client; finestra storico dosi (7 giorni Free, illimitata Pro/Max); cifratura `notes_enc`. Richiede il secret `therapy_notes_key` nel Vault locale.
8. **Export GDPR completo (`08_gdpr_export_completeness.test.ts`):** `export_my_data()` include profili medici, parametri vitali, note di benessere e aderenza; un estraneo non vede nulla.
9. **Inviti famiglia (`09_family_invites_lifecycle.test.ts`):** monouso, scadenza, tetto `max_uses`, ruoli, permessi di creazione/lettura e manomissione della tabella.
10. **Notifiche e scorte (`10_isolation_notifications_stock.test.ts`):** isolamento tra famiglie, anti-spoofing delle notifiche, scorte modificabili solo dal primario.
11. **Cancellazione account e Storage (`11_account_deletion_storage.test.ts`):** foto e avatar rimossi prima di `delete_my_account`; un caregiver collegato non cancella le foto della famiglia.
12. **Scheduler delle dosi (`12_dose_scheduler.test.ts`):** generazione all'ora di Roma, ricorrenze, terapie escluse, auto-missed con timeout minimo di 30 minuti, promemoria prima/all'ora/dopo senza duplicati. Ogni test gira in una transazione annullata (nessun dato resta nel DB).

### C. Test E2E nel Browser con Playwright
```bash
npm run test:e2e
```
Avvia un browser Chromium headless per verificare la navigazione delle terapie, l'apertura dei modali e la tenuta dell'interfaccia in caso di disconnessione di rete.

### D. Esecuzione Completa di Tutto
```bash
npm run test:all
```

---

## 2. Come avviare l'ambiente locale Supabase per i test
Quando vuoi eseguire i test di sicurezza:
```bash
# 1. Avvia Postgres + Auth + Storage locali in Docker
npx supabase start

# 2. Esegui la suite di sicurezza
npm run test:security

# 3. Quando hai finito, spegni l'ambiente (opzionale)
npx supabase stop
```
