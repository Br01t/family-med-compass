# Controllo post-fix — bug residui e limiti piano free (aggiornato)

**Data:** 18 Settembre 2026

## 1. Altro bug della stessa classe, trovato e corretto preventivamente

Dopo aver risolto `get_my_patients()`, ho controllato **tutte** le altre
funzioni `RETURNS TABLE` del database (5 in totale). Due sono `LANGUAGE sql`
(immuni per costruzione a questo problema): `get_my_caregiver_stats()` e
`wellness_symptom_correlation()` — nessuna azione necessaria.

Le altre due sono `LANGUAGE plpgsql` come `get_my_patients()` — stesso
rischio strutturale:

- **`get_my_caregivers()`** — dichiara `RETURNS TABLE("id" uuid, ...)`, e
  `id` è uno dei nomi di colonna più comuni del database. Sul dump risultava
  già scritta in modo qualificato (`c.id`, `cp.caregiver_id`...) — ma lo era
  *anche* `get_my_patients()`, eppure ha fallito dal vivo. Non essendoci
  garanzia che l'ispezione visiva basti, l'ho **irrobustita preventivamente**
  con la stessa tecnica (alias interni diversi dai nomi di output:
  `out_id` invece di `id`, ecc.), così l'ambiguità diventa strutturalmente
  impossibile invece di "probabilmente assente". Nessun cambio di
  comportamento per l'app.
- **`get_family_group_data()`** — stesso linguaggio, ma le colonne di output
  (`members`, `invites`, `audit_log`) sono blob `jsonb` senza equivalenti
  diretti tra le colonne scalari delle tabelle coinvolte: rischio molto più
  basso, quindi l'ho lasciata com'è per ora. Se in futuro dovesse dare lo
  stesso tipo di errore, sai già dove guardare.

File: `supabase/migrations/20260918000000_harden_get_my_caregivers.sql`.

## 2. Gap di retention trovato: `stock_movements`

Confrontando tutte le 16 tabelle applicative con tutti i `cron.schedule`
esistenti, `stock_movements` (il registro dei movimenti di scorta) è
risultata l'**unica senza alcuna pulizia automatica** — un ledger
append-only (nessuno può modificarlo o cancellarlo via RLS, nemmeno il
caregiver primario) che oggi si svuota solo su reset manuale o cancellazione
account. Con l'uso normale è la tabella a crescita più continua e meno
limitata nel tempo — sul piano free, con **500 MB totali per l'intero
database**, è il candidato più concreto a occupare spazio in modo silenzioso
con "molti clienti" nel tempo.

Aggiunta una retention di 24 mesi (stessa finestra già usata per
`wellness_notes`, per coerenza). File:
`supabase/migrations/20260918010000_stock_movements_retention.sql`.
Ho aggiornato anche `compliance/retention-policy.md` con la nuova riga.

## 3. Numeri reali del piano Free Supabase per il 2026 (verificati ora)

Li avevo lasciati generici/da confermare in alcuni punti della
documentazione precedente. Questi sono i numeri attuali, confermati da più
fonti:

| Risorsa | Limite Free 2026 | Situazione FamilyMed |
|---|---|---|
| Dimensione database | **500 MB** | Vincolo più stretto di tutti — vedi punto 2 sopra |
| File storage | **1 GB** | Foto terapie compresse + pulizia automatica su modifica/cancellazione (già fatto) |
| Egress (banda) | **5 GB/mese** (+ 5 GB cached) | **Già superato una volta in passato** (5.62 GB/mese con 28 utenti, per foto base64 scaricate ad ogni fetch — risolto passando a Storage, vedi `migrate-therapy-photos-to-storage.mjs`). È il vincolo più fragile dopo il database: da monitorare mano a mano che crescono gli utenti |
| Edge Function invocations | **500.000/mese** | Il dose-scheduler gira nativamente in Postgres via `pg_cron` (non consuma questa quota). **Aggiornamento 18/09**: verificato su Dashboard → Edge Functions che non esiste nessuna Edge Function deployata (né `dose-scheduler`, né `push-sender`, né `dose-action`) — quota Edge Function a consumo zero oggi |
| Connessioni Realtime concorrenti | **200** | App già efficiente: **2 canali per sessione utente** (eventi + notifiche, già ridotti da 3 in passato). Con 2 canali/utente, il tetto dei 200 corrisponde a **~100 sessioni contemporaneamente attive** — è la prossima metrica da tenere d'occhio quando l'utenza cresce, non ancora un problema oggi |
| Messaggi Realtime | **2.000.000/mese** | Nessun segnale di rischio allo stato attuale |
| Backup / PITR | **Nessuno** sul piano Free (confermato, prima era segnato "da verificare") | Aggiornato `data-deletion-trace.md` e `deletion-procedure.md` di conseguenza |
| Log delle Edge Function | **1 giorno di retention** | Non riguarda i vostri log applicativi (`audit_log`, retention propria di 90gg), solo i log tecnici della piattaforma |
| Pausa per inattività | Dopo **7 giorni** senza richieste | Non rilevante con utenti attivi regolari |

## 4. Aggiornamento 18/09/2026

I due punti sotto sono **risolti**, non più da verificare: l'utente ha
controllato Dashboard → Edge Functions e non risulta nessuna funzione
deployata. `push-sender`/`dose-action`/`dose-scheduler` erano solo codice e
config mai pubblicati, ora rimossi dal repository insieme ai riferimenti in
`supabase/config.toml` e ai commenti VAPID in `wrangler.toml` (le notifiche
push sono una funzionalità volutamente rimossa — vedi `public/sw.js` — non
un canale attivo).

## 5. Cosa NON ho ancora potuto verificare (residuo)

- Il consumo reale attuale di egress/storage/database rispetto alla quota
  (serve la Dashboard → Settings → Usage del progetto — da lì capirai anche
  se l'incidente degli 5.62 GB/mese è stato l'eccezione o se l'egress resta
  vicino alla soglia).

## 6. Documenti aggiornati in questo passaggio
- `compliance/retention-policy.md` — aggiunta riga `stock_movements`.
- `compliance/data-deletion-trace.md` — riga backup/PITR ora definitiva, non più "da confermare".
- `compliance/deletion-procedure.md` — stesso aggiornamento, tolto il riferimento generico "7-30 giorni".