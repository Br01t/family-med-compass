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
          ownerUserId: (p as any).owner_user_id,
          primaryCaregiverId: (p as any).primary_caregiver_id,
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
   THERAPIES (single-patient wrapper defined below)
========================================================= */


/* =========================================================
   THERAPIES (multi-patient)
========================================================= */

export function subscribeTherapiesForPatients(
  patientIds: string[],
  onUpdate: (therapies: Therapy[]) => void,
): () => void {
  if (!supabase) return () => {};
  if (!patientIds || patientIds.length === 0) {
    onUpdate([]);
    return () => {};
  }
  const ids = [...patientIds].sort();

  const fetchAndEmit = async () => {
    try {
      const { data, error } = await supabase!
        .from("therapies")
        .select("*")
        .in("patient_id", ids);
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
          snoozeMinutes: t.snooze_minutes,
          postReminderMinutes: t.post_reminder_minutes,
          reminderIntervals: Array.isArray(t.reminder_intervals) && t.reminder_intervals.length > 0
            ? (t.reminder_intervals as unknown[])
                .map((value) => Math.abs(Number(value)))
                .filter((value) => value > 0)
            : [10],
          packs: t.packs,
          pillsPerPack: t.pills_per_pack,
          pillsRemaining: t.pills_remaining,
          lowStockThreshold: t.low_stock_threshold,
          active: t.active,
          suspended: t.suspended,
          photoDrug: t.photo_drug,
          photoPackage: t.photo_package,
        })),
      );
    } catch (err) {
      console.error("Errore fetch terapie:", err);
      onUpdate([]);
    }
  };

  fetchAndEmit();

  const channel = supabase
    .channel(`therapies-multi-${ids.join(",")}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "therapies" },
      (payload) => {
        const pid = (payload.new as any)?.patient_id ?? (payload.old as any)?.patient_id;
        if (!pid || ids.includes(pid)) fetchAndEmit();
      },
    )
    .subscribe();

  return () => { supabase!.removeChannel(channel); };
}

export function subscribeTherapies(
  patientId: string,
  onUpdate: (therapies: Therapy[]) => void,
): () => void {
  return subscribeTherapiesForPatients(patientId ? [patientId] : [], onUpdate);
}

/* =========================================================
   EVENTS (multi-patient)
========================================================= */

export function subscribeEventsForPatients(
  patientIds: string[],
  onUpdate: (events: MedicationEvent[]) => void,
): () => void {
  if (!supabase) return () => {};
  if (!patientIds || patientIds.length === 0) {
    onUpdate([]);
    return () => {};
  }
  const ids = [...patientIds].sort();

  const fetchAndEmit = async () => {
    try {
      const { data, error } = await supabase!
        .from("events")
        .select("*")
        .in("patient_id", ids);
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
          snoozedUntil: e.snoozed_until,
          note: e.note,
          timeline: e.timeline,
        })),
      );
    } catch (err) {
      console.error("Errore fetch eventi:", err);
      onUpdate([]);
    }
  };

  fetchAndEmit();

  const channel = supabase
    .channel(`events-multi-${ids.join(",")}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "events" },
      (payload) => {
        const pid = (payload.new as any)?.patient_id ?? (payload.old as any)?.patient_id;
        if (!pid || ids.includes(pid)) fetchAndEmit();
      },
    )
    .subscribe();

  return () => { supabase!.removeChannel(channel); };
}

export function subscribeEvents(
  patientId: string,
  onUpdate: (events: MedicationEvent[]) => void,
): () => void {
  return subscribeEventsForPatients(patientId ? [patientId] : [], onUpdate);
}


/* =========================================================
   NOTIFICATIONS
========================================================= */

export function subscribeNotifications(
  userId: string,
  onUpdate: (notifications: Notification[]) => void,
  role: "paziente" | "caregiver" = "paziente"
): () => void {
  if (!supabase) return () => {};
  if (!userId) return () => {};

  const fetchAndEmit = async () => {
    try {
      // Sia paziente che caregiver vedono SOLO le notifiche a loro destinate
      // (target_user_id = userId). Le policy RLS permetterebbero al caregiver
      // di vedere anche quelle destinate al paziente, ma le mostreremmo
      // duplicate — la notifica del paziente ("Hai rimandato") e quella
      // del caregiver ("test1 ha rimandato") si riferiscono alla stessa dose.
      const query = supabase
        .from("notifications")
        .select("*")
        .eq("target_user_id", userId)
        .order("created_at", { ascending: false });

      const { data, error } = await query;
      if (error) throw error;

      onUpdate(
        (data || []).map((n) => ({
          id: n.id,
          targetUserId: n.target_user_id,
          createdAt: n.created_at,
          kind: n.kind ?? "info",
          patientId: n.patient_id,
          therapyId: n.therapy_id,
          eventId: n.event_id,
          doseKey: n.dose_key,
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

  // Realtime: qualunque INSERT/UPDATE/DELETE sulla tabella notifications
  // filtrata dalla RLS scatena un refetch. In questo modo lo stato
  // "letta/non letta" si sincronizza istantaneamente su tutti i dispositivi
  // dello stesso utente e tra caregiver ↔ paziente per le notifiche condivise.
  const channel = supabase
    .channel(`notifications-${role}-${userId}`)
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

  const { error } = await supabase.from("therapies").upsert(toTherapyPayload(therapy));

  if (error) throw error;
}

export async function createTherapyDoc(therapy: Therapy): Promise<void> {
  if (!supabase) throw new Error("Supabase non configurato");

  const { error } = await supabase.from("therapies").insert(toTherapyPayload(therapy));

  if (error) throw error;
}

function toTherapyPayload(therapy: Therapy) {
  return {
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
    snooze_minutes: therapy.snoozeMinutes ?? 10,
    post_reminder_minutes: therapy.postReminderMinutes ?? 5,
    reminder_intervals: therapy.reminderIntervals,
    packs: therapy.packs,
    pills_per_pack: therapy.pillsPerPack,
    pills_remaining: therapy.pillsRemaining,
    low_stock_threshold: therapy.lowStockThreshold,
    active: therapy.active,
    suspended: therapy.suspended,
    photo_drug: therapy.photoDrug,
    photo_package: therapy.photoPackage,
  };
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
    snoozed_until: event.snoozedUntil,
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
   FAMILY LINKING (invito-based)
========================================================= */

/**
 * Con l'isolamento per famiglia, la lista pubblica di pazienti non è più
 * accessibile: RLS blocca ogni riga a cui l'utente non è collegato.
 * Manteniamo la firma per compatibilità: ora ritorna solo i pazienti già
 * visibili al chiamante (equivalente a `data.patients`).
 */
export async function fetchAllPatients(): Promise<Patient[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("patients").select("*");
  if (error) {
    console.warn("fetchAllPatients:", error.message);
    return [];
  }
  return (data || []).map((p) => ({
    id: p.id,
    name: p.name,
    birthYear: p.birth_year,
    photo: p.photo,
    caregiverIds: [],
    userId: p.user_id,
    ownerUserId: (p as any).owner_user_id,
    primaryCaregiverId: (p as any).primary_caregiver_id,
  }));
}

export type FamilyInvite = {
  id: string;
  code: string;
  patientId: string;
  createdBy: string;
  expiresAt: string;
  maxUses: number;
  uses: number;
  usedBy: string | null;
  usedAt: string | null;
  createdAt: string;
};

function mapInvite(row: any): FamilyInvite {
  return {
    id: row.id,
    code: row.code,
    patientId: row.patient_id,
    createdBy: row.created_by,
    expiresAt: row.expires_at,
    maxUses: row.max_uses,
    uses: row.uses,
    usedBy: row.used_by,
    usedAt: row.used_at,
    createdAt: row.created_at,
  };
}

export async function createFamilyInvite(
  patientId: string,
  ttlMinutes = 1440,
  maxUses = 1,
): Promise<FamilyInvite> {
  if (!supabase) throw new Error("Supabase non configurato");
  const { data, error } = await supabase.rpc("create_family_invite", {
    _patient_id: patientId,
    _ttl_minutes: ttlMinutes,
    _max_uses: maxUses,
  });
  if (error) throw error;
  return mapInvite(data);
}

export async function redeemFamilyInvite(code: string): Promise<string> {
  if (!supabase) throw new Error("Supabase non configurato");
  const { data, error } = await supabase.rpc("redeem_family_invite", {
    _code: code.trim().toUpperCase(),
  });
  if (error) throw error;
  return data as string;
}

export async function listFamilyInvites(patientId: string): Promise<FamilyInvite[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("family_invites")
    .select("*")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("listFamilyInvites:", error.message);
    return [];
  }
  return (data || []).map(mapInvite);
}

export async function revokeFamilyInvite(id: string): Promise<void> {
  if (!supabase) throw new Error("Supabase non configurato");
  const { error } = await supabase.from("family_invites").delete().eq("id", id);
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


/* =========================================================
   INSERT NOTIFICATION (client-side, per notificare caregiver)
========================================================= */

export async function insertNotificationDoc(input: {
  targetUserId: string;
  kind: string;
  severity: "info" | "warning" | "alert";
  title: string;
  message: string;
  patientId?: string;
  therapyId?: string;
  eventId?: string;
  doseKey?: string;
}): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("notifications").insert({
    id: crypto.randomUUID(),
    target_user_id: input.targetUserId,
    kind: input.kind,
    severity: input.severity,
    title: input.title,
    message: input.message,
    patient_id: input.patientId,
    therapy_id: input.therapyId,
    event_id: input.eventId,
    dose_key: input.doseKey,
  });
  if (error && error.code !== "23505") {
    console.warn("[insertNotificationDoc]", error.message);
  }
}

export async function fetchCaregiverIdsForPatient(patientId: string): Promise<string[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("caregiver_patients")
    .select("caregiver_id")
    .eq("patient_id", patientId);
  if (error) {
    console.warn("[fetchCaregiverIdsForPatient]", error.message);
    return [];
  }
  return (data ?? []).map((r) => r.caregiver_id);
}
