import { useEffect, useState } from "react";
import { getSignedPrivateUrl } from "@/lib/private-photo-url";
import { logger } from "@/lib/logger";

type PrivatePhotoImgProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  /** Nome del bucket Storage privato (es. "therapy-photos", "caregiver-avatars"). */
  bucket: string;
  /** Path dell'oggetto già risolto (usare extractPrivatePhotoPath/extractTherapyPhotoPath/extractCaregiverAvatarPath a monte). */
  path: string | null | undefined;
};

/**
 * `<img>` generico che risolve da sé un path di un bucket Storage privato in
 * un Signed URL temporaneo. Non renderizza nulla finché il Signed URL non è
 * pronto o se la foto è assente/non autorizzata — il chiamante gestisce
 * normalmente il fallback (icona, placeholder) tramite la propria
 * condizione `{photo && <PrivatePhotoImg .../>}`.
 *
 * Usato da TherapyPhotoImg (bucket "therapy-photos") e per gli avatar
 * caregiver (bucket "caregiver-avatars") — un solo componente, due bucket.
 *
 * REGOLA DI SICUREZZA — non violare mai: il signedUrl risolto qui va usato
 * SOLO dentro un tag <img>, mai con window.open(), <a href>, target="_blank"
 * o navigazione diretta. `allowed_mime_types` sul bucket controlla solo
 * l'header Content-Type dichiarato in fase di upload, non il contenuto
 * reale del file (limite noto di Supabase Storage) — un file non-immagine
 * caricato con Content-Type falsificato non può eseguire codice se
 * caricato via <img> (i browser disabilitano l'esecuzione di script in
 * un'immagine SVG caricata così), ma POTREBBE farlo se aperto per
 * navigazione diretta. Dettagli completi in
 * compliance/file-upload-security.md.
 */
export function PrivatePhotoImg({ bucket, path, alt, ...imgProps }: PrivatePhotoImgProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSignedUrl(null);
    if (!path) return;
    getSignedPrivateUrl(bucket, path)
      .then((url) => {
        if (!cancelled) setSignedUrl(url);
      })
      .catch((err) => {
        logger.warn(`[PrivatePhotoImg] risoluzione signed url fallita (${bucket})`, err);
      });
    return () => {
      cancelled = true;
    };
  }, [bucket, path]);

  if (!signedUrl) return null;
  return <img src={signedUrl} alt={alt ?? ""} {...imgProps} />;
}