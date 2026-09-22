// Legge un File immagine, lo ridimensiona a max 800px lato lungo e restituisce
// una dataURL JPEG compressa — così le foto dei farmaci restano < ~150 KB
// e non saturano il localStorage.
//
// SICUREZZA — perché il controllo dei "magic bytes" (§ isLikelyRasterImage)
// e non solo `file.type`:
// `file.type` è il MIME dichiarato dal browser in base all'ESTENSIONE del
// file, non al suo contenuto reale — un file rinominato o costruito ad hoc
// può dichiarare "image/jpeg" pur non essendolo affatto. In particolare va
// esclusa esplicitamente l'SVG: è un formato immagine "legittimo" che
// alcuni browser sanno decodificare anche via createImageBitmap, ma può
// contenere <script> eseguibile — non è mai il formato che vogliamo
// accettare qui. Controllare i primi byte del file (che identificano il
// formato reale, non manipolabili semplicemente rinominando il file) prima
// di tentare la decodifica è quindi una difesa reale, non solo un dettaglio
// implementativo: il resto della sicurezza sugli upload è descritto in
// compliance/file-upload-security.md, insieme al limite di questo
// controllo (è client-side: protegge il flusso normale dell'app, non un
// attaccante che chiama direttamente l'API Storage bypassando il client).
const MAGIC_BYTES: Array<{ mime: string; bytes: number[]; offset?: number }> = [
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  // WebP: "RIFF" ai byte 0-3, "WEBP" ai byte 8-11 (formato RIFF a contenitore)
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] },
];

async function isLikelyRasterImage(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  return MAGIC_BYTES.some(({ bytes, offset = 0 }) => bytes.every((b, i) => head[offset + i] === b));
}

export async function fileToCompressedDataUrl(
  file: File,
  maxSize = 800,
  quality = 0.82,
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Il file deve essere un'immagine");
  }
  if (!(await isLikelyRasterImage(file))) {
    throw new Error(
      "Questo file non sembra un'immagine valida (JPEG, PNG o WebP). Riprova con un'altra foto.",
    );
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas non disponibile");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  // Riesportando sempre via canvas.toDataURL("image/jpeg", ...) il file che
  // finisce davvero su Storage non è mai il byte originale caricato
  // dall'utente: è una nuova immagine JPEG generata dal browser a partire
  // dai soli pixel decodificati. Qualunque payload non-immagine nascosto
  // nel file originale (metadati malevoli, script embedded, dati dopo la
  // fine dell'immagine) non sopravvive a questo passaggio.
  return canvas.toDataURL("image/jpeg", quality);
}