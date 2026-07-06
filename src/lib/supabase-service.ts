import { supabase } from "./supabase";
import {
  type Patient,
  type Caregiver,
  type Therapy,
  type MedicationEvent,
  type Notification,
} from "./mock-data";

/* =========================================================
   SAFE GUARD BASE
========================================================= */

const isReady = (id?: string) => !!supabase && !!id;

/* =========================================================
   PATIENTS
========================================================= */

export function subscribePatients(
  userId: string,
  role: string,
  onUpdate: (patients: Patient[]) => void
): () => void {
  if (!supabase) return () => {};
  if (!userId) return () => {};

  const fetchAndEmit = async () => {
    try {
      let query = supabase.from("patients").select("*");

      if (role === "caregiver") {
        const { data: relations, error } = await supabase
          .from("caregiver_patients")
          .select("patient_id")
          .eq("caregiver_id", userId);

        if (error) {
          console.error("caregiver relation error:", error);
          onUpdate([]);
          return;
        }

        const patientIds = relations?.map((r) => r.patient_id) || [];

        if (patientIds.length === 0) {
          onUpdate([]);
          return;
        }

        query = query.in("id", patientIds);
      } else if (role === "paziente") {
        query = query.eq("user_id", userId);
      }

      const { data, error } = await query;
      if (error) throw error;

      onUpdate(
        (data || []).map((p) => ({
          id: p.id,
          name: p.name,
          birthYear: p.birth_year,
          photo: p.photo,
          caregiverIds: [],
          userId: p.user_id,
        }))
      );
    } catch (err) {
      console.error("Errore fetch pazienti:", err);
      onUpdate([]);
    }
  };

  fetchAndEmit();

  const channel = supabase
    .channel("patients-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "patients" },
      () => fetchAndEmit()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/* =========================================================
   CAREGIVERS
========================================================= */

export function subscribeCaregivers(
  userId: string,
  role: string,
  onUpdate: (caregivers: Caregiver[]) => void
): () => void {
  if (!supabase) return () => {};
  if (!userId) return () => {};

  const fetchAndEmit = async () => {
    try {
      let query = supabase.from("caregivers").select("*");

      if (role === "paziente") {
        const { data: relations, error } = await supabase
          .from("caregiver_patients")
          .select("caregiver_id")
          .eq("patient_id", userId);

        if (error) {
          console.error(error);
          onUpdate([]);
          return;
        }

        const caregiverIds = relations?.map((r) => r.caregiver_id) || [];

        if (caregiverIds.length === 0) {
          onUpdate([]);
          return;
        }

        query = query.in("id", caregiverIds);
      } else if (role === "caregiver") {
        query = query.eq("id", userId);
      }

      const { data, error } = await query;
      if (error) throw error;

      onUpdate(
        (data || []).map((c) => ({
          id: c.id,
          name: c.name,
          relation: c.relation,
          photo: c.photo,
          patientIds: [],
          notify: c.notify,
        }))
      );
    } catch (err) {
      console.error("Errore fetch caregiver:", err);
      onUpdate([]);
    }
  };

  fetchAndEmit();

  const channel = supabase
    .channel("caregivers-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "caregivers" },
      () => fetchAndEmit()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/* =========================================================
   THERAPIES
========================================================= */

export function subscribeTherapies(
  patientId: string,
  onUpdate: (therapies: Therapy[]) => void
): () => void {
  if (!supabase) return () => {};
  if (!patientId) return () => {};

  const fetchAndEmit = async () => {
    try {
      const { data, error } = await supabase
        .from("therapies")
        .select("*")
        .eq("patient_id", patientId);

      if (error) throw error;

      onUpdate(
        (data || []).map((t) => ({
          id: t.id,
          patientId: t.patient_id,
          name: t.name,
          dosage: t.dosage,
          quantity: t.quantity,
          category: t.category,
          color: t.color,
          icon: t.icon,
          notes: t.notes,
          startDate: t.start_date,
          endDate: t.end_date,
          times: t.times,
          recurrence: t.recurrence,
          timeoutMinutes: t.timeout_minutes,
          reminderIntervals: t.reminder_intervals,
          packs: t.packs,
          pillsPerPack: t.pills_per_pack,
          pillsRemaining: t.pills_remaining,
          lowStockThreshold: t.low_stock_threshold,
          active: t.active,
          suspended: t.suspended,
          photoDrug: t.photo_drug,
          photoPackage: t.photo_package,
        }))
      );
    } catch (err) {
      console.error("Errore fetch terapie:", err);
      onUpdate([]);
    }
  };

  fetchAndEmit();

  const channel = supabase
    .channel(`therapies-${patientId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "therapies",
        filter: `patient_id=eq.${patientId}`,
      },
      () => fetchAndEmit()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/* =========================================================
   EVENTS
========================================================= */

export function subscribeEvents(
  patientId: string,
  onUpdate: (events: MedicationEvent[]) => void
): () => void {
  if (!supabase) return () => {};
  if (!patientId) return () => {};

  const fetchAndEmit = async () => {
    try {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("patient_id", patientId);

      if (error) throw error;

      onUpdate(
        (data || []).map((e) => ({
          id: e.id,
          therapyId: e.therapy_id,
          patientId: e.patient_id,
          scheduledAt: e.scheduled_at,
          status: e.status,
          confirmedAt: e.confirmed_at,
          confirmedBy: e.confirmed_by,
          note: e.note,
          timeline: e.timeline,
        }))
      );
    } catch (err) {
      console.error("Errore fetch eventi:", err);
      onUpdate([]);
    }
  };

  fetchAndEmit();

  const channel = supabase
    .channel(`events-${patientId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "events",
        filter: `patient_id=eq.${patientId}`,
      },
      () => fetchAndEmit()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/* =========================================================
   NOTIFICATIONS
========================================================= */

export function subscribeNotifications(
  userId: string,
  onUpdate: (notifications: Notification[]) => void
): () => void {
  if (!supabase) return () => {};
  if (!userId) return () => {};

  const fetchAndEmit = async () => {
    try {
      const { data: recipientRefs } = await supabase
        .from("notification_recipients")
        .select("notification_id")
        .eq("user_id", userId);

      const notificationIds = recipientRefs?.map((r) => r.notification_id) || [];

      if (notificationIds.length === 0) {
        onUpdate([]);
        return;
      }

      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .in("id", notificationIds);

      if (error) throw error;

      onUpdate(
        (data || []).map((n) => ({
          id: n.id,
          createdAt: n.created_at,
          patientId: n.patient_id,
          severity: n.severity,
          title: n.title,
          message: n.message,
          read: n.read,
        }))
      );
    } catch (err) {
      console.error("Errore fetch notifiche:", err);
      onUpdate([]);
    }
  };

  fetchAndEmit();

  const channel = supabase
    .channel(`notifications-${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notifications" },
      () => fetchAndEmit()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/* =========================================================
   WRITE OPS (UNCHANGED BUT SAFE)
========================================================= */

export async function saveCaregiverDoc(caregiver: Caregiver): Promise<void> {
  if (!supabase) throw new Error("Supabase non configurato");

  const { error } = await supabase.from("caregivers").upsert({
    id: caregiver.id,
    name: caregiver.name,
    relation: caregiver.relation,
    photo: caregiver.photo,
    notify: caregiver.notify,
  });

  if (error) throw error;
}

export async function deleteTherapyDoc(id: string): Promise<void> {
  if (!supabase) throw new Error("Supabase non configurato");

  const { error } = await supabase.from("therapies").delete().eq("id", id);

  if (error) throw error;
}