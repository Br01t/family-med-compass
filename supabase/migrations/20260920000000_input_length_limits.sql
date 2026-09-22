-- FamilyMed — sanificazione input: limiti di lunghezza su ogni colonna di
-- testo libero raggiungibile da un utente autenticato, + irrobustimento
-- bucket therapy-photos (allineato a caregiver-avatars).
--
-- PERCHÉ: nessuna colonna di testo del database aveva un limite di
-- lunghezza (verificato: zero CHECK char_length/length in tutto lo schema).
-- Un utente autenticato poteva inviare, con una chiamata diretta all'API
-- (bypassando l'interfaccia), stringhe di qualunque dimensione per nome
-- terapia, note, allergie, ecc. — un vettore semplice per gonfiare il
-- database verso il limite di 500 MB del piano free, oltre che una
-- questione di igiene generale dei dati.
--
-- Tutti i vincoli sono aggiunti con NOT VALID: vengono applicati subito a
-- ogni NUOVA scrittura, ma NON validano retroattivamente le righe già
-- esistenti (che potrebbero — improbabile, ma non verificabile da qui —
-- superare il limite scelto). Questo evita che la migrazione fallisca per
-- dati storici sconosciuti. Per validare anche lo storico, dopo aver
-- verificato che nessuna riga superi i limiti, eseguire singolarmente:
--   ALTER TABLE ... VALIDATE CONSTRAINT nome_vincolo;

-- =============================================================
-- therapies
-- =============================================================
ALTER TABLE public.therapies
  ADD CONSTRAINT therapies_name_len CHECK (char_length(name) <= 120) NOT VALID,
  ADD CONSTRAINT therapies_dosage_len CHECK (dosage IS NULL OR char_length(dosage) <= 60) NOT VALID,
  ADD CONSTRAINT therapies_category_len CHECK (category IS NULL OR char_length(category) <= 60) NOT VALID,
  ADD CONSTRAINT therapies_notes_len CHECK (notes IS NULL OR char_length(notes) <= 5000) NOT VALID,
  ADD CONSTRAINT therapies_times_count CHECK (array_length(times, 1) IS NULL OR array_length(times, 1) <= 20) NOT VALID,
  ADD CONSTRAINT therapies_recurrence_size CHECK (char_length(recurrence::text) <= 2000) NOT VALID;

-- =============================================================
-- patients
-- =============================================================
ALTER TABLE public.patients
  ADD CONSTRAINT patients_name_len CHECK (char_length(name) <= 80) NOT VALID;

-- =============================================================
-- caregivers
-- =============================================================
ALTER TABLE public.caregivers
  ADD CONSTRAINT caregivers_name_len CHECK (char_length(name) <= 80) NOT VALID,
  ADD CONSTRAINT caregivers_relation_len CHECK (relation IS NULL OR char_length(relation) <= 60) NOT VALID,
  ADD CONSTRAINT caregivers_notify_size CHECK (char_length(notify::text) <= 500) NOT VALID;

-- =============================================================
-- caregiver_patients (relazione per-paziente, editabile da pagina famiglia)
-- =============================================================
ALTER TABLE public.caregiver_patients
  ADD CONSTRAINT cp_relationship_len CHECK (relationship IS NULL OR char_length(relationship) <= 60) NOT VALID;

-- =============================================================
-- patient_medical_profiles (dati sensibili, scheda clinica di emergenza)
-- =============================================================
ALTER TABLE public.patient_medical_profiles
  ADD CONSTRAINT pmp_diagnoses_len CHECK (diagnoses IS NULL OR char_length(diagnoses) <= 3000) NOT VALID,
  ADD CONSTRAINT pmp_notes_len CHECK (notes IS NULL OR char_length(notes) <= 3000) NOT VALID,
  ADD CONSTRAINT pmp_allergies_count CHECK (array_length(allergies, 1) IS NULL OR array_length(allergies, 1) <= 50) NOT VALID,
  ADD CONSTRAINT pmp_emergency_contacts_size CHECK (char_length(emergency_contacts::text) <= 5000) NOT VALID;

-- Ogni singola allergia entro 200 caratteri: un array non ha un CHECK
-- diretto per-elemento, serve una funzione di supporto.
CREATE OR REPLACE FUNCTION public.array_max_element_length(arr text[])
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(MAX(char_length(elem)), 0) FROM unnest(arr) AS elem;
$$;

ALTER TABLE public.patient_medical_profiles
  ADD CONSTRAINT pmp_allergy_item_len
    CHECK (public.array_max_element_length(allergies) <= 200) NOT VALID;

-- =============================================================
-- vital_signs
-- =============================================================
ALTER TABLE public.vital_signs
  ADD CONSTRAINT vs_notes_len CHECK (notes IS NULL OR char_length(notes) <= 500) NOT VALID;

-- =============================================================
-- wellness_notes
-- =============================================================
ALTER TABLE public.wellness_notes
  ADD CONSTRAINT wn_note_len CHECK (note IS NULL OR char_length(note) <= 2000) NOT VALID,
  ADD CONSTRAINT wn_symptoms_count CHECK (array_length(symptoms, 1) IS NULL OR array_length(symptoms, 1) <= 30) NOT VALID,
  ADD CONSTRAINT wn_symptom_item_len
    CHECK (public.array_max_element_length(symptoms) <= 100) NOT VALID;

-- =============================================================
-- events (nota di conferma/rimando dose, timeline di stato)
-- =============================================================
ALTER TABLE public.events
  ADD CONSTRAINT events_note_len CHECK (note IS NULL OR char_length(note) <= 500) NOT VALID,
  ADD CONSTRAINT events_timeline_size CHECK (char_length(timeline::text) <= 5000) NOT VALID;

-- =============================================================
-- stock_movements (reason è generato dal codice, non digitato — cap difensivo)
-- =============================================================
ALTER TABLE public.stock_movements
  ADD CONSTRAINT sm_reason_len CHECK (char_length(reason) <= 200) NOT VALID;

-- =============================================================
-- notifications (titolo/messaggio generati dal codice — cap difensivo)
-- =============================================================
ALTER TABLE public.notifications
  ADD CONSTRAINT notif_title_len CHECK (title IS NULL OR char_length(title) <= 200) NOT VALID,
  ADD CONSTRAINT notif_message_len CHECK (message IS NULL OR char_length(message) <= 1000) NOT VALID;

-- =============================================================
-- audit_log (scritto solo da funzioni/trigger interni — cap difensivo,
-- non raggiungibile direttamente da un utente ma protegge comunque da un
-- futuro bug che generasse un summary/detail abnorme)
-- =============================================================
ALTER TABLE public.audit_log
  ADD CONSTRAINT audit_summary_len CHECK (summary IS NULL OR char_length(summary) <= 2000) NOT VALID,
  ADD CONSTRAINT audit_detail_size CHECK (detail IS NULL OR char_length(detail::text) <= 5000) NOT VALID,
  ADD CONSTRAINT audit_meta_size CHECK (meta IS NULL OR char_length(meta::text) <= 5000) NOT VALID;

-- =============================================================
-- Bucket therapy-photos: allineato a caregiver-avatars (creato senza
-- questi limiti nella migrazione 20260916000000 — li aggiungo ora).
-- Ricorda: allowed_mime_types controlla solo l'header Content-Type
-- dichiarato dal client, NON il contenuto reale del byte-per-byte del
-- file (bug noto e aperto in Supabase Storage, issue #576) — è comunque
-- un livello di difesa in profondità utile, non la protezione principale.
-- La protezione principale è che l'app non apre MAI queste foto se non
-- tramite tag <img> (vedi compliance/file-upload-security.md).
-- =============================================================
UPDATE storage.buckets
SET
  file_size_limit = 5242880, -- 5 MB: le foto vengono già compresse client-side (max 800px, JPEG q0.82, tipicamente <200KB), 5MB è un margine ampio senza essere illimitato
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'therapy-photos';

-- =============================================================
-- Verifica dopo l'applicazione:
--   select conname, conrelid::regclass from pg_constraint
--   where connamespace = 'public'::regnamespace and convalidated = false
--   order by conrelid::regclass::text;
-- Deve mostrare tutti i vincoli sopra con convalidated = false (attesi,
-- NOT VALID). Testare poi un salvataggio normale dall'app (terapia, nota
-- di benessere, profilo medico) per confermare che i limiti scelti non
-- disturbino l'uso reale.
-- =============================================================