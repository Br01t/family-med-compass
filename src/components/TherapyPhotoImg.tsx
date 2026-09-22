import { extractTherapyPhotoPath } from "@/lib/therapy-photo-url";
import { PrivatePhotoImg } from "@/components/PrivatePhotoImg";

type TherapyPhotoImgProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  /** Valore salvato in DB: path dell'oggetto Storage o (legacy) URL pubblico. */
  path: string | null | undefined;
};

/**
 * `<img>` che risolve da sola un path/URL di foto terapia in un Signed URL
 * temporaneo (il bucket `therapy-photos` è privato, vedi
 * src/lib/therapy-photo-url.ts). Wrapper sottile su PrivatePhotoImg. Non
 * renderizza nulla finché il Signed URL non è pronto o se la foto è
 * assente/non autorizzata — il chiamante gestisce normalmente il fallback
 * (icona, placeholder) tramite la propria condizione
 * `{photo && <TherapyPhotoImg .../>}`.
 */
export function TherapyPhotoImg({ path, ...props }: TherapyPhotoImgProps) {
  return (
    <PrivatePhotoImg bucket="therapy-photos" path={extractTherapyPhotoPath(path)} {...props} />
  );
}