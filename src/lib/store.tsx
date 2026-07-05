import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { initialData, type FamilyMedData, type Role, type Patient } from "./mock-data";

const STORAGE_KEY = "familymed:data:v1";

type Ctx = {
  data: FamilyMedData;
  setRole: (role: Role) => void;
  setCurrentPatient: (id: string) => void;
  confirmDose: (params: {
    therapyId: string;
    scheduledAt: Date;
    confirmedBy: string;
  }) => void;
  skipDose: (params: { therapyId: string; scheduledAt: Date }) => void;
  addTherapy: (t: FamilyMedData["therapies"][number]) => void;
  updateTherapy: (id: string, patch: Partial<FamilyMedData["therapies"][number]>) => void;
  deleteTherapy: (id: string) => void;
  addPatient: (p: Patient) => void;
  deletePatient: (id: string) => void;
  markNotificationRead: (id: string) => void;
  markAllRead: () => void;
  resetDemoData: () => void;
};

const FamilyMedContext = createContext<Ctx | null>(null);

function loadFromStorage(): FamilyMedData {
  if (typeof window === "undefined") return initialData;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialData;
    const parsed = JSON.parse(raw) as FamilyMedData;
    // Basic shape check
    if (!parsed.patients || !parsed.therapies) return initialData;
    return parsed;
  } catch {
    return initialData;
  }
}

export function FamilyMedProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<FamilyMedData>(initialData);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setData(loadFromStorage());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* quota */
    }
  }, [data, hydrated]);

  // Force re-render every 30s so status transitions (due→late) are reflected
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const setRole = useCallback((role: Role) => {
    setData((d) => ({ ...d, currentRole: role }));
  }, []);

  const setCurrentPatient = useCallback((id: string) => {
    setData((d) => ({ ...d, currentPatientId: id }));
  }, []);

  const confirmDose = useCallback(
    ({ therapyId, scheduledAt, confirmedBy }: {
      therapyId: string;
      scheduledAt: Date;
      confirmedBy: string;
    }) => {
      setData((d) => {
        const therapy = d.therapies.find((t) => t.id === therapyId);
        if (!therapy) return d;
        const nowIso = new Date().toISOString();
        const scheduledIso = scheduledAt.toISOString();
        const existing = d.events.find(
          (e) =>
            e.therapyId === therapyId &&
            Math.abs(new Date(e.scheduledAt).getTime() - scheduledAt.getTime()) <
              60_000,
        );
        const nextEvents = existing
          ? d.events.map((e) =>
              e === existing
                ? {
                    ...e,
                    status: "taken" as const,
                    confirmedAt: nowIso,
                    confirmedBy,
                    timeline: [
                      ...e.timeline,
                      { at: nowIso, kind: "taken", message: "Confermata" },
                    ],
                  }
                : e,
            )
          : [
              ...d.events,
              {
                id: `e_${therapyId}_${Date.now()}`,
                therapyId,
                patientId: therapy.patientId,
                scheduledAt: scheduledIso,
                status: "taken" as const,
                confirmedAt: nowIso,
                confirmedBy,
                timeline: [
                  { at: scheduledIso, kind: "scheduled", message: "Dose programmata" },
                  { at: nowIso, kind: "taken", message: "Confermata" },
                ],
              },
            ];

        const nextTherapies = d.therapies.map((t) =>
          t.id === therapyId
            ? {
                ...t,
                pillsRemaining: Math.max(0, t.pillsRemaining - t.quantity),
              }
            : t,
        );

        return { ...d, events: nextEvents, therapies: nextTherapies };
      });
    },
    [],
  );

  const skipDose = useCallback(
    ({ therapyId, scheduledAt }: { therapyId: string; scheduledAt: Date }) => {
      setData((d) => {
        const therapy = d.therapies.find((t) => t.id === therapyId);
        if (!therapy) return d;
        const nowIso = new Date().toISOString();
        const scheduledIso = scheduledAt.toISOString();
        const existing = d.events.find(
          (e) =>
            e.therapyId === therapyId &&
            Math.abs(new Date(e.scheduledAt).getTime() - scheduledAt.getTime()) <
              60_000,
        );
        const nextEvents = existing
          ? d.events.map((e) =>
              e === existing
                ? {
                    ...e,
                    status: "skipped" as const,
                    timeline: [
                      ...e.timeline,
                      { at: nowIso, kind: "skipped", message: "Saltata" },
                    ],
                  }
                : e,
            )
          : [
              ...d.events,
              {
                id: `e_${therapyId}_${Date.now()}`,
                therapyId,
                patientId: therapy.patientId,
                scheduledAt: scheduledIso,
                status: "skipped" as const,
                timeline: [
                  { at: scheduledIso, kind: "scheduled", message: "Dose programmata" },
                  { at: nowIso, kind: "skipped", message: "Saltata" },
                ],
              },
            ];
        return { ...d, events: nextEvents };
      });
    },
    [],
  );

  const addTherapy = useCallback((t: FamilyMedData["therapies"][number]) => {
    setData((d) => ({ ...d, therapies: [...d.therapies, t] }));
  }, []);

  const updateTherapy = useCallback(
    (id: string, patch: Partial<FamilyMedData["therapies"][number]>) => {
      setData((d) => ({
        ...d,
        therapies: d.therapies.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      }));
    },
    [],
  );

  const deleteTherapy = useCallback((id: string) => {
    setData((d) => ({ ...d, therapies: d.therapies.filter((t) => t.id !== id) }));
  }, []);

  const addPatient = useCallback((p: Patient) => {
    setData((d) => ({ ...d, patients: [...d.patients, p] }));
  }, []);

  const deletePatient = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      patients: d.patients.filter((p) => p.id !== id),
      therapies: d.therapies.filter((t) => t.patientId !== id),
    }));
  }, []);

  const markNotificationRead = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      notifications: d.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n,
      ),
    }));
  }, []);

  const markAllRead = useCallback(() => {
    setData((d) => ({
      ...d,
      notifications: d.notifications.map((n) => ({ ...n, read: true })),
    }));
  }, []);

  const resetDemoData = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    setData(initialData);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      data,
      setRole,
      setCurrentPatient,
      confirmDose,
      skipDose,
      addTherapy,
      updateTherapy,
      deleteTherapy,
      addPatient,
      deletePatient,
      markNotificationRead,
      markAllRead,
      resetDemoData,
    }),
    [
      data,
      setRole,
      setCurrentPatient,
      confirmDose,
      skipDose,
      addTherapy,
      updateTherapy,
      deleteTherapy,
      addPatient,
      deletePatient,
      markNotificationRead,
      markAllRead,
      resetDemoData,
    ],
  );

  return <FamilyMedContext.Provider value={value}>{children}</FamilyMedContext.Provider>;
}

export function useFamilyMed() {
  const ctx = useContext(FamilyMedContext);
  if (!ctx) throw new Error("useFamilyMed must be used within FamilyMedProvider");
  return ctx;
}
