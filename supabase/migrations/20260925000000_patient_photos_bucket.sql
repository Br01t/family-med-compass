-- FamilyMed — Seed dei bucket Storage per l'ambiente di sviluppo locale.
--
-- In produzione (Dashboard Supabase) questi bucket sono creati manualmente.
-- In locale (`supabase start`), la migrazione dell'avatar crea `caregiver-avatars`
-- ma `therapy-photos` non viene creato da nessuna migrazione SQL (era già
-- presente nella Dashboard prima di iniziare a usare le migrazioni).
-- Questa migrazione ripristina lo stato corretto per i test locali.
--
-- ON CONFLICT DO NOTHING: sicuro da eseguire più volte, non sovrascrive
-- la configurazione esistente in produzione.

-- Bucket principale foto terapie (privato)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'therapy-photos',
  'therapy-photos',
  false,
  10485760,  -- 10 MB per foto farmaco (confezione, prescrizione, ecc.)
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Bucket foto profilo pazienti (privato)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'patient-photos',
  'patient-photos',
  false,
  5242880,  -- 5 MB per foto profilo paziente
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
