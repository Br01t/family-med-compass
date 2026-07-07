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
  createTherapyDoc,
  saveTherapyDoc,
  deleteTherapyDoc,
  saveEventDoc,
  updateNotificationReadState,
  fetchAllPatients,
  followPatient as followPatientDoc,
  unfollowPatient as unfollowPatientDoc,
  insertNotificationDoc,
  fetchCaregiverIdsForPatient,
} from "./supabase-service";
import { sendPushToUser } from "./push-subscription";


type Ctx = {
  data: FamilyMedData;
  user: User | null;
  userProfile: UserProfile | null;
  loadingAuth: boolean;
  allPatients: Patient[];
  refreshAllPatients: () => Promise<void>;
  followPatient: (patientId: string) => Promise<void>;
  unfollowPatient: (patientId: string) => Promise<void>;
  setRole: (role: Role) => void;
  setCurrentPatient: (id: string) => void;
  confirmDose: (params: {
    therapyId: string;
    scheduledAt: Date;
    confirmedBy: string;
  }) => void;
  skipDose: (params: { therapyId: string; scheduledAt: Date }) => void;
  snoozeDose: (params: { therapyId: string; scheduledAt: Date; minutes?: number }) => void;
  addTherapy: (t: Therapy) => void;
  updateTherapy: (id: string, patch: Partial<Therapy>) => void;
  deleteTherapy: (id: string) => void;
  addPatient: (p: Patient) => Promise<void>;
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

    const finalizeAuth = async (u: User | null, profile: UserProfile | null) => {
      setUser(u);
      setUserProfile(profile);
      if (profile) {
        setLocalData((d) => ({
          ...d,
          currentRole: profile.role,
        }));
        // Backfill user_roles se mancante (utenti creati prima del trigger)
        if (u && supabase) {
          supabase
            .from("user_roles")
            .upsert({ user_id: u.id, role: profile.role }, { onConflict: "user_id,role" })
            .then(({ error }) => {
              if (error) console.warn("[store] backfill user_roles:", error.message);
            });
        }
      }
      setLoadingAuth(false);
    };


    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      if (!u) {
        finalizeAuth(null, null);
        return;
      }

      getUserProfile(u.id)
        .then((profile) => finalizeAuth(u, profile))
        .catch(() => finalizeAuth(u, null));
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const u = session?.user ?? null;
      if (!u) {
        finalizeAuth(null, null);
        return;
      }

      try {
        const profile = await getUserProfile(u.id, u);
        finalizeAuth(u, profile);
      } catch {
        finalizeAuth(u, null);
      }
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
      } else if (userProfile.role === "paziente") {
        // Recovery: il record paziente non esiste ancora, crealo ora
        addPatientDoc({
          id: `p_${user.id}`,
          name: userProfile.name || user.email || "Paziente",
          photo: undefined,
          birthYear: undefined,
          caregiverIds: [],
          userId: user.id,
        }).catch((err) => console.warn("[store] Recovery paziente fallito:", err));
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
        await notifyCaregiversAboutDose({
          patientId: therapy.patientId,
          therapyId: therapy.id,
          eventId: updatedEvent.id,
          scheduledAt,
          kind: "taken",
          therapyName: therapy.name,
          patientName: patients.find((p) => p.id === therapy.patientId)?.name ?? "Paziente",
          actor: confirmedBy,
        });
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
    [user, therapies, events, patients]
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

  const snoozeDose = useCallback(
    async ({
      therapyId,
      scheduledAt,
      minutes = 10,
    }: {
      therapyId: string;
      scheduledAt: Date;
      minutes?: number;
    }) => {
      const therapy = therapies.find((t) => t.id === therapyId);
      if (!therapy) return;
      const nowIso = new Date().toISOString();
      const scheduledIso = scheduledAt.toISOString();
      const snoozedUntil = new Date(Date.now() + minutes * 60_000).toISOString();
      const existingEvent = events.find(
        (e) =>
          e.therapyId === therapyId &&
          Math.abs(new Date(e.scheduledAt).getTime() - scheduledAt.getTime()) < 60_000,
      );
      const updatedEvent: MedicationEvent = existingEvent
        ? {
            ...existingEvent,
            status: "reminder" as const,
            timeline: [
              ...existingEvent.timeline,
              { at: nowIso, kind: "snoozed", message: `Rimandata di ${minutes} min` },
            ],
          }
        : {
            id: `e_${therapyId}_${Date.now()}`,
            therapyId,
            patientId: therapy.patientId,
            scheduledAt: scheduledIso,
            status: "reminder" as const,
            timeline: [
              { at: scheduledIso, kind: "scheduled", message: "Dose programmata" },
              { at: nowIso, kind: "snoozed", message: `Rimandata di ${minutes} min` },
            ],
          };
      if (user) {
        // La colonna snoozed_until è gestita direttamente in Supabase via update mirato
        await saveEventDoc(updatedEvent);
        if (supabase) {
          await supabase.from("events").update({ status: "snoozed", snoozed_until: snoozedUntil }).eq("id", updatedEvent.id);
        }
      } else {
        setLocalData((d) => {
          const nextEvents = existingEvent
            ? d.events.map((e) => (e === existingEvent ? updatedEvent : e))
            : [...d.events, updatedEvent];
          return { ...d, events: nextEvents };
        });
      }
    },
    [user, therapies, events],
  );

  const addTherapy = useCallback(
    async (t: Therapy) => {
      if (user) {
        await createTherapyDoc(t);
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
      console.log("[store.addPatient] Ricevuto paziente:", p);
      console.log("[store.addPatient] user.id:", user?.id);
      
      if (user) {
        console.log("[store.addPatient] Utente autenticato, chiamo addPatientDoc");
        const patientWithUserId = { ...p, userId: user.id };
        console.log("[store.addPatient] Paziente con userId:", patientWithUserId);
        
        try {
          await addPatientDoc(patientWithUserId);
          console.log("[store.addPatient] addPatientDoc completato con successo");
        } catch (error) {
          console.error("[store.addPatient] Errore in addPatientDoc:", error);
          throw error;
        }
        
        setPatients((prev) => (prev.some((item) => item.id === p.id) ? prev : [...prev, p]));
        setLocalData((d) => ({
          ...d,
          patients: d.patients.some((item) => item.id === p.id) ? d.patients : [...d.patients, p],
        }));
      } else {
        console.log("[store.addPatient] Utente non autenticato, salvataggio locale");
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
    setUser(null);
    setUserProfile(null);
    setLoadingAuth(true);
    setPatients([]);
    setCaregivers([]);
    setTherapies([]);
    setEvents([]);
    setNotifications([]);
    setCurrentPatientId("");
    setLocalData(initialData);

    if (supabase) {
      await supabase.auth.signOut();
    }

    setLoadingAuth(false);
  }, []);

  // ---- Open patient list + follow / unfollow --------------------
  const [allPatients, setAllPatients] = useState<Patient[]>([]);

  const refreshAllPatients = useCallback(async () => {
    const list = await fetchAllPatients();
    setAllPatients(list);
  }, []);

  useEffect(() => {
    if (user && userProfile?.role === "caregiver") {
      refreshAllPatients();
    } else {
      setAllPatients([]);
    }
  }, [user, userProfile, refreshAllPatients, patients]);

  const followPatient = useCallback(
    async (patientId: string) => {
      if (!user) return;
      await followPatientDoc(user.id, patientId);
    },
    [user],
  );

  const unfollowPatient = useCallback(
    async (patientId: string) => {
      if (!user) return;
      await unfollowPatientDoc(user.id, patientId);
    },
    [user],
  );

  const value = useMemo<Ctx>(
    () => ({
      data,
      user,
      userProfile,
      loadingAuth,
      allPatients,
      refreshAllPatients,
      followPatient,
      unfollowPatient,
      setRole,
      setCurrentPatient,
      confirmDose,
      skipDose,
      snoozeDose,
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
      allPatients,
      refreshAllPatients,
      followPatient,
      unfollowPatient,
      setRole,
      setCurrentPatient,
      confirmDose,
      skipDose,
      snoozeDose,
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
