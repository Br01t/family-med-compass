import { describe, it, expect } from "vitest";
import { getPlanLimits, canAccessFeature, PLAN_LIMITS } from "@/lib/subscription";

describe("Unit Tests — Regole di Business dei Piani & Feature Gating", () => {
  it("il piano Free garantisce sempre l'export GDPR (Art. 20)", () => {
    expect(PLAN_LIMITS.free.gdprExport).toBe(true);
    expect(PLAN_LIMITS.pro.gdprExport).toBe(true);
    expect(PLAN_LIMITS.max.gdprExport).toBe(true);
  });

  it("il piano Free impone limite a 1 paziente e 3 terapie", () => {
    const limits = getPlanLimits("free");
    expect(limits.maxPatients).toBe(1);
    expect(limits.maxActiveTherapiesPerPatient).toBe(3);
    expect(limits.vitalParameters).toBe(false);
  });

  it("canAccessFeature abilita o blocca le feature in base al piano", () => {
    expect(canAccessFeature("free", "vitalParameters")).toBe(false);
    expect(canAccessFeature("pro", "vitalParameters")).toBe(true);
    expect(canAccessFeature("max", "vitalParameters")).toBe(true);

    expect(canAccessFeature("free", "pdfAggregatedExport")).toBe(false);
    expect(canAccessFeature("pro", "pdfAggregatedExport")).toBe(false);
    expect(canAccessFeature("max", "pdfAggregatedExport")).toBe(true);
  });
});
