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
   CACHE UTILITIES
   TTL cache minimale per query stabili (caregiver_patients, caregivers).
   Invalidata automaticamente alla scadenza; nessuna dipendenza esterna.
========================================================= */

function makeTTLCache<K, V>(ttlMs: number) {
  const store = new Map<K, { value: V; expiresAt: number }>();
  return {
    get(key: K): V | undefined {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (Date.now() > entry.expiresAt) { store.delete(key); return undefined; }
      return entry.value;
    },
    set(key: K, value: V) {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
    delete(key: K) { store.delete(key); },
    clear() { store.clear(); },
  };
}

// 5 minuti — i caregiver collegati a un paziente cambiano raramente
const caregiverIdsCache = makeTTLCache<string, string[]>(5 * 60 * 1000);
const caregiverListCache = makeTTLCache<string, import('./mock-data').Patient[]>(5 * 60 * 1000);

/** Invalida le cache dei caregiver quando un invito viene accettato o revocato. */
export function invalidateCaregiverCaches(patientId?: string) {
  if (patientId) {
    caregiverIdsCache.delete(patientId);
    caregiverListCache.delete(patientId);
  } else {
    caregiverIdsCache.clear();
    caregiverListCache.clear();
  }
}

/* row mappers — usati sia dal fetch iniziale sia dai payload realtime */

function mapEventRow(e: any): MedicationEvent {
  return {
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
  };
}

function mapNotificationRow(n: any): Notification {
  return {
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
  };
}

function mapTherapyRow(t: any): Therapy {
  return {
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
  };
}

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
      let query = supabase.from("patients").select("id, name, birth_year, photo, user_id, owner_user_id, primary_caregiver_id");

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
          primaryCaregiverId: (p as any).primary_caregiver_id ?? null,
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
      let query = supabase.from("caregivers").select("id, name, relation, photo, notify");

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

  let cache: Therapy[] = [];
  let ready = false;

  const fetchAndEmit = async () => {
    try {
      const { data, error } = await supabase!
        .from("therapies")
        .select("id, patient_id, name, dosage, quantity, category, color, icon, notes, start_date, end_date, times, recurrence, timeout_minutes, snooze_minutes, post_reminder_minutes, reminder_intervals, packs, pills_per_pack, pills_remaining, low_stock_threshold, active, suspended, photo_drug, photo_package")
        .in("patient_id", ids);
      if (error) throw error;
      cache = (data || []).map(mapTherapyRow);
      ready = true;
      onUpdate(cache);
    } catch (err) {
      console.error("Errore fetch terapie:", err);
      onUpdate([]);
    }
  };

  fetchAndEmit();

  const channel = supabase
    .channel(`therapies-multi-${ids.join(",")}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "therapies" }, (payload) => {
      if (!ready) return;
      const t = payload.new as any;
      if (!ids.includes(t.patient_id)) return;
      cache = [...cache, mapTherapyRow(t)];
      onUpdate(cache);
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "therapies" }, (payload) => {
      if (!ready) return;
      const t = payload.new as any;
      if (!ids.includes(t.patient_id)) return;
      cache = cache.map((therapy) => (therapy.id === t.id ? mapTherapyRow(t) : therapy));
      onUpdate(cache);
    })
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "therapies" }, (payload) => {
      if (!ready) return;
      const id = (payload.old as any)?.id;
      if (!id) return;
      cache = cache.filter((therapy) => therapy.id !== id);
      onUpdate(cache);
    })
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
  const sinceMs = 90 * 24 * 60 * 60 * 1000;

  // Cache locale degli eventi: popolata dal fetch iniziale e poi
  // aggiornata riga-per-riga dai payload realtime — ZERO round-trip
  // aggiuntivi per conferme/snooze/salti di dose.
  let cache: MedicationEvent[] = [];
  let ready = false; // true dopo il primo fetch

  const fetchAndEmit = async () => {
    try {
      const since = new Date(Date.now() - sinceMs).toISOString();
      const { data, error } = await supabase!
        .from("events")
        .select("id, therapy_id, patient_id, scheduled_at, status, confirmed_at, confirmed_by, snoozed_until, note, timeline")
        .in("patient_id", ids)
        .gte("scheduled_at", since);
      if (error) throw error;
      cache = (data || []).map(mapEventRow);
      ready = true;
      onUpdate(cache);
    } catch (err) {
      console.error("Errore fetch eventi:", err);
      onUpdate([]);
    }
  };

  fetchAndEmit();

  const channel = supabase
    .channel(`events-multi-${ids.join(",")}`)
    // INSERT: aggiungi alla cache locale senza ri-scaricare tutto
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "events" }, (payload) => {
      if (!ready) return;
      const e = payload.new as any;
      if (!ids.includes(e.patient_id)) return;
      // Ignora eventi fuori dalla finestra temporale
      if (Date.now() - new Date(e.scheduled_at).getTime() > sinceMs) return;
      cache = [...cache, mapEventRow(e)];
      onUpdate(cache);
    })
    // UPDATE: aggiorna solo la riga cambiata (dose confermata, saltata, snoozata…)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "events" }, (payload) => {
      if (!ready) return;
      const e = payload.new as any;
      if (!ids.includes(e.patient_id)) return;
      cache = cache.map((ev) => (ev.id === e.id ? mapEventRow(e) : ev));
      onUpdate(cache);
    })
    // DELETE: rimuovi dalla cache locale
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "events" }, (payload) => {
      if (!ready) return;
      const id = (payload.old as any)?.id;
      if (!id) return;
      cache = cache.filter((ev) => ev.id !== id);
      onUpdate(cache);
    })
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

  const MAX = 100;
  const sinceMs = 30 * 24 * 60 * 60 * 1000;

  // Cache locale delle notifiche: aggiornata dal fetch iniziale e poi
  // dai payload realtime senza ri-scaricare tutta la lista ad ogni evento.
  let cache: Notification[] = [];
  let ready = false;

  const fetchAndEmit = async () => {
    try {
      // Sia paziente che caregiver vedono SOLO le notifiche a loro destinate.
      // Limite: ultimi 30 giorni, max 100 — sufficiente per l'UX.
      const notifSince = new Date(Date.now() - sinceMs).toISOString();
      const { data, error } = await supabase
        .from("notifications")
        .select("id, target_user_id, created_at, kind, patient_id, therapy_id, event_id, dose_key, severity, title, message, read")
        .eq("target_user_id", userId)
        .gte("created_at", notifSince)
        .order("created_at", { ascending: false })
        .limit(MAX);
      if (error) throw error;
      cache = (data || []).map(mapNotificationRow);
      ready = true;
      onUpdate(cache);
    } catch (err) {
      console.error("Errore fetch notifiche:", err);
      onUpdate([]);
    }
  };

  fetchAndEmit();

  const channel = supabase
    .channel(`notifications-${role}-${userId}`)
    // INSERT: nuova notifica (dose confermata, saltata, dimenticata…)
    // → prependi alla cache senza ri-scaricare tutto
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, (payload) => {
      if (!ready) return;
      const n = payload.new as any;
      if (n.target_user_id !== userId) return;
      // Fuori dalla finestra temporale? Ignora
      if (Date.now() - new Date(n.created_at).getTime() > sinceMs) return;
      cache = [mapNotificationRow(n), ...cache].slice(0, MAX);
      onUpdate(cache);
    })
    // UPDATE: cambio di stato "letta" → aggiorna solo quella riga
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications" }, (payload) => {
      if (!ready) return;
      const n = payload.new as any;
      if (n.target_user_id !== userId) return;
      cache = cache.map((notif) => (notif.id === n.id ? mapNotificationRow(n) : notif));
      onUpdate(cache);
    })
    // DELETE: rimuovi dalla cache
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "notifications" }, (payload) => {
      if (!ready) return;
      const id = (payload.old as any)?.id;
      if (!id) return;
      cache = cache.filter((n) => n.id !== id);
      onUpdate(cache);
    })
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

  const patientPayload = {
    id: patient.id,
    name: patient.name,
    photo: patient.photo || null,
    birth_year: patient.birthYear,
    user_id: patient.userId || null,
    created_at: new Date().toISOString(),
  };

  const { error: patientError } = await supabase
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

  if (patient.caregiverIds?.length) {
    const relationRows = patient.caregiverIds.map((caregiverId) => ({
      caregiver_id: caregiverId,
      patient_id: patient.id,
    }));

    const { error: relationError } = await supabase
      .from("caregiver_patients")
      .insert(relationRows);

    if (relationError) {
      console.error("[addPatientDoc] Errore salvataggio relazioni:", relationError);
      throw relationError;
    }
  }
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

/**
 * Marca come lette tutte le notifiche con gli id forniti in una singola
 * query UPDATE invece di N round-trip seriali (riduce l'egress PostgREST).
 */
export async function markAllNotificationsRead(ids: string[]): Promise<void> {
  if (!supabase || ids.length === 0) return;
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .in("id", ids);
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
  const { data, error } = await supabase.from("patients").select("id, name, birth_year, photo, user_id, owner_user_id, primary_caregiver_id");
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
    primaryCaregiverId: (p as any).primary_caregiver_id ?? null,
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
    .select("id, code, patient_id, created_by, expires_at, max_uses, uses, used_by, used_at, created_at")
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

export async function updateCaregiverRelationship(
  caregiverId: string,
  patientId: string,
  relationship: string,
): Promise<void> {
  if (!supabase) throw new Error("Supabase non configurato");
  const { error } = await supabase
    .from("caregiver_patients")
    .update({ relationship: relationship.trim() || null })
    .eq("caregiver_id", caregiverId)
    .eq("patient_id", patientId);
  if (error) throw error;

  // Invalida la cache locale dei caregiver per forzare il rinfresco
  invalidateCaregiverCaches(patientId);
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

export type PatientCaregiver = {
  id: string;
  name: string;
  relation: string | null;
  photo: string | null;
  relationship: string | null;
  linkedAt: string;
  isPrimary: boolean;
};

/**
 * Elenco dei caregiver attivi collegati a un paziente, con distinzione
 * primario (patients.primary_caregiver_id) vs secondario (tutti gli altri
 * collegati via codice invito).
 */
export async function listCaregiversForPatient(
  patientId: string,
  primaryCaregiverId?: string | null,
): Promise<PatientCaregiver[]> {
  if (!supabase) return [];

  // Cache 5 minuti: l'elenco dei caregiver cambia solo quando si accetta/revoca
  // un invito — eventi rari che invalidano esplicitamente la cache.
  const cacheKey = `${patientId}:${primaryCaregiverId ?? ""}`;
  const cached = caregiverListCache.get(cacheKey as any);
  if (cached) return cached as unknown as PatientCaregiver[];

  const { data: links, error: linksError } = await supabase
    .from("caregiver_patients")
    .select("caregiver_id, relationship, created_at")
    .eq("patient_id", patientId);
  if (linksError) {
    console.warn("[listCaregiversForPatient]", linksError.message);
    return [];
  }
  if (!links || links.length === 0) return [];

  const ids = links.map((l) => l.caregiver_id);
  const { data: caregivers, error: cgError } = await supabase
    .from("caregivers")
    .select("id, name, relation, photo")
    .in("id", ids);
  if (cgError) {
    console.warn("[listCaregiversForPatient]", cgError.message);
  }
  const byId = new Map((caregivers ?? []).map((c) => [c.id, c]));

  const result = links
    .map((l): PatientCaregiver => {
      const c = byId.get(l.caregiver_id);
      return {
        id: l.caregiver_id,
        name: c?.name?.trim() || "Caregiver",
        relation: c?.relation ?? null,
        photo: c?.photo ?? null,
        relationship: l.relationship,
        linkedAt: l.created_at,
        isPrimary: !!primaryCaregiverId && l.caregiver_id === primaryCaregiverId,
      };
    })
    .sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.name.localeCompare(b.name, "it");
    });

  caregiverListCache.set(cacheKey as any, result as any);
  return result;
}

export async function fetchCaregiverIdsForPatient(patientId: string): Promise<string[]> {
  if (!supabase) return [];

  // Cache 5 minuti: chiamata ogni 30s nel loop auto-missed per ogni terapia
  // dimenticata — senza cache genera N query per tick.
  const cached = caregiverIdsCache.get(patientId);
  if (cached) return cached;

  const { data, error } = await supabase
    .from("caregiver_patients")
    .select("caregiver_id")
    .eq("patient_id", patientId);
  if (error) {
    console.warn("[fetchCaregiverIdsForPatient]", error.message);
    return [];
  }
  const ids = (data ?? []).map((r) => r.caregiver_id);
  caregiverIdsCache.set(patientId, ids);
  return ids;
}