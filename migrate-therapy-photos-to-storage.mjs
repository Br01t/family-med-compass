#!/usr/bin/env node
/**
 * MIGRAZIONE UNA-TANTUM: sposta tutte le foto terapie ancora salvate come
 * base64 (colonne therapies.photo_drug / photo_package) su Supabase
 * Storage (bucket "therapy-photos"), sostituendo il valore in DB con
 * l'URL pubblico.
 *
 * Perché: le foto base64 inline nel DB vengono riscaricate PER INTERO a
 * ogni fetch della lista terapie (fetchTherapiesOnce), su ogni apertura
 * dell'app — è la causa più probabile dell'egress anomalo osservato
 * (5.62 GB/mese con solo 28 utenti attivi). Le nuove terapie create dopo
 * l'introduzione dello Storage sono già a posto; questo script sistema
 * quelle vecchie, create prima.
 *
 * A differenza di migrateAllTherapyPhotosToStorage() nell'app (che gira
 * lato client, autenticato, e quindi vede solo le terapie dell'utente
 * loggato per via delle RLS), questo script usa la SERVICE ROLE KEY e
 * copre TUTTE le righe del DB in un colpo solo, indipendentemente da chi
 * le ha create.
 *
 * USO:
 *   1. npm install @supabase/supabase-js   (se non già presente)
 *   2. export SUPABASE_URL="https://xxxxx.supabase.co"
 *      export SUPABASE_SERVICE_ROLE_KEY="eyJ..."   (Project Settings → API → service_role, MAI esporla altrove)
 *   3. node migrate-therapy-photos-to-storage.mjs
 *
 *   Aggiungi --dry-run per vedere solo quante righe verrebbero toccate,
 *   senza scrivere nulla.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes("--dry-run");
const BUCKET = "therapy-photos";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Mancano SUPABASE_URL e/o SUPABASE_SERVICE_ROLE_KEY nell'ambiente. Vedi commento in testa al file.",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function dataUrlToBuffer(dataUrl) {
  const match = /^data:(image\/\w+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Formato dataURL non riconosciuto");
  const contentType = match[1];
  const ext = contentType.split("/")[1] === "jpeg" ? "jpg" : contentType.split("/")[1];
  const buffer = Buffer.from(match[2], "base64");
  return { buffer, contentType, ext };
}

async function uploadPhoto(therapyId, kind, dataUrl) {
  const { buffer, contentType, ext } = dataUrlToBuffer(dataUrl);
  const path = `therapies/${therapyId}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    upsert: true,
    contentType,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function main() {
  console.log(DRY_RUN ? "Modalità DRY RUN (nessuna scrittura)" : "Migrazione in corso...");

  const { data: rows, error } = await supabase
    .from("therapies")
    .select("id, photo_drug, photo_package");
  if (error) throw error;

  const toMigrate = (rows ?? []).filter(
    (r) => r.photo_drug?.startsWith("data:") || r.photo_package?.startsWith("data:"),
  );

  console.log(`Terapie totali: ${rows?.length ?? 0}`);
  console.log(`Terapie con foto ancora in base64: ${toMigrate.length}`);

  if (DRY_RUN || toMigrate.length === 0) {
    console.log("Fine (dry-run o niente da migrare).");
    return;
  }

  let migrated = 0;
  let errors = 0;

  for (const row of toMigrate) {
    try {
      const patch = {};
      if (row.photo_drug?.startsWith("data:")) {
        patch.photo_drug = await uploadPhoto(row.id, "drug", row.photo_drug);
      }
      if (row.photo_package?.startsWith("data:")) {
        patch.photo_package = await uploadPhoto(row.id, "package", row.photo_package);
      }
      const { error: upErr } = await supabase.from("therapies").update(patch).eq("id", row.id);
      if (upErr) throw upErr;
      migrated++;
      console.log(`  ✓ ${row.id}`);
    } catch (err) {
      errors++;
      console.error(`  ✗ ${row.id}:`, err.message ?? err);
    }
  }

  console.log(`\nCompletato. Migrate: ${migrated}. Errori: ${errors}.`);
  if (errors > 0) {
    console.log("Rilancia lo script: è idempotente, riprova solo le righe rimaste con dataURL.");
  }
}

main().catch((err) => {
  console.error("Errore fatale:", err);
  process.exit(1);
});
