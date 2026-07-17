
-- Storage policies per bucket therapy-photos
-- Path convention: therapies/<therapy_id>/{drug|package}.jpg

-- Lettura pubblica (le foto dei farmaci non sono dati sensibili)
DROP POLICY IF EXISTS "therapy_photos_public_read" ON storage.objects;
CREATE POLICY "therapy_photos_public_read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'therapy-photos');

-- INSERT / UPDATE / DELETE: solo il caregiver primario della terapia
DROP POLICY IF EXISTS "therapy_photos_primary_insert" ON storage.objects;
CREATE POLICY "therapy_photos_primary_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'therapy-photos'
  AND (storage.foldername(name))[1] = 'therapies'
  AND EXISTS (
    SELECT 1 FROM public.therapies t
    WHERE t.id = (storage.foldername(name))[2]
      AND public.is_primary_of(t.patient_id)
  )
);

DROP POLICY IF EXISTS "therapy_photos_primary_update" ON storage.objects;
CREATE POLICY "therapy_photos_primary_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'therapy-photos'
  AND (storage.foldername(name))[1] = 'therapies'
  AND EXISTS (
    SELECT 1 FROM public.therapies t
    WHERE t.id = (storage.foldername(name))[2]
      AND public.is_primary_of(t.patient_id)
  )
);

DROP POLICY IF EXISTS "therapy_photos_primary_delete" ON storage.objects;
CREATE POLICY "therapy_photos_primary_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'therapy-photos'
  AND (storage.foldername(name))[1] = 'therapies'
  AND EXISTS (
    SELECT 1 FROM public.therapies t
    WHERE t.id = (storage.foldername(name))[2]
      AND public.is_primary_of(t.patient_id)
  )
);
