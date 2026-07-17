// scripts/migrate-therapy-photos.mjs
//
// Migrazione una-tantum: sposta le foto terapie salvate come dataURL
// (base64, colonne therapies.photo_drug / photo_package) sul bucket
// Storage "therapy-photos", sostituendo il valore in DB con l'URL pubblico.
//
// Va eseguito FUORI dall'app, da terminale, con la service role key
// (bypassa le RLS policy — nessun problema di "caregiver primario").
//
// Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-therapy-photos.mjs
//
// oppure, se tieni le variabili in un file .env (Node >= 20.6):
//   node --env-file=.env scripts/migrate-therapy-photos.mjs
//
// Flag opzionali:
//   --dry-run   non scrive nulla, mostra solo cosa farebbe

import { createClient } from "@supabase/supabase-js";

const DRY_RUN = process.argv.includes("--dry-run");
const BUCKET = "therapy-photos";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Mancano SUPABASE_URL e/o SUPABASE_SERVICE_ROLE_KEY nell'ambiente.\n" +
      "Recuperale da Supabase → Project Settings → API (chiave 'service_role', NON la anon/publishable).",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function dataUrlToBuffer(dataUrl) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("dataURL non valido");
  const mime = match[1];
  const ext =
    mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "bin";
  return { buffer: Buffer.from(match[2], "base64"), mime, ext };
}

async function uploadPhoto(therapyId, kind, dataUrl) {
  const { buffer, mime, ext } = dataUrlToBuffer(dataUrl);
  const path = `therapies/${therapyId}/${kind}-${Date.now()}.${ext}`;

  if (DRY_RUN) {
    console.log(`  [dry-run] upload ${path} (${buffer.length} byte, ${mime})`);
    return `dry-run://${path}`;
  }

  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    upsert: true,
    contentType: mime,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function main() {
  console.log(`Bucket: ${BUCKET}${DRY_RUN ? "  (DRY RUN, nessuna scrittura)" : ""}`);

  const { data: rows, error } = await supabase
    .from("therapies")
    .select("id, photo_drug, photo_package");
  if (error) throw error;

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows ?? []) {
    const hasDrugData = row.photo_drug?.startsWith("data:");
    const hasPkgData = row.photo_package?.startsWith("data:");
    if (!hasDrugData && !hasPkgData) {
      skipped++;
      continue;
    }

    console.log(`→ ${row.id}`);
    try {
      const patch = {};
      if (hasDrugData) patch.photo_drug = await uploadPhoto(row.id, "drug", row.photo_drug);
      if (hasPkgData) patch.photo_package = await uploadPhoto(row.id, "package", row.photo_package);

      if (!DRY_RUN) {
        const { error: upErr } = await supabase.from("therapies").update(patch).eq("id", row.id);
        if (upErr) throw upErr;
      }
      migrated++;
    } catch (err) {
      console.error(`  ✗ errore su ${row.id}:`, err.message ?? err);
      errors++;
    }
  }

  console.log("\n--- Riepilogo ---");
  console.log(`Migrate: ${migrated}`);
  console.log(`Già ok / senza foto base64: ${skipped}`);
  console.log(`Errori: ${errors}`);
}

main().catch((err) => {
  console.error("Errore fatale:", err);
  process.exit(1);
});
