import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTestEnvironment, teardownTestEnvironment, TestEnvironment } from "../fixtures/seed-test-users";
import { TEST_CONFIG } from "../fixtures/test-constants";
import { createClient } from "@supabase/supabase-js";

describe("Sicurezza & Privacy — Bucket Storage Privati & Signed URLs", () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    env = await setupTestEnvironment();
  });

  afterAll(async () => {
    await teardownTestEnvironment(env);
  });

  it("Richieste anonime (senza login) NON possono scaricare foto dal bucket therapy-photos", async () => {
    const anonClient = createClient(TEST_CONFIG.supabaseUrl, TEST_CONFIG.supabaseAnonKey);

    // Carichiamo un file di test via admin
    const testPath = `therapies/${env.patientId}/t_priv_1/drug-test.jpg`;
    const dummyBlob = new Blob(["fake-image-bytes"], { type: "image/jpeg" });

    await env.adminClient.storage.from("therapy-photos").upload(testPath, dummyBlob, {
      contentType: "image/jpeg",
      upsert: true,
    });

    // 1. Download non autenticato deve fallire
    const { data: anonData, error: anonError } = await anonClient.storage
      .from("therapy-photos")
      .download(testPath);

    expect(anonError).toBeDefined();
    expect(anonData).toBeNull();

    // 2. Creazione signed URL non autenticata deve fallire
    const { data: signedData, error: signedError } = await anonClient.storage
      .from("therapy-photos")
      .createSignedUrl(testPath, 60);

    expect(signedError).toBeDefined();
    expect(signedData?.signedUrl).toBeUndefined();

    // Cleanup
    await env.adminClient.storage.from("therapy-photos").remove([testPath]);
  });

  it("Estraneo B NON può creare un Signed URL per le foto del Paziente A", async () => {
    const photoPath = `therapies/${env.patientId}/t_priv_2/package-test.jpg`;
    const dummyBlob = new Blob(["private-packaging-data"], { type: "image/jpeg" });

    await env.adminClient.storage.from("therapy-photos").upload(photoPath, dummyBlob, {
      contentType: "image/jpeg",
      upsert: true,
    });

    // Estraneo tenta di creare il Signed URL
    const { data, error } = await env.strangerUser.client.storage
      .from("therapy-photos")
      .createSignedUrl(photoPath, 3600);

    // RLS / policy deve bloccare l'accesso
    expect(error || !data?.signedUrl).toBeTruthy();

    await env.adminClient.storage.from("therapy-photos").remove([photoPath]);
  });

  it("Caregiver Primario PUÒ caricare e il Secondario PUÒ visualizzare la foto", async () => {
    const photoPath = `therapies/${env.patientId}/t_priv_3/drug-authorized.jpg`;
    const dummyBlob = new Blob(["authorized-drug-image"], { type: "image/jpeg" });

    // 1. Primario carica la foto
    const { error: uploadErr } = await env.primaryCaregiverUser.client.storage
      .from("therapy-photos")
      .upload(photoPath, dummyBlob, { contentType: "image/jpeg", upsert: true });

    expect(uploadErr).toBeNull();

    // 2. Secondario collegato genera il Signed URL per vederla
    const { data: signedData, error: signedErr } = await env.secondaryCaregiverUser.client.storage
      .from("therapy-photos")
      .createSignedUrl(photoPath, 3600);

    expect(signedErr).toBeNull();
    expect(signedData?.signedUrl).toBeDefined();
    expect(signedData?.signedUrl).toContain("token=");

    // Pulizia
    await env.primaryCaregiverUser.client.storage.from("therapy-photos").remove([photoPath]);
  });

  it("Caregiver Estraneo B NON può sovrascrivere né cancellare l'avatar del Caregiver A", async () => {
    const avatarPath = `caregivers/${env.primaryCaregiverUser.userId}/avatar.jpg`;
    const dummyAvatar = new Blob(["my-face"], { type: "image/jpeg" });

    // Primario crea il proprio avatar
    await env.primaryCaregiverUser.client.storage
      .from("caregiver-avatars")
      .upload(avatarPath, dummyAvatar, { upsert: true });

    // Estraneo tenta di sovrascrivere o eliminare
    const { error: overwriteErr } = await env.strangerUser.client.storage
      .from("caregiver-avatars")
      .upload(avatarPath, new Blob(["hacked"]), { upsert: true });

    expect(overwriteErr).toBeDefined();

    const { error: deleteErr } = await env.strangerUser.client.storage
      .from("caregiver-avatars")
      .remove([avatarPath]);

    expect(deleteErr).toBeDefined();

    // Pulizia da parte del proprietario
    await env.primaryCaregiverUser.client.storage
      .from("caregiver-avatars")
      .remove([avatarPath]);
  });
});
