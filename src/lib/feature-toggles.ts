import { useEffect, useState } from "react";

export type FeatureKey = "storico" | "parametri" | "scorte" | "diario" | "eccezioni";

export interface FeatureToggles {
  storico: boolean;
  parametri: boolean;
  scorte: boolean;
  diario: boolean;
  eccezioni: boolean;
}

export const DEFAULT_FEATURE_TOGGLES: FeatureToggles = {
  storico: true,
  parametri: true,
  scorte: true,
  diario: true,
  eccezioni: true,
};

const STORAGE_KEY = "familymed_feature_toggles";

export function getFeatureToggles(): FeatureToggles {
  if (typeof window === "undefined") return DEFAULT_FEATURE_TOGGLES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_FEATURE_TOGGLES;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_FEATURE_TOGGLES, ...parsed };
  } catch {
    return DEFAULT_FEATURE_TOGGLES;
  }
}

export function saveFeatureToggles(toggles: FeatureToggles): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toggles));
    window.dispatchEvent(new Event("familymed_feature_toggles_updated"));
  } catch (err) {
    console.warn("Save feature toggles failed:", err);
  }
}

export function useFeatureToggles() {
  const [toggles, setToggles] = useState<FeatureToggles>(getFeatureToggles);

  useEffect(() => {
    const handleUpdate = () => setToggles(getFeatureToggles());
    window.addEventListener("familymed_feature_toggles_updated", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("familymed_feature_toggles_updated", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  const toggleFeature = (key: FeatureKey, value: boolean) => {
    const updated = { ...toggles, [key]: value };
    setToggles(updated);
    saveFeatureToggles(updated);
  };

  return { toggles, toggleFeature };
}
