import { describe, it, expect } from "vitest";
import { extractPrivatePhotoPath } from "@/lib/private-photo-url";

describe("Unit Tests — Risoluzione Path Storage & Cache Foto Private", () => {
  it("estrae correttamente il path nudo da un percorso standard", () => {
    const raw = "therapies/patient_123/therapy_456/drug-1700000.jpg";
    const path = extractPrivatePhotoPath("therapy-photos", "therapies/", raw);
    expect(path).toBe(raw);
  });

  it("converte in modo retrocompatibile i vecchi URL pubblici in path relativi", () => {
    const legacyUrl =
      "https://qdwadqkpobtxivlypbio.supabase.co/storage/v1/object/public/therapy-photos/therapies/p1/t1/package.png?t=2026-09-14";
    const path = extractPrivatePhotoPath("therapy-photos", "therapies/", legacyUrl);
    expect(path).toBe("therapies/p1/t1/package.png");
  });

  it("gestisce caratteri codificati o spazi nell'URL", () => {
    const encodedUrl =
      "https://example.com/therapy-photos/therapies%2Fp1%2Ftest%20space.jpg";
    const path = extractPrivatePhotoPath("therapy-photos", "therapies/", encodedUrl);
    expect(path).toBe("therapies/p1/test space.jpg");
  });

  it("ritorna null per valori non validi o appartenenti ad altri domini", () => {
    expect(extractPrivatePhotoPath("therapy-photos", "therapies/", null)).toBeNull();
    expect(extractPrivatePhotoPath("therapy-photos", "therapies/", undefined)).toBeNull();
    expect(extractPrivatePhotoPath("therapy-photos", "therapies/", "https://evil.com/other-bucket/photo.jpg")).toBeNull();
  });
});
