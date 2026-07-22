import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
import { CAREGIVER_ACK_TAG, isDoseAcknowledged } from "./therapy";

import {
  subscribePatients,
  subscribeCaregivers,
  subscribeTherapiesForPatients,
  subscribeEventsForPatients,
  subscribeNotifications,
  addPatientDoc,
  deletePatientDoc,
  createTherapyDoc,
  saveTherapyDoc,
  deleteTherapyDoc,
  saveEventDoc,
  updateNotificationReadState,
  markAllNotificationsRead,
  fetchPatientsOnce,
  unfollowPatient as unfollowPatientDoc,
  createFamilyInvite,
  redeemFamilyInvite,
  insertNotificationDoc,
  fetchCaregiverIdsForPatient,
  invalidateCaregiverCaches,
  type FamilyInvite,
} from "./supabase-service";




// Notifiche caregiver/paziente: sono generate esclusivamente dai trigger DB
// (`handle_dose_taken` e `handle_dose_status_change`). Non inserirle dal
// client per evitare duplicati (chiavi `dose_key` diverse fra client e trigger).


type Ctx = {
  data: FamilyMedData;
  user: User | null;
  userProfile: UserProfile | null;
  loadingAuth: boolean;
  redeemInvite: (code: string) => Promise<string>;
  createInvite: (patientId: string, ttlMinutes?: number, maxUses?: number) => Promise<FamilyInvite>;
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
  acknowledgeDose: (params: { therapyId: string; scheduledAt: Date; note?: string }) => Promise<void>;
  addTherapy: (t: Therapy) => void;
  updateTherapy: (id: string, patch: Partial<Therapy>) => void;
  deleteTherapy: (id: string) => void;
  addPatient: (p: Patient) => Promise<void>;
  deletePatient: (id: string) => void;
  markNotificationRead: (id: string) => void;
  markAllRead: () => void;
  resetDemoData: () => void;
  logout: () => Promise<void>;
  isPrimaryCaregiverOf: (patientId: string) => boolean;
  isSecondaryCaregiverOf: (patientId: string) => boolean;
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

  // Tiene traccia dell'ultimo profilo valido, leggibile in modo sincrono
  // (senza stale-closure) dentro finalizeAuth per non sloggare l'utente
  // in caso di un fallimento transitorio nel refetch del profilo.
  const userProfileRef = useRef<UserProfile | null>(null);
  useEffect(() => {
    userProfileRef.current = userProfile;
  }, [userProfile]);

  // Listen to Supabase Auth state changes
  useEffect(() => {
    if (!supabase) {
      setLoadingAuth(false);
      return;
    }

    const finalizeAuth = async (u: User | null, profile: UserProfile | null) => {
      setUser(u);
      // Se il fetch del profilo fallisce (anche dopo i retry interni a
      // getUserProfile) ma abbiamo già un profilo valido in memoria per lo
      // stesso utente, non sloggarlo: è quasi certamente solo un errore di
      // rete transitorio (es. refresh silenzioso del token quando l'app
      // torna in foreground dopo essere stata chiusa). Il profilo verrà
      // ri-sincronizzato al prossimo evento utile.
      const resolvedProfile =
        profile ?? (u && userProfileRef.current?.uid === u.id ? userProfileRef.current : null);
      setUserProfile(resolvedProfile);
      if (resolvedProfile) {
        setLocalData((d) => ({
          ...d,
          currentRole: resolvedProfile.role,
        }));
        // Backfill user_roles se mancante (utenti creati prima del trigger)
        if (u && supabase) {
          supabase
            .from("user_roles")
            .upsert({ user_id: u.id, role: resolvedProfile.role }, { onConflict: "user_id,role" })
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

      getUserProfile(u.id, u)
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
    const unsubNotifications = subscribeNotifications(
      user.id,
      setNotifications,
      userProfile.role === "paziente" ? "paziente" : "caregiver",
    );

    return () => {
      unsubPatients();
      unsubCaregivers();
      unsubNotifications();
    };
  }, [user, userProfile]);

  // Subscribe to Therapies and Events. Caregiver: tutti i pazienti seguiti.
  // Paziente: solo il suo record.
  useEffect(() => {
    if (!user || !userProfile) {
      setTherapies([]);
      setEvents([]);
      return;
    }
    const ids =
      userProfile.role === "caregiver"
        ? patients.map((p) => p.id)
        : currentPatientId
          ? [currentPatientId]
          : [];
    if (ids.length === 0) {
      setTherapies([]);
      setEvents([]);
      return;
    }
    const unsubTherapies = subscribeTherapiesForPatients(ids, setTherapies);
    const unsubEvents = subscribeEventsForPatients(ids, setEvents);
    return () => {
      unsubTherapies();
      unsubEvents();
    };
  }, [user, userProfile, currentPatientId, patients]);


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

  // Anti double-click: chiave per dose (therapyId@scheduledIso) in-flight.
  const pendingDoseActionsRef = useRef<Set<string>>(new Set());

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
      const actionKey = `${therapyId}@${scheduledIso}@confirm`;
      if (pendingDoseActionsRef.current.has(actionKey)) return;

      // NOTA: lo state "events" del provider è popolato SOLO dalla
      // sottoscrizione Supabase (utente loggato). In modalità locale/demo
      // (senza login) resta sempre [], quindi la ricerca dell'evento
      // esistente deve avvenire su localData.events, altrimenti questa
      // azione crea sempre un evento "taken" duplicato invece di aggiornare
      // quello già presente (es. "skipped"), e getDosesForPatientOnDate
      // continuerebbe a mostrare il primo evento trovato (quello vecchio,
      // non confermato) in timeline, storico e calcolo dell'aderenza.
      const eventsSource = user ? events : localData.events;
      const existingEvent = eventsSource.find(
        (e) =>
          e.therapyId === therapyId &&
          Math.abs(new Date(e.scheduledAt).getTime() - scheduledAt.getTime()) < 60_000
      );
      // Idempotenza: se la dose è già confermata, non ripetere l'azione.
      if (existingEvent?.status === "taken") return;
      pendingDoseActionsRef.current.add(actionKey);


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

      try {
        if (user) {
          await saveEventDoc(updatedEvent);
          // Decremento scorte, notifiche caregiver e low_stock sono generati
          // dal trigger DB handle_dose_taken.

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
      } finally {
        pendingDoseActionsRef.current.delete(actionKey);
      }
    },
    [user, therapies, events, localData.events, patients]
  );


  const skipDose = useCallback(
    async ({ therapyId, scheduledAt }: { therapyId: string; scheduledAt: Date }) => {
      const therapy = therapies.find((t) => t.id === therapyId);
      if (!therapy) return;

      const nowIso = new Date().toISOString();
      const scheduledIso = scheduledAt.toISOString();
      const actionKey = `${therapyId}@${scheduledIso}@skip`;
      if (pendingDoseActionsRef.current.has(actionKey)) return;

      // Vedi nota in confirmDose: in modalità locale/demo bisogna cercare
      // l'evento esistente in localData.events, non nello state "events"
      // (che è popolato solo per utenti Supabase loggati).
      const eventsSource = user ? events : localData.events;
      const existingEvent = eventsSource.find(
        (e) =>
          e.therapyId === therapyId &&
          Math.abs(new Date(e.scheduledAt).getTime() - scheduledAt.getTime()) < 60_000
      );
      // Idempotenza: se già finalizzata (presa o saltata), non ripetere.
      if (existingEvent?.status === "skipped" || existingEvent?.status === "taken") return;
      pendingDoseActionsRef.current.add(actionKey);

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

      try {
        if (user) {
          await saveEventDoc(updatedEvent);
          // Notifiche caregiver + notifica al paziente ("verrai contattato...")
          // sono generate dal trigger DB handle_dose_status_change.

        } else {
          setLocalData((d) => {
            const nextEvents = existingEvent
              ? d.events.map((e) => (e === existingEvent ? updatedEvent : e))
              : [...d.events, updatedEvent];
            return { ...d, events: nextEvents };
          });
        }
      } finally {
        pendingDoseActionsRef.current.delete(actionKey);
      }
    },
    [user, therapies, events, localData.events, patients]
  );


  // "Segnala come gestita" (caregiver): non cambia lo status della dose
  // (resta "missed"/"skipped") né tocca le scorte, ma marca l'evento come
  // gestito così l'alert sparisce dalla lista "Dose da confermare".
  // Deve funzionare sia online (Supabase) sia in modalità locale/demo,
  // altrimenti l'alert resta visibile per sempre quando non c'è un utente
  // autenticato (nessun aggiornamento veniva applicato a setLocalData).
  const acknowledgeDose = useCallback(
    async ({
      therapyId,
      scheduledAt,
      note,
    }: {
      therapyId: string;
      scheduledAt: Date;
      note?: string;
    }) => {
      // Vedi nota in confirmDose: in modalità locale/demo bisogna cercare
      // l'evento esistente in localData.events.
      const eventsSource = user ? events : localData.events;
      const existingEvent = eventsSource.find(
        (e) =>
          e.therapyId === therapyId &&
          Math.abs(new Date(e.scheduledAt).getTime() - scheduledAt.getTime()) < 60_000
      );
      if (!existingEvent) return;
      // Idempotenza: già gestita.
      if (isDoseAcknowledged(existingEvent)) return;

      const nowIso = new Date().toISOString();
      const updatedEvent: MedicationEvent = {
        ...existingEvent,
        note: [existingEvent.note, note ?? CAREGIVER_ACK_TAG].filter(Boolean).join(" | "),
        timeline: [
          ...existingEvent.timeline,
          { at: nowIso, kind: existingEvent.status, message: "Segnalata come gestita dal caregiver" },
        ],
      };

      if (user) {
        await saveEventDoc(updatedEvent);
      } else {
        setLocalData((d) => ({
          ...d,
          events: d.events.map((e) => (e === existingEvent ? updatedEvent : e)),
        }));
      }
    },
    [user, events, localData.events]
  );


  const snoozeDose = useCallback(
    async ({
      therapyId,
      scheduledAt,
      minutes,
    }: {
      therapyId: string;
      scheduledAt: Date;
      minutes?: number;
    }) => {
      const therapy = therapies.find((t) => t.id === therapyId);
      if (!therapy) return;
      // Il rimando dura ESATTAMENTE quanto il "post-reminder" impostato sulla
      // terapia. Nessun default di 10 min: se il parametro non è passato,
      // usiamo postReminderMinutes (fallback 5 min minimo).
      const snoozeMinutes = Math.max(
        1,
        Number(minutes ?? therapy.postReminderMinutes ?? 5),
      );
      const nowIso = new Date().toISOString();
      const scheduledIso = scheduledAt.toISOString();
      const actionKey = `${therapyId}@${scheduledIso}@snooze`;
      if (pendingDoseActionsRef.current.has(actionKey)) return;
      const snoozedUntil = new Date(Date.now() + snoozeMinutes * 60_000).toISOString();
      // Vedi nota in confirmDose: in modalità locale/demo bisogna cercare
      // l'evento esistente in localData.events.
      const eventsSource = user ? events : localData.events;
      const existingEvent = eventsSource.find(
        (e) =>
          e.therapyId === therapyId &&
          Math.abs(new Date(e.scheduledAt).getTime() - scheduledAt.getTime()) < 60_000,
      );
      // Idempotenza: se già presa/saltata, o già rimandata una volta, non fare nulla.
      if (existingEvent?.status === "taken" || existingEvent?.status === "skipped") return;
      const alreadySnoozed = Boolean(
        existingEvent?.snoozedUntil ||
          existingEvent?.status === "snoozed" ||
          existingEvent?.timeline?.some((t) => t.kind === "snoozed"),
      );
      if (alreadySnoozed) return;
      pendingDoseActionsRef.current.add(actionKey);
      const updatedEvent: MedicationEvent = existingEvent
        ? {
            ...existingEvent,
            status: "snoozed" as const,
            snoozedUntil,
            timeline: [
              ...existingEvent.timeline,
              { at: nowIso, kind: "snoozed", message: `Rimandata di ${snoozeMinutes} min` },
            ],
          }
        : {
            id: `e_${therapyId}_${Date.now()}`,
            therapyId,
            patientId: therapy.patientId,
            scheduledAt: scheduledIso,
            status: "snoozed" as const,
            snoozedUntil,
            timeline: [
              { at: scheduledIso, kind: "scheduled", message: "Dose programmata" },
              { at: nowIso, kind: "snoozed", message: `Rimandata di ${snoozeMinutes} min` },
            ],
          };
      try {
        if (user) {
          await saveEventDoc(updatedEvent);
          // Notifiche generate dal trigger DB handle_dose_status_change.

        } else {
          setLocalData((d) => {
            const nextEvents = existingEvent
              ? d.events.map((e) => (e === existingEvent ? updatedEvent : e))
              : [...d.events, updatedEvent];
            return { ...d, events: nextEvents };
          });
        }
      } finally {
        pendingDoseActionsRef.current.delete(actionKey);
      }
    },
    [user, therapies, events, localData.events, patients],
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
      if (user) {
        // Il caregiver che crea direttamente il paziente ne è il "primario proprietario":
        // valorizziamo owner_user_id così is_primary_of() (RLS su therapies/scorte/eventi)
        // lo riconosce subito, senza dover passare da un codice invito.
        // NON tocchiamo userId: quello è l'eventuale account auth del paziente.
        const patientWithOwner: Patient = {
          ...p,
          ownerUserId: p.ownerUserId ?? user.id,
        };
        try {
          await addPatientDoc(patientWithOwner);
        } catch (error) {
          console.error("[store.addPatient] Errore in addPatientDoc:", error);
          throw error;
        }
        setPatients((prev) => (prev.some((item) => item.id === p.id) ? prev : [...prev, patientWithOwner]));
        setLocalData((d) => ({
          ...d,
          patients: d.patients.some((item) => item.id === p.id) ? d.patients : [...d.patients, patientWithOwner],
        }));
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
      // Singola query bulk invece di N round-trip seriali → meno egress
      const unreadIds = notifications
        .filter((n) => !n.read && (!n.targetUserId || n.targetUserId === user.id))
        .map((n) => n.id);
      if (unreadIds.length > 0) {
        await markAllNotificationsRead(unreadIds);
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

  // ---- Follow / unfollow ------------------------------------------
  // `patients` (lista pazienti seguiti) non ha più un canale realtime
  // (vedi effetto di subscribe più sopra: solo fetch one-shot al login),
  // quindi dopo un'azione che cambia la relazione caregiver↔paziente la
  // rileggiamo esplicitamente con un fetch mirato.
  const refreshFollowedPatients = useCallback(async () => {
    if (!user || !userProfile) return;
    const list = await fetchPatientsOnce(user.id, userProfile.role);
    setPatients(list);
  }, [user, userProfile]);

  const redeemInvite = useCallback(async (code: string) => {
    if (!user) throw new Error("Non autenticato");
    const patientId = await redeemFamilyInvite(code);
    // Invalida la cache dei caregiver: il nuovo invito aggiunge una relazione
    invalidateCaregiverCaches(patientId);
    await refreshFollowedPatients();
    return patientId;
  }, [user, refreshFollowedPatients]);

  const createInvite = useCallback(
    async (patientId: string, ttlMinutes = 1440, maxUses = 1) => {
      return createFamilyInvite(patientId, ttlMinutes, maxUses);
    },
    [],
  );

  const unfollowPatient = useCallback(
    async (patientId: string) => {
      if (!user) return;
      await unfollowPatientDoc(user.id, patientId);
      // Invalida la cache: la relazione caregiver-paziente è cambiata
      invalidateCaregiverCaches(patientId);
      await refreshFollowedPatients();
    },
    [user, refreshFollowedPatients],
  );

  // -----------------------------------------------------------------
  // Auto-transizione a "dimenticata" (missed) — SOLO modalità locale/demo
  // -----------------------------------------------------------------
  // Ogni 30 secondi controlla le dosi passate: se sono trascorse
  // `timeoutMinutes` dall'orario programmato e la dose non è stata
  // confermata / saltata / già segnata come missed, crea l'evento
  // "missed" e la notifica di alert per i caregiver del paziente.
  //
  // Con un utente loggato questo lavoro è già fatto server-side da
  // `dose-scheduler` (edge function via pg_cron, ogni minuto): tenere
  // anche il watchdog client-side significava che OGNI tab/dispositivo
  // di ogni caregiver e paziente online rifaceva la stessa verifica in
  // parallelo, con scritture ridondanti verso `events` (mitigate solo da
  // ON CONFLICT DO NOTHING lato DB, ma la query di scrittura partiva
  // comunque). Per gli utenti loggati il tick esce subito. Resta attivo
  // solo per la modalità locale/demo (senza login, DB assente), dove non
  // c'è alcun cron server-side a fare da fallback.
  const missedProcessedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const tick = async () => {
      if (user) return; // affidato interamente a dose-scheduler lato server
      const now = Date.now();
      const activeTherapies = data.therapies.filter(
        (t) => t.active && !t.suspended,
      );
      for (const th of activeTherapies) {
        if (!th.times || th.times.length === 0) continue;
        // Solo dosi di oggi (evita di ri-processare storico vecchio)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const start = new Date(th.startDate + "T00:00:00");
        if (today < start) continue;
        if (th.endDate && new Date(th.endDate) < today) continue;
        // Rispetta la ricorrenza: la dose deve essere effettivamente
        // prevista OGGI, altrimenti non ha senso segnarla come dimenticata.
        const r = th.recurrence;
        const dow = today.getDay();
        let dueToday = false;
        switch (r.kind) {
          case "daily": dueToday = true; break;
          case "weekdays": dueToday = dow >= 1 && dow <= 5; break;
          case "weekend": dueToday = dow === 0 || dow === 6; break;
          case "every_x_days": {
            const diff = Math.floor((today.getTime() - start.getTime()) / 86400000);
            dueToday = r.x > 0 && diff % r.x === 0;
            break;
          }
          case "specific_days": dueToday = r.days.includes(dow); break;
        }
        if (!dueToday) continue;
        for (const time of th.times) {
          const [h, m] = time.split(":").map(Number);
          const scheduledAt = new Date(today);
          scheduledAt.setHours(h ?? 0, m ?? 0, 0, 0);
          const scheduledMs = scheduledAt.getTime();
          const timeoutMs = (th.timeoutMinutes ?? 10) * 60_000;
          if (now < scheduledMs + timeoutMs) continue;

          const dedupeKey = `${th.id}@${scheduledAt.toISOString()}@missed`;
          if (missedProcessedRef.current.has(dedupeKey)) continue;

          const existing = data.events.find(
            (e) =>
              e.therapyId === th.id &&
              Math.abs(new Date(e.scheduledAt).getTime() - scheduledMs) < 60_000,
          );
          if (
            existing?.status === "taken" ||
            existing?.status === "skipped" ||
            existing?.status === "missed"
          ) {
            missedProcessedRef.current.add(dedupeKey);
            continue;
          }

          const nowIso = new Date().toISOString();
          const scheduledIso = scheduledAt.toISOString();
          const missedEvent: MedicationEvent = existing
            ? {
                ...existing,
                status: "missed" as const,
                timeline: [
                  ...existing.timeline,
                  { at: nowIso, kind: "missed", message: "Dose non confermata entro il tempo massimo" },
                ],
              }
            : {
                id: `e_${th.id}_${scheduledMs}`,
                therapyId: th.id,
                patientId: th.patientId,
                scheduledAt: scheduledIso,
                status: "missed" as const,
                timeline: [
                  { at: scheduledIso, kind: "scheduled", message: "Dose programmata" },
                  { at: nowIso, kind: "missed", message: "Dose non confermata entro il tempo massimo" },
                ],
              };

          missedProcessedRef.current.add(dedupeKey);

          const patient = data.patients.find((p) => p.id === th.patientId);
          const hhmm = scheduledAt.toLocaleTimeString("it-IT", {
            hour: "2-digit", minute: "2-digit",
          });

          {
            // Solo modalità locale/demo (per utenti loggati il tick esce
            // subito in cima: vedi commento sopra la definizione dell'effect).
            setLocalData((d) => {
              const alreadyEvent = d.events.some(
                (e) =>
                  e.therapyId === th.id &&
                  Math.abs(new Date(e.scheduledAt).getTime() - scheduledMs) < 60_000 &&
                  e.status === "missed",
              );
              const nextEvents = alreadyEvent
                ? d.events
                : existing
                  ? d.events.map((e) => (e === existing ? missedEvent : e))
                  : [...d.events, missedEvent];
              const alreadyNotif = d.notifications.some(
                (n) => n.doseKey === `${th.id}@${scheduledIso}@missed@cg`,
              );
              const nextNotifications = alreadyNotif
                ? d.notifications
                : [
                    ...d.notifications,
                    {
                      id: `n_${th.id}_${scheduledMs}_missed_cg`,
                      createdAt: nowIso,
                      kind: "missed" as const,
                      patientId: th.patientId,
                      therapyId: th.id,
                      eventId: missedEvent.id,
                      doseKey: `${th.id}@${scheduledIso}@missed@cg`,
                      severity: "alert" as const,
                      title: `👨‍👩‍👧 ${patient?.name ?? "Paziente"} non ha preso ${th.name} (dimenticata)`,
                      message: `Dose delle ${hhmm} — segnata come dimenticata dopo il tempo massimo. Contatta il paziente e conferma la dose dalla pagina "Dose da confermare".`,
                      read: false,
                    },
                    {
                      id: `n_${th.id}_${scheduledMs}_missed_pt`,
                      createdAt: nowIso,
                      kind: "missed" as const,
                      patientId: th.patientId,
                      therapyId: th.id,
                      eventId: missedEvent.id,
                      doseKey: `${th.id}@${scheduledIso}@missed@patient`,
                      severity: "alert" as const,
                      title: `Cura dimenticata: ${th.name}`,
                      message: `La dose delle ${hhmm} è stata segnata come dimenticata. Probabilmente verrai contattato da un familiare.`,
                      read: false,
                    },
                  ];
              return { ...d, events: nextEvents, notifications: nextNotifications };
            });
          }
        }
      }
    };
    tick();
    const iv = setInterval(tick, 30_000);
    return () => clearInterval(iv);
  }, [user, data.therapies, data.events, data.patients]);

  const isPrimaryCaregiverOf = useCallback(
    (patientId: string): boolean => {
      if (!user) return false;
      const p = data.patients.find((x) => x.id === patientId);
      if (!p) return false;
      if (p.ownerUserId) return p.ownerUserId === user.id;
      return p.primaryCaregiverId === user.id;
    },
    [user, data.patients],
  );

  const isSecondaryCaregiverOf = useCallback(
    (patientId: string): boolean => {
      if (!user || userProfile?.role !== "caregiver") return false;
      const p = data.patients.find((x) => x.id === patientId);
      if (!p) return false;
      if (isPrimaryCaregiverOf(patientId)) return false;
      // caregiver linked (presente nella lista pazienti visibili) ma non primario
      return true;
    },
    [user, userProfile, data.patients, isPrimaryCaregiverOf],
  );

  const value = useMemo<Ctx>(
    () => ({
      data,
      user,
      userProfile,
      loadingAuth,
      redeemInvite,
      createInvite,
      unfollowPatient,
      setRole,
      setCurrentPatient,
      confirmDose,
      skipDose,
      snoozeDose,
      acknowledgeDose,
      addTherapy,
      updateTherapy,
      deleteTherapy,
      addPatient,
      deletePatient,
      markNotificationRead,
      markAllRead,
      resetDemoData,
      logout,
      isPrimaryCaregiverOf,
      isSecondaryCaregiverOf,
    }),
    [
      data,
      user,
      userProfile,
      loadingAuth,
      redeemInvite,
      createInvite,
      unfollowPatient,
      setRole,
      setCurrentPatient,
      confirmDose,
      skipDose,
      snoozeDose,
      acknowledgeDose,
      addTherapy,
      updateTherapy,
      deleteTherapy,
      addPatient,
      deletePatient,
      markNotificationRead,
      markAllRead,
      resetDemoData,
      logout,
      isPrimaryCaregiverOf,
      isSecondaryCaregiverOf,
    ]
  );


  return <FamilyMedContext.Provider value={value}>{children}</FamilyMedContext.Provider>;
}

export function useFamilyMed() {
  const ctx = useContext(FamilyMedContext);
  if (!ctx) throw new Error("useFamilyMed must be used within FamilyMedProvider");
  return ctx;
}