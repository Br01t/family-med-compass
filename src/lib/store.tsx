import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { type User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { getUserProfile, type UserProfile } from "./auth-service";
import {
  initialData,
  type FamilyMedData,
  type Role,
  type Patient,
  type Therapy,
  type MedicationEvent,
  type Notification,
} from "./mock-data";
import {
  subscribePatients,
  subscribeCaregivers,
  subscribeTherapies,
  subscribeEvents,
  subscribeNotifications,
  addPatientDoc,
  deletePatientDoc,
  saveTherapyDoc,
  deleteTherapyDoc,
  saveEventDoc,
  updateNotificationReadState,
} from "./supabase-service";

type Ctx = {
  data: FamilyMedData;
  user: User | null;
  userProfile: UserProfile | null;
  loadingAuth: boolean;
  setRole: (role: Role) => void;
  setCurrentPatient: (id: string) => void;
  confirmDose: (params: {
    therapyId: string;
    scheduledAt: Date;
    confirmedBy: string;
  }) => void;
  skipDose: (params: { therapyId: string; scheduledAt: Date }) => void;
  addTherapy: (t: Therapy) => void;
  updateTherapy: (id: string, patch: Partial<Therapy>) => void;
  deleteTherapy: (id: string) => void;
  addPatient: (p: Patient) => void;
  deletePatient: (id: string) => void;
  markNotificationRead: (id: string) => void;
  markAllRead: () => void;
  resetDemoData: () => void;
  logout: () => Promise<void>;
};

const FamilyMedContext = createContext<Ctx | null>(null);

export function FamilyMedProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // Fallback state in case of offline/mock or before Supabase login
  const [localData, setLocalData] = useState<FamilyMedData>(initialData);

  // Database-derived states
  const [patients, setPatients] = useState<Patient[]>([]);
  const [caregivers, setCaregivers] = useState<any[]>([]);
  const [therapies, setTherapies] = useState<Therapy[]>([]);
  const [events, setEvents] = useState<MedicationEvent[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [currentPatientId, setCurrentPatientId] = useState<string>("");

  // Listen to Supabase Auth state changes
  useEffect(() => {
    if (!supabase) {
      setLoadingAuth(false);
      return;
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        getUserProfile(u.id).then((profile) => {
          setUserProfile(profile);
          if (profile) {
            setLocalData((d) => ({
              ...d,
              currentRole: profile.role,
            }));
          }
        });
      }
      setLoadingAuth(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        const profile = await getUserProfile(u.id);
        setUserProfile(profile);
        if (profile) {
          setLocalData((d) => ({
            ...d,
            currentRole: profile.role,
          }));
        }
      } else {
        setUserProfile(null);
      }
      setLoadingAuth(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Subscribe to Collections (Patients, Caregivers, Notifications) when user is authenticated
  useEffect(() => {
    if (!user || !userProfile) {
      setPatients([]);
      setCaregivers([]);
      setNotifications([]);
      return;
    }

    const unsubPatients = subscribePatients(user.id, userProfile.role, (list) => {
      setPatients(list);
      if (list.length > 0) {
        setCurrentPatientId((prev) => {
          if (!prev || !list.some((p) => p.id === prev)) {
            return list[0].id;
          }
          return prev;
        });
      }
    });

    const unsubCaregivers = subscribeCaregivers(user.id, userProfile.role, setCaregivers);
    const unsubNotifications = subscribeNotifications(user.id, setNotifications);

    return () => {
      unsubPatients();
      unsubCaregivers();
      unsubNotifications();
    };
  }, [user, userProfile]);

  // Subscribe to Therapies and Events for the active patient
  useEffect(() => {
    if (!currentPatientId || !user) {
      setTherapies([]);
      setEvents([]);
      return;
    }

    const unsubTherapies = subscribeTherapies(currentPatientId, setTherapies);
    const unsubEvents = subscribeEvents(currentPatientId, setEvents);

    return () => {
      unsubTherapies();
      unsubEvents();
    };
  }, [currentPatientId, user]);

  // Merge Supabase database and Local configuration state
  const data = useMemo<FamilyMedData>(() => {
    if (user) {
      return {
        currentRole: userProfile?.role || localData.currentRole,
        currentPatientId: currentPatientId || localData.currentPatientId,
        currentCaregiverId: user.id,
        patients,
        caregivers,
        therapies,
        events,
        notifications,
        settings: localData.settings,
      };
    }
    return localData;
  }, [user, userProfile, localData, patients, caregivers, therapies, events, notifications, currentPatientId]);

  const setRole = useCallback((role: Role) => {
    if (user && userProfile && supabase) {
      // Update role in profiles table
      supabase
        .from("profiles")
        .update({ role })
        .eq("id", user.id)
        .then(({ error }) => {
          if (error) console.error("Errore aggiornamento ruolo:", error.message);
        });
    }
    setLocalData((d) => ({ ...d, currentRole: role }));
  }, [user, userProfile]);

  const setCurrentPatient = useCallback((id: string) => {
    setCurrentPatientId(id);
    setLocalData((d) => ({ ...d, currentPatientId: id }));
  }, []);

  const confirmDose = useCallback(
    async ({
      therapyId,
      scheduledAt,
      confirmedBy,
    }: {
      therapyId: string;
      scheduledAt: Date;
      confirmedBy: string;
    }) => {
      const therapy = therapies.find((t) => t.id === therapyId);
      if (!therapy) return;

      const nowIso = new Date().toISOString();
      const scheduledIso = scheduledAt.toISOString();

      const existingEvent = events.find(
        (e) =>
          e.therapyId === therapyId &&
          Math.abs(new Date(e.scheduledAt).getTime() - scheduledAt.getTime()) < 60_000
      );

      const updatedEvent: MedicationEvent = existingEvent
        ? {
            ...existingEvent,
            status: "taken" as const,
            confirmedAt: nowIso,
            confirmedBy,
            timeline: [
              ...existingEvent.timeline,
              { at: nowIso, kind: "taken", message: "Confermata" },
            ],
          }
        : {
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
          };

      if (user) {
        await saveEventDoc(updatedEvent);
        const updatedPills = Math.max(0, therapy.pillsRemaining - therapy.quantity);
        await saveTherapyDoc({ ...therapy, pillsRemaining: updatedPills });
      } else {
        setLocalData((d) => {
          const nextEvents = existingEvent
            ? d.events.map((e) => (e === existingEvent ? updatedEvent : e))
            : [...d.events, updatedEvent];
          const nextTherapies = d.therapies.map((t) =>
            t.id === therapyId ? { ...t, pillsRemaining: Math.max(0, t.pillsRemaining - t.quantity) } : t
          );
          return { ...d, events: nextEvents, therapies: nextTherapies };
        });
      }
    },
    [user, therapies, events]
  );

  const skipDose = useCallback(
    async ({ therapyId, scheduledAt }: { therapyId: string; scheduledAt: Date }) => {
      const therapy = therapies.find((t) => t.id === therapyId);
      if (!therapy) return;

      const nowIso = new Date().toISOString();
      const scheduledIso = scheduledAt.toISOString();

      const existingEvent = events.find(
        (e) =>
          e.therapyId === therapyId &&
          Math.abs(new Date(e.scheduledAt).getTime() - scheduledAt.getTime()) < 60_000
      );

      const updatedEvent: MedicationEvent = existingEvent
        ? {
            ...existingEvent,
            status: "skipped" as const,
            timeline: [
              ...existingEvent.timeline,
              { at: nowIso, kind: "skipped", message: "Saltata" },
            ],
          }
        : {
            id: `e_${therapyId}_${Date.now()}`,
            therapyId,
            patientId: therapy.patientId,
            scheduledAt: scheduledIso,
            status: "skipped" as const,
            timeline: [
              { at: scheduledIso, kind: "scheduled", message: "Dose programmata" },
              { at: nowIso, kind: "skipped", message: "Saltata" },
            ],
          };

      if (user) {
        await saveEventDoc(updatedEvent);
      } else {
        setLocalData((d) => {
          const nextEvents = existingEvent
            ? d.events.map((e) => (e === existingEvent ? updatedEvent : e))
            : [...d.events, updatedEvent];
          return { ...d, events: nextEvents };
        });
      }
    },
    [user, therapies, events]
  );

  const addTherapy = useCallback(
    async (t: Therapy) => {
      if (user) {
        await saveTherapyDoc(t);
      } else {
        setLocalData((d) => ({ ...d, therapies: [...d.therapies, t] }));
      }
    },
    [user]
  );

  const updateTherapy = useCallback(
    async (id: string, patch: Partial<Therapy>) => {
      const current = therapies.find((t) => t.id === id);
      if (!current) return;

      if (user) {
        await saveTherapyDoc({ ...current, ...patch });
      } else {
        setLocalData((d) => ({
          ...d,
          therapies: d.therapies.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        }));
      }
    },
    [user, therapies]
  );

  const deleteTherapy = useCallback(
    async (id: string) => {
      if (user) {
        await deleteTherapyDoc(id);
      } else {
        setLocalData((d) => ({ ...d, therapies: d.therapies.filter((t) => t.id !== id) }));
      }
    },
    [user]
  );

  const addPatient = useCallback(
    async (p: Patient) => {
      if (user) {
        await addPatientDoc(p);
      } else {
        setLocalData((d) => ({ ...d, patients: [...d.patients, p] }));
      }
    },
    [user]
  );

  const deletePatient = useCallback(
    async (id: string) => {
      if (user) {
        await deletePatientDoc(id);
      } else {
        setLocalData((d) => ({
          ...d,
          patients: d.patients.filter((p) => p.id !== id),
          therapies: d.therapies.filter((t) => t.patientId !== id),
        }));
      }
    },
    [user]
  );

  const markNotificationRead = useCallback(
    async (id: string) => {
      if (user) {
        await updateNotificationReadState(id, true);
      } else {
        setLocalData((d) => ({
          ...d,
          notifications: d.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
        }));
      }
    },
    [user]
  );

  const markAllRead = useCallback(async () => {
    if (user) {
      for (const n of notifications) {
        if (!n.read) {
          await updateNotificationReadState(n.id, true);
        }
      }
    } else {
      setLocalData((d) => ({
        ...d,
        notifications: d.notifications.map((n) => ({ ...n, read: true })),
      }));
    }
  }, [user, notifications]);

  const resetDemoData = useCallback(() => {
    if (!user) {
      setLocalData(initialData);
    }
  }, [user]);

  const logout = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      data,
      user,
      userProfile,
      loadingAuth,
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
      logout,
    }),
    [
      data,
      user,
      userProfile,
      loadingAuth,
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
      logout,
    ]
  );

  return <FamilyMedContext.Provider value={value}>{children}</FamilyMedContext.Provider>;
}

export function useFamilyMed() {
  const ctx = useContext(FamilyMedContext);
  if (!ctx) throw new Error("useFamilyMed must be used within FamilyMedProvider");
  return ctx;
}
