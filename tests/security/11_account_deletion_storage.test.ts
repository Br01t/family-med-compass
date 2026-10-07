import { describe, it, expect, afterAll } from "vitest";
import { createAndAuthenticateUser, getAdminClient } from "../fixtures/seed-test-users";
import { purgeOwnedTherapyPhotos, purgeOwnCaregiverAvatar } from "../../src/lib/account-storage-purge";

/**
 * GDPR art. 17: alla cancellazione dell'account i FILE (foto terapie, avatar) devono
 * sparire dallo Storage, non solo le righe del database. Usa lo stesso codice
 * dell'app (src/lib/account-storage-purge.ts, chiamato da AccountDataCard).
 */
const stamp = Date.now();
const admin = getAdminClient();
const blob = () => new Blob(["fake-image-bytes"], { type: "image/jpeg" });
const cleanupUsers: string[] = [];
const cleanupPaths: { bucket: string; path: string }[] = [];

async function upload(bucket: string, path: string) {
  const { error } = await admin.storage.from(bucket).upload(path, blob(), { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(`upload ${bucket}/${path}: ${error.message}`);
  cleanupPaths.push({ bucket, path });
}
async function exists(bucket: string, path: string) {
  const dir = path.split("/").slice(0, -1).join("/");
  const name = path.split("/").pop()!;
  const { data } = await admin.storage.from(bucket).list(dir);
  return (data ?? []).some((f) => f.name === name);
}

afterAll(async () => {
  for (const { bucket, path } of cleanupPaths) await admin.storage.from(bucket).remove([path]);
  for (const id of cleanupUsers) await admin.auth.admin.deleteUser(id).catch(() => {});
});

describe("Cancellazione account — pulizia file su Storage", () => {
  it("Foto delle terapie e avatar vengono rimossi PRIMA di delete_my_account", async () => {
    const owner = await createAndAuthenticateUser(`del_owner_${stamp}@test.local`, "Password123!", "caregiver", "Del Owner");
    cleanupUsers.push(owner.userId);
    const pid = `p_del_${stamp}`;
    const tid = `t_del_${stamp}`;
    await admin.from("patients").insert({ id: pid, name: "Paziente Del", birth_year: 1950, owner_user_id: owner.userId, primary_caregiver_id: owner.userId });
    await admin.from("therapies").insert({ id: tid, patient_id: pid, name: "Terapia Del", times: ["08:00"], recurrence: { type: "daily" } });

    const drug = `therapies/${pid}/${tid}/drug.jpg`;
    const pack = `therapies/${pid}/${tid}/package.jpg`;
    const avatar = `caregivers/${owner.userId}/avatar.jpg`;
    await upload("therapy-photos", drug);
    await upload("therapy-photos", pack);
    await upload("caregiver-avatars", avatar);
    expect(await exists("therapy-photos", drug)).toBe(true);

    // Stesso ordine dell'app: file -> RPC
    expect(await purgeOwnedTherapyPhotos(owner.client, owner.userId)).toBe(2);
    expect(await purgeOwnCaregiverAvatar(owner.client, owner.userId)).toBe(1);
    const { error } = await owner.client.rpc("delete_my_account");
    expect(error).toBeNull();

    expect(await exists("therapy-photos", drug)).toBe(false);
    expect(await exists("therapy-photos", pack)).toBe(false);
    expect(await exists("caregiver-avatars", avatar)).toBe(false);

    const { data: p } = await admin.from("patients").select("id").eq("id", pid);
    expect(p ?? []).toHaveLength(0);
  });

  it("Un caregiver collegato che cancella il PROPRIO account NON elimina le foto della famiglia", async () => {
    const owner = await createAndAuthenticateUser(`keep_owner_${stamp}@test.local`, "Password123!", "caregiver", "Keep Owner");
    const guest = await createAndAuthenticateUser(`keep_guest_${stamp}@test.local`, "Password123!", "caregiver", "Keep Guest");
    cleanupUsers.push(owner.userId, guest.userId);
    const pid = `p_keep_${stamp}`;
    const tid = `t_keep_${stamp}`;
    await admin.from("patients").insert({ id: pid, name: "Paziente Keep", birth_year: 1950, owner_user_id: owner.userId, primary_caregiver_id: owner.userId });
    await admin.from("caregiver_patients").insert({ caregiver_id: guest.userId, patient_id: pid, relationship: "Figlio" });
    await admin.from("therapies").insert({ id: tid, patient_id: pid, name: "Terapia Keep", times: ["08:00"], recurrence: { type: "daily" } });
    const photo = `therapies/${pid}/${tid}/drug.jpg`;
    await upload("therapy-photos", photo);

    expect(await purgeOwnedTherapyPhotos(guest.client, guest.userId)).toBe(0);
    expect(await exists("therapy-photos", photo)).toBe(true);
  });
});
