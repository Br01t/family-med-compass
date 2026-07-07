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
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("target_user_id", userId)
        .order("created_at", { ascending: false });

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

export async function addPatientDoc(patient: Patient): Promise<void> {
  if (!supabase) throw new Error("Supabase non configurato");

  console.log("[addPatientDoc] Tentativo salvataggio paziente:", {
    id: patient.id,
    name: patient.name,
    userId: patient.userId,
    caregiverIds: patient.caregiverIds,
  });

  const patientPayload = {
    id: patient.id,
    name: patient.name,
    photo: patient.photo || null,
    birth_year: patient.birthYear,
    user_id: patient.userId || null,
    created_at: new Date().toISOString(),
  };

  console.log("[addPatientDoc] Payload paziente:", patientPayload);

  const { error: patientError, data: patientData } = await supabase
    .from("patients")
    .insert(patientPayload);

  if (patientError) {
    // Se il record esiste già (conflict su PK), prova con update
    if (patientError.code === "23505") {
      const { error: updateError } = await supabase
        .from("patients")
        .update({ name: patientPayload.name, user_id: patientPayload.user_id })
        .eq("id", patientPayload.id);
      if (updateError) {
        console.error("[addPatientDoc] Errore update paziente:", updateError);
        throw updateError;
      }
    } else {
      console.error("[addPatientDoc] Errore salvataggio paziente:", patientError);
      throw patientError;
    }
  }

  console.log("[addPatientDoc] Paziente salvato con successo:", patientData);

  if (patient.caregiverIds?.length) {
    const relationRows = patient.caregiverIds.map((caregiverId) => ({
      caregiver_id: caregiverId,
      patient_id: patient.id,
    }));

    console.log("[addPatientDoc] Salvataggio relazioni caregiver-paziente:", relationRows);

    const { error: relationError, data: relationData } = await supabase
      .from("caregiver_patients")
      .insert(relationRows);

    if (relationError) {
      console.error("[addPatientDoc] Errore salvataggio relazioni:", relationError);
      throw relationError;
    }

    console.log("[addPatientDoc] Relazioni salvate con successo:", relationData);
  }

  console.log("[addPatientDoc] Paziente completamente salvato");
}

export async function deletePatientDoc(id: string): Promise<void> {
  if (!supabase) throw new Error("Supabase non configurato");

  const { error } = await supabase.from("patients").delete().eq("id", id);

  if (error) throw error;
}

export async function saveTherapyDoc(therapy: Therapy): Promise<void> {
  if (!supabase) throw new Error("Supabase non configurato");

  const { error } = await supabase.from("therapies").upsert({
    id: therapy.id,
    patient_id: therapy.patientId,
    name: therapy.name,
    dosage: therapy.dosage,
    quantity: therapy.quantity,
    category: therapy.category,
    color: therapy.color,
    icon: therapy.icon,
    notes: therapy.notes,
    start_date: therapy.startDate,
    end_date: therapy.endDate,
    times: therapy.times,
    recurrence: therapy.recurrence,
    timeout_minutes: therapy.timeoutMinutes,
    reminder_intervals: therapy.reminderIntervals,
    packs: therapy.packs,
    pills_per_pack: therapy.pillsPerPack,
    pills_remaining: therapy.pillsRemaining,
    low_stock_threshold: therapy.lowStockThreshold,
    active: therapy.active,
    suspended: therapy.suspended,
    photo_drug: therapy.photoDrug,
    photo_package: therapy.photoPackage,
  });

  if (error) throw error;
}

export async function saveEventDoc(event: MedicationEvent): Promise<void> {
  if (!supabase) throw new Error("Supabase non configurato");

  const { error } = await supabase.from("events").upsert({
    id: event.id,
    therapy_id: event.therapyId,
    patient_id: event.patientId,
    scheduled_at: event.scheduledAt,
    status: event.status,
    confirmed_at: event.confirmedAt,
    confirmed_by: event.confirmedBy,
    note: event.note,
    timeline: event.timeline,
  });

  if (error) throw error;
}

export async function updateNotificationReadState(id: string, read: boolean): Promise<void> {
  if (!supabase) throw new Error("Supabase non configurato");

  const { error } = await supabase.from("notifications").update({ read }).eq("id", id);

  if (error) throw error;
}

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

/* =========================================================
   OPEN PATIENT LIST + FOLLOW / UNFOLLOW
========================================================= */

export async function fetchAllPatients(): Promise<Patient[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("patients")
    .select("*");
  if (error) {
    console.error("fetchAllPatients:", error);
    return [];
  }
  return (data || []).map((p) => ({
    id: p.id,
    name: p.name,
    birthYear: p.birth_year,
    photo: p.photo,
    caregiverIds: [],
    userId: p.user_id,
  }));
}

export async function followPatient(caregiverId: string, patientId: string): Promise<void> {
  if (!supabase) throw new Error("Supabase non configurato");
  const { error } = await supabase
    .from("caregiver_patients")
    .upsert(
      { caregiver_id: caregiverId, patient_id: patientId },
      { onConflict: "caregiver_id,patient_id" },
    );
  if (error) throw error;
}

export async function unfollowPatient(caregiverId: string, patientId: string): Promise<void> {
  if (!supabase) throw new Error("Supabase non configurato");
  const { error } = await supabase
    .from("caregiver_patients")
    .delete()
    .eq("caregiver_id", caregiverId)
    .eq("patient_id", patientId);
  if (error) throw error;
}
