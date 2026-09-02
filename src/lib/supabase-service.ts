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

// 60 secondi — dati della pagina "Gruppo di cura" (membri+inviti+audit).
// TTL più corto degli altri perché include gli inviti attivi (hanno una
// scadenza in minuti/ore) e l'audit log, entrambi più "vivi" della sola
// lista membri.
const familyGroupCache = makeTTLCache<string, unknown>(60 * 1000);

/** Invalida le cache dei caregiver quando un invito viene accettato o revocato. */
export function invalidateCaregiverCaches(patientId?: string) {
  if (patientId) {
    caregiverIdsCache.delete(patientId);
    caregiverListCache.delete(patientId);
    familyGroupCache.delete(patientId);
  } else {
    caregiverIdsCache.clear();
    caregiverListCache.clear();
    familyGroupCache.clear();
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

/**
 * Fetch one-shot dei pazienti visibili all'utente usando la RPC get_my_patients().
 * Sostituisce il pattern a 2 query (caregiver_patients + patients) con 1 sola chiamata.
 * La RPC internamente fa un JOIN e rispetta la RLS tramite SECURITY DEFINER.
 */
export async function fetchPatientsOnce(userId: string, role: string): Promise<Patient[]> {
  if (!supabase || !userId) return [];
  try {
    const { data, error } = await supabase.rpc("get_my_patients");
    if (error) {
      // Fallback compatibile se la RPC non è ancora stata deployata
      if (error.code === "PGRST202" || error.message?.includes("does not exist")) {
        console.warn("[supabase-service] get_my_patients RPC non trovata, uso fallback 2-query.");
        return fetchPatientsOnceFallback(userId, role);
      }
      throw error;
    }
    return (data || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      birthYear: p.birth_year,
      photo: p.photo,
      caregiverIds: [],
      userId: p.user_id,
      ownerUserId: p.owner_user_id ?? null,
      primaryCaregiverId: p.primary_caregiver_id ?? null,
    }));
  } catch (err) {
    console.error("Errore fetch pazienti:", err);
    return [];
  }
}

/** Fallback a 2 query separate — usato se la RPC non è ancora stata deployata. */
async function fetchPatientsOnceFallback(userId: string, role: string): Promise<Patient[]> {
  try {
    let query = supabase!.from("patients").select("id, name, birth_year, photo, user_id, owner_user_id, primary_caregiver_id");

    if (role === "caregiver") {
      const { data: relations, error } = await supabase!
        .from("caregiver_patients")
        .select("patient_id")
        .eq("caregiver_id", userId);

      if (error) { console.error("caregiver relation error:", error); return []; }
      const patientIds = relations?.map((r) => r.patient_id) || [];
      if (patientIds.length === 0) return [];
      query = query.in("id", patientIds);
    } else if (role === "paziente") {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;
    if (error) throw error;
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
  } catch (err) {
    console.error("Errore fetch pazienti (fallback):", err);
    return [];
  }
}

/**
 * Wrapper "subscribe"-like mantenuto per compatibilità con il chiamante:
 * esegue un solo fetch al mount e ritorna un unsubscribe no-op. Prima
 * apriva anche un canale realtime su `patients`, ma la tabella non è più
 * nella publication `supabase_realtime` quindi quel canale non riceveva
 * mai eventi — era solo una connessione websocket morta.
 */
export function subscribePatients(
  userId: string,
  role: string,
  onUpdate: (patients: Patient[]) => void
): () => void {
  if (!supabase || !userId) return () => {};
  fetchPatientsOnce(userId, role).then(onUpdate);
  return () => {};
}

/* =========================================================
   CAREGIVERS
========================================================= */

/**
 * Fetch one-shot dei caregiver visibili all'utente usando la RPC get_my_caregivers().
 * Sostituisce il pattern a 2 query con 1 sola chiamata.
 */
export async function fetchCaregiversOnce(userId: string, role: string): Promise<Caregiver[]> {
  if (!supabase || !userId) return [];
  try {
    const { data, error } = await supabase.rpc("get_my_caregivers");
    if (error) {
      // Fallback se la RPC non è ancora stata deployata
      if (error.code === "PGRST202" || error.message?.includes("does not exist")) {
        console.warn("[supabase-service] get_my_caregivers RPC non trovata, uso fallback 2-query.");
        return fetchCaregiversOnceFallback(userId, role);
      }
      throw error;
    }
    return (data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      relation: c.relation,
      photo: c.photo,
      patientIds: [],
      notify: c.notify,
    }));
  } catch (err) {
    console.error("Errore fetch caregiver:", err);
    return [];
  }
}

/** Fallback a 2 query separate — usato se la RPC non è ancora stata deployata. */
async function fetchCaregiversOnceFallback(userId: string, role: string): Promise<Caregiver[]> {
  try {
    let query = supabase!.from("caregivers").select("id, name, relation, photo, notify");

    if (role === "paziente") {
      const { data: relations, error } = await supabase!
        .from("caregiver_patients")
        .select("caregiver_id")
        .eq("patient_id", userId);
      if (error) { console.error(error); return []; }
      const caregiverIds = relations?.map((r) => r.caregiver_id) || [];
      if (caregiverIds.length === 0) return [];
      query = query.in("id", caregiverIds);
    } else if (role === "caregiver") {
      query = query.eq("id", userId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map((c) => ({
      id: c.id,
      name: c.name,
      relation: c.relation,
      photo: c.photo,
      patientIds: [],
      notify: c.notify,
    }));
  } catch (err) {
    console.error("Errore fetch caregiver (fallback):", err);
    return [];
  }
}

/**
 * Wrapper "subscribe"-like mantenuto per compatibilità: un solo fetch al
 * mount, unsubscribe no-op (vedi nota su subscribePatients).
 */
export function subscribeCaregivers(
  userId: string,
  role: string,
  onUpdate: (caregivers: Caregiver[]) => void
): () => void {
  if (!supabase || !userId) return () => {};
  fetchCaregiversOnce(userId, role).then(onUpdate);
  return () => {};
}

/* =========================================================
   THERAPIES (single-patient wrapper defined below)
========================================================= */


/* =========================================================
   THERAPIES (multi-patient)
========================================================= */

export async function fetchTherapiesOnce(patientIds: string[]): Promise<Therapy[]> {
  if (!supabase || !patientIds || patientIds.length === 0) return [];
  try {
    const { data, error } = await supabase
      .from("therapies")
      .select("id, patient_id, name, dosage, quantity, category, color, icon, notes, start_date, end_date, times, recurrence, timeout_minutes, snooze_minutes, post_reminder_minutes, reminder_intervals, packs, pills_per_pack, pills_remaining, low_stock_threshold, active, suspended, photo_drug, photo_package")
      .in("patient_id", patientIds);
    if (error) throw error;
    return (data || []).map(mapTherapyRow);
  } catch (err) {
    console.error("Errore fetch terapie:", err);
    return [];
  }
}

/**
 * Wrapper "subscribe"-like mantenuto per compatibilità: un solo fetch al
 * mount, unsubscribe no-op. `therapies` non è più nella publication
 * `supabase_realtime` per ridurre l'egress; le mutazioni locali aggiornano
 * direttamente lo stato React via store.
 */
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
  fetchTherapiesOnce(ids).then(onUpdate);
  return () => {};
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
  // Finestra ridotta a 9 giorni: basta per l'aderenza a 7gg mostrata
  // ovunque nell'app. I periodi più lunghi (30/90gg) non servono al 95%
  // delle sessioni — vengono caricati a parte, solo quando l'utente apre
  // "Storico & Report" e solo per il paziente selezionato, tramite
  // fetchEventsForPatientRange (vedi sotto).
  const sinceMs = 9 * 24 * 60 * 60 * 1000;

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

  const filter = ids.length === 1 ? `patient_id=eq.${ids[0]}` : `patient_id=in.(${ids.join(",")})`;

  const channel = supabase
    .channel(`events-multi-${ids.join(",")}`)
    // INSERT: aggiungi alla cache locale senza ri-scaricare tutto
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "events", filter }, (payload) => {
      if (!ready) return;
      const e = payload.new as any;
      if (!ids.includes(e.patient_id)) return;
      // Ignora eventi fuori dalla finestra temporale
      if (Date.now() - new Date(e.scheduled_at).getTime() > sinceMs) return;
      cache = [...cache, mapEventRow(e)];
      onUpdate(cache);
    })
    // UPDATE: aggiorna solo la riga cambiata (dose confermata, saltata, snoozata…)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "events", filter }, (payload) => {
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

/**
 * Fetch one-shot degli eventi di UN SOLO paziente su una finestra
 * arbitraria (es. 30 o 90 giorni). Usata solo da "Storico & Report",
 * solo quando la pagina è montata e solo per il paziente selezionato —
 * a differenza della finestra globale (9gg, tutti i pazienti seguiti)
 * usata dal resto dell'app. Nessuna subscription realtime: è uno storico,
 * non ha bisogno di aggiornamenti live.
 */
export async function fetchEventsForPatientRange(
  patientId: string,
  days: number,
): Promise<MedicationEvent[]> {
  if (!supabase || !patientId) return [];
  try {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("events")
      .select("id, therapy_id, patient_id, scheduled_at, status, confirmed_at, confirmed_by, snoozed_until, note, timeline")
      .eq("patient_id", patientId)
      .gte("scheduled_at", since);
    if (error) throw error;
    return (data || []).map(mapEventRow);
  } catch (err) {
    console.error("Errore fetch eventi storico:", err);
    return [];
  }
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

  const filter = `target_user_id=eq.${userId}`;

  const channel = supabase
    .channel(`notifications-${role}-${userId}`)
    // INSERT: nuova notifica (dose confermata, saltata, dimenticata…)
    // → prependi alla cache senza ri-scaricare tutto
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter }, (payload) => {
      if (!ready) return;
      const n = payload.new as any;
      if (n.target_user_id !== userId) return;
      // Fuori dalla finestra temporale? Ignora
      if (Date.now() - new Date(n.created_at).getTime() > sinceMs) return;
      cache = [mapNotificationRow(n), ...cache].slice(0, MAX);
      onUpdate(cache);
    })
    // UPDATE: cambio di stato "letta" → aggiorna solo quella riga
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter }, (payload) => {
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
   CAREGIVER DASHBOARD STATS (materialized view)
========================================================= */

export type CaregiverDashboardStats = {
  patientsCount: number;
  activeAlerts: number;
  lowStockCount: number;
  lowStockNames: string[];
  adherence7d: number;
  refreshedAt: string | null;
};

// Cache 24 ore: le statistiche della vista materializzata cambiano solo col cron giornaliero
// o quando il caregiver clicca esplicitamente "Aggiorna" (che invalida questa cache).
const caregiverStatsCache = makeTTLCache<string, CaregiverDashboardStats>(24 * 60 * 60 * 1000);

export async function fetchCaregiverDashboardStats(): Promise<CaregiverDashboardStats> {
  const empty: CaregiverDashboardStats = {
    patientsCount: 0,
    activeAlerts: 0,
    lowStockCount: 0,
    lowStockNames: [],
    adherence7d: 100,
    refreshedAt: null,
  };
  if (!supabase) return empty;

  const cached = caregiverStatsCache.get("my_stats");
  if (cached) return cached;

  const { data, error } = await supabase.rpc("get_my_caregiver_stats");
  if (error) {
    console.error("get_my_caregiver_stats:", error);
    return empty;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return empty;
  const result: CaregiverDashboardStats = {
    patientsCount: row.patients_count ?? 0,
    activeAlerts: row.active_alerts ?? 0,
    lowStockCount: row.low_stock_count ?? 0,
    lowStockNames: row.low_stock_names ?? [],
    adherence7d: row.adherence_7d ?? 100,
    refreshedAt: row.refreshed_at ?? null,
  };
  caregiverStatsCache.set("my_stats", result);
  return result;
}

export async function refreshMyCaregiverStats(): Promise<boolean> {
  if (!supabase) return false;
  caregiverStatsCache.delete("my_stats");
  const { error } = await supabase.rpc("refresh_my_caregiver_stats");
  if (error) {
    console.error("refresh_my_caregiver_stats:", error);
    return false;
  }
  return true;
}

/* =========================================================
   NOTIFICATIONS — paginated fetch (server-side)
========================================================= */

export async function fetchNotificationsPage(
  userId: string,
  page: number,
  pageSize: number,
  opts?: { patientId?: string | null },
): Promise<{ items: Notification[]; total: number }> {
  if (!supabase || !userId) return { items: [], total: 0 };
  const from = page * pageSize;
  const to = from + pageSize - 1;
  let q = supabase
    .from("notifications")
    .select(
      "id, target_user_id, created_at, kind, patient_id, therapy_id, event_id, dose_key, severity, title, message, read",
      { count: "exact" },
    )
    .eq("target_user_id", userId);
  if (opts?.patientId) q = q.eq("patient_id", opts.patientId);
  const { data, error, count } = await q
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) {
    console.error("fetchNotificationsPage:", error);
    return { items: [], total: 0 };
  }
  return {
    items: (data || []).map(mapNotificationRow),
    total: count ?? 0,
  };
}


/* =========================================================
   WRITE OPS (UNCHANGED BUT SAFE)
========================================================= */

/**
 * Registra la dichiarazione con cui un caregiver afferma di avere titolo
 * (genitore, tutore legale, o indicazione diretta dell'interessato) per
 * inserire e trattare i dati sanitari del paziente appena creato.
 *
 * Richiede MIGRATION_consenso_autorizzazione_caregiver.sql applicata.
 * Non blocca la creazione del paziente se fallisce: chi la invoca
 * dovrebbe già gestire l'errore senza interrompere il flusso (vedi
 * AddPatientDialog).
 */
export async function recordCaregiverAuthorization(patientId: string): Promise<void> {
  if (!supabase) throw new Error("Supabase non configurato");

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw userError ?? new Error("Utente non autenticato");

  const { error } = await supabase.from("user_consents").insert({
    user_id: userData.user.id,
    patient_id: patientId,
    kind: "caregiver_authorization",
    granted: true,
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
  });

  if (error) throw error;
}

/**
 * Storico di aderenza mensile permanente per un paziente (punto 10 audit,
 * Opzione B): righe calcolate dal cron `adherence-monthly-rollup` prima
 * che il dettaglio giornaliero in `events` venga cancellato a 180gg.
 * A differenza di fetchEventsForPatientRange, questi dati non scadono mai.
 *
 * Richiede MIGRATION_adherence_monthly_rollup.sql applicata.
 */
export type MonthlyAdherence = {
  therapy_id: string;
  therapy_name: string;
  year: number;
  month: number;
  doses_scheduled: number;
  doses_taken: number;
  doses_missed: number;
  doses_skipped: number;
  adherence_pct: number | null;
};

export async function fetchPatientAdherenceHistory(
  patientId: string,
): Promise<MonthlyAdherence[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("adherence_monthly")
    .select("therapy_id, therapy_name, year, month, doses_scheduled, doses_taken, doses_missed, doses_skipped, adherence_pct")
    .eq("patient_id", patientId)
    .order("year", { ascending: false })
    .order("month", { ascending: false });
  if (error) throw error;
  return (data ?? []) as MonthlyAdherence[];
}

export async function addPatientDoc(patient: Patient): Promise<void> {
  if (!supabase) throw new Error("Supabase non configurato");

  const patientPayload = {
    id: patient.id,
    name: patient.name,
    photo: patient.photo || null,
    birth_year: patient.birthYear,
    user_id: patient.userId || null,
    owner_user_id: patient.ownerUserId || null,
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
  invalidateCaregiverCaches(patientId);
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
  // Non conosciamo il patientId qui: pulizia completa della cache gruppo di
  // cura. Costo trascurabile, la revoca è un'azione rara.
  invalidateCaregiverCaches();
}

/* =========================================================
   AUDIT LOG (GDPR — art. 5.2 accountability / art. 15 diritto di accesso)
   Vedi migration 20260719120000_gdpr_audit_log.sql
========================================================= */

export interface AuditLogEntry {
  id: string;
  patientId: string | null;
  tableName: string;
  recordId: string;
  action: string;
  actorId: string | null;
  actorName: string | null;
  summary: string;
  changedFields: string[] | null;
  detail: Record<string, unknown> | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

function mapAuditEntry(row: any): AuditLogEntry {
  return {
    id: row.id,
    patientId: row.patient_id,
    tableName: row.table_name ?? row.entity_type ?? "",
    recordId: row.record_id ?? row.entity_id ?? "",
    action: row.action,
    actorId: row.actor_id,
    actorName: row.actor_name ?? null,
    summary: row.summary ?? "",
    changedFields: row.changed_fields ?? null,
    detail: row.detail ?? null,
    meta: row.meta ?? null,
    createdAt: row.created_at,
  };
}


// Dedup client-side allineato al DB: una sola registrazione di accesso per
// paziente ogni 24h. Evita del tutto la round-trip quando non serve (0 egress).
// Lo stesso guard esiste lato DB (log_patient_view) come rete di sicurezza.
const patientViewLoggedCache = makeTTLCache<string, true>(24 * 60 * 60 * 1000);

/**
 * Registra che l'utente corrente ha aperto la scheda/lo storico di un paziente.
 * Da chiamare UNA volta al mount della pagina di dettaglio paziente (non ad ogni refetch).
 * Fallisce silenziosamente (best-effort): non deve mai bloccare la UI.
 */
export async function logPatientView(patientId: string): Promise<void> {
  if (!supabase || !patientId) return;
  if (patientViewLoggedCache.get(patientId)) return;
  patientViewLoggedCache.set(patientId, true);
  try {
    await supabase.rpc("log_patient_view", { _patient_id: patientId });
  } catch (err) {
    console.warn("logPatientView:", err);
  }
}

/** Storico di accessi/modifiche su un paziente, visibile solo a chi è collegato al paziente (RLS). */
export async function fetchPatientAuditLog(
  patientId: string,
  limit = 50,
): Promise<AuditLogEntry[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, patient_id, actor_id, actor_name, action, entity_type, entity_id, summary, meta, created_at")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("fetchPatientAuditLog:", error.message);
    return [];
  }
  return (data || []).map(mapAuditEntry);
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

/**
 * Promuove un caregiver a "principale" per un paziente.
 * RLS: consentito solo se l'utente corrente è owner/paziente/primario
 * (policy "patients: primary or self update" + funzione is_primary_of).
 */
export async function promoteCaregiverToPrimary(
  patientId: string,
  caregiverId: string,
): Promise<void> {
  if (!supabase) throw new Error("Supabase non configurato");
  const { error } = await supabase
    .from("patients")
    .update({ primary_caregiver_id: caregiverId })
    .eq("id", patientId);
  if (error) throw error;
  invalidateCaregiverCaches(patientId);
}

/** Rimuove un caregiver dal gruppo. RLS: primario può rimuovere secondari;
 *  ogni caregiver può rimuovere se stesso (unfollow).  */
export async function removeCaregiverFromPatient(
  patientId: string,
  caregiverId: string,
): Promise<void> {
  await unfollowPatient(caregiverId, patientId);
  invalidateCaregiverCaches(patientId);
}



/* =========================================================
   MANUAL STOCK ADJUSTMENT (eccezioni e imprevisti)
   Protetto da RLS "therapies: update primary" e "stock: insert primary":
   solo il caregiver primario può modificare scorte manualmente.
========================================================= */

export type StockAdjustmentReason =
  | "breakage"         // fiala/compressa rotta
  | "expired"          // farmaco scaduto o deteriorato
  | "double_dose"      // dose doppia accidentale
  | "hospital"         // sospensione per ricovero/intervento
  | "manual_loss";     // perdita generica / altro

/**
 * Scala manualmente le scorte di una terapia senza registrare un evento
 * "presa" (non altera lo stato della dose nel calendario).
 *
 * @param therapyId - ID della terapia
 * @param delta     - quantità da scalare (SEMPRE positiva: viene negata internamente)
 * @param reason    - motivo strutturato, usato nel log movimenti
 * @returns Il nuovo valore di pills_remaining dopo l'aggiornamento
 */
export async function adjustStockManually(
  therapyId: string,
  delta: number,
  reason: StockAdjustmentReason,
): Promise<{ newPillsRemaining: number }> {
  if (!supabase) throw new Error("Supabase non configurato");
  if (delta <= 0) throw new Error("delta deve essere positivo");

  // 1. Leggi il valore attuale
  const { data: row, error: fetchErr } = await supabase
    .from("therapies")
    .select("pills_remaining")
    .eq("id", therapyId)
    .single();
  if (fetchErr) throw fetchErr;

  const current = (row as any)?.pills_remaining ?? 0;
  const newValue = Math.max(0, current - delta);

  // 2. Aggiorna pills_remaining (RLS: solo primary caregiver)
  const { error: updateErr } = await supabase
    .from("therapies")
    .update({ pills_remaining: newValue })
    .eq("id", therapyId);
  if (updateErr) throw updateErr;

  // 3. Registra il movimento in stock_movements (best-effort, RLS: primary)
  //    Se fallisce non blocca: l'aggiornamento della scorta è già avvenuto.
  const { error: stockErr } = await supabase.from("stock_movements").insert({
    therapy_id: therapyId,
    delta: -delta,
    reason: `manual:${reason}`,
  });
  if (stockErr) {
    console.warn("[adjustStockManually] stock_movements insert failed:", stockErr.message);
  }

  return { newPillsRemaining: newValue };
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

export interface FamilyGroupData {
  members: PatientCaregiver[];
  invites: FamilyInvite[];
  logs: AuditLogEntry[];
}

/**
 * Dati completi della pagina "Gruppo di cura" (membri, inviti, audit log)
 * in un'unica chiamata RPC — vedi MIGRATION_family_group_rpc.sql.
 * Sostituisce le 3 query separate (caregiver_patients+caregivers,
 * family_invites, audit_log) con un solo round-trip.
 */
export async function fetchFamilyGroupData(
  patientId: string,
  primaryCaregiverId?: string | null,
  auditLimit = 31,
): Promise<FamilyGroupData> {
  const empty: FamilyGroupData = { members: [], invites: [], logs: [] };
  if (!supabase) return empty;

  const cacheKey = `${patientId}:${primaryCaregiverId ?? ""}:${auditLimit}`;
  const cached = familyGroupCache.get(cacheKey);
  if (cached) return cached as FamilyGroupData;

  const { data, error } = await supabase.rpc("get_family_group_data", {
    _patient_id: patientId,
    _audit_limit: auditLimit,
  });
  if (error) {
    console.warn("[fetchFamilyGroupData]", error.message);
    return empty;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return empty;

  const membersRaw = (row.members ?? []) as any[];
  const members: PatientCaregiver[] = membersRaw
    .map((m): PatientCaregiver => ({
      id: m.caregiver_id,
      name: (m.name as string | null)?.trim() || "Caregiver",
      relation: m.relation ?? null,
      photo: m.photo ?? null,
      relationship: m.relationship,
      linkedAt: m.created_at,
      isPrimary: !!primaryCaregiverId && m.caregiver_id === primaryCaregiverId,
    }))
    .sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.name.localeCompare(b.name, "it");
    });

  const invites: FamilyInvite[] = ((row.invites ?? []) as any[]).map(mapInvite);
  const logs: AuditLogEntry[] = ((row.audit_log ?? []) as any[]).map(mapAuditEntry);

  const result: FamilyGroupData = { members, invites, logs };
  familyGroupCache.set(cacheKey, result);
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

/* =========================================================
   THERAPY PHOTOS — Supabase Storage
   Le foto sono su bucket `therapy-photos` (private con RLS SELECT pubblica).
   In DB salviamo solo l'URL pubblico (~100 byte) invece del base64 (~150 KB).
========================================================= */

const THERAPY_PHOTOS_BUCKET = "therapy-photos";

function dataUrlToBlob(dataUrl: string): { blob: Blob; ext: string } {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("dataURL non valido");
  const mime = match[1];
  const bin = atob(match[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ext = mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "bin";
  return { blob: new Blob([bytes], { type: mime }), ext };
}

/**
 * Carica una foto (dataURL) su Storage e ritorna l'URL pubblico.
 * `kind` = "drug" | "package".
 */
export async function uploadTherapyPhotoFromDataUrl(
  therapyId: string,
  kind: "drug" | "package",
  dataUrl: string,
): Promise<string> {
  if (!supabase) throw new Error("Supabase non configurato");
  const { blob, ext } = dataUrlToBlob(dataUrl);
  const path = `therapies/${therapyId}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from(THERAPY_PHOTOS_BUCKET)
    .upload(path, blob, { upsert: true, contentType: blob.type });
  if (error) throw error;
  const { data } = supabase.storage.from(THERAPY_PHOTOS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Se `current` è un dataURL, lo carica su Storage e ritorna l'URL pubblico.
 * Se è già un URL http(s)://, lo ritorna così com'è. Se null/undefined, ritorna undefined.
 */
export async function ensureTherapyPhotoUrl(
  therapyId: string,
  kind: "drug" | "package",
  current: string | undefined | null,
): Promise<string | undefined> {
  if (!current) return undefined;
  if (current.startsWith("data:")) {
    return uploadTherapyPhotoFromDataUrl(therapyId, kind, current);
  }
  return current;
}

/**
 * Migrazione una-tantum: per ogni terapia visibile, se photo_drug/photo_package
 * è un dataURL lo carica su Storage e sostituisce con l'URL pubblico.
 * Ritorna il conteggio di righe aggiornate.
 */
export async function migrateAllTherapyPhotosToStorage(): Promise<{ migrated: number; skipped: number; errors: number }> {
  if (!supabase) throw new Error("Supabase non configurato");
  const { data, error } = await supabase
    .from("therapies")
    .select("id, photo_drug, photo_package");
  if (error) throw error;

  let migrated = 0, skipped = 0, errors = 0;
  for (const row of data ?? []) {
    const hasDrugData = row.photo_drug?.startsWith("data:");
    const hasPkgData = row.photo_package?.startsWith("data:");
    if (!hasDrugData && !hasPkgData) { skipped++; continue; }
    try {
      const patch: Record<string, string> = {};
      if (hasDrugData) {
        patch.photo_drug = await uploadTherapyPhotoFromDataUrl(row.id, "drug", row.photo_drug!);
      }
      if (hasPkgData) {
        patch.photo_package = await uploadTherapyPhotoFromDataUrl(row.id, "package", row.photo_package!);
      }
      const { error: upErr } = await supabase.from("therapies").update(patch).eq("id", row.id);
      if (upErr) throw upErr;
      migrated++;
    } catch (err) {
      console.error("[migrateAllTherapyPhotosToStorage] errore su", row.id, err);
      errors++;
    }
  }
  return { migrated, skipped, errors };
}

/* =========================================================
   MEDICAL PROFILE
   Scheda anagrafica e clinica di emergenza.
   Una riga per paziente; fetch one-shot + cache TTL 5 min.
   Nessun canale Realtime — zero egress WebSocket aggiuntivo.
========================================================= */

export type EmergencyContact = {
  name: string;
  role: string;  // es. "Medico di Base", "Cardiologo", "Familiare"
  phone: string;
};

export type MedicalProfile = {
  patientId: string;
  bloodType: string | null;
  /** Array di allergie/intolleranze. Array vuoto = nessuna allergia nota. */
  allergies: string[];
  /** Testo libero patologie e note. Null/vuoto = nessuna patologia registrata. */
  diagnoses: string | null;
  emergencyContacts: EmergencyContact[];
  notes: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

// Cache TTL 5 minuti: la scheda medica cambia raramente
const medicalProfileCache = makeTTLCache<string, MedicalProfile | null>(5 * 60 * 1000);

function mapMedicalProfileRow(row: any): MedicalProfile {
  return {
    patientId: row.patient_id,
    bloodType: row.blood_type ?? null,
    allergies: Array.isArray(row.allergies) ? row.allergies : [],
    diagnoses: row.diagnoses ?? null,
    emergencyContacts: Array.isArray(row.emergency_contacts) ? row.emergency_contacts : [],
    notes: row.notes ?? null,
    updatedAt: row.updated_at ?? null,
    updatedBy: row.updated_by ?? null,
  };
}

/**
 * Fetch one-shot della scheda medica per paziente.
 * Restituisce `null` se non ancora compilata (profilo inesistente).
 * I risultati sono cachati per 5 minuti per minimizzare le query al DB.
 */
export async function fetchMedicalProfile(patientId: string): Promise<MedicalProfile | null> {
  if (!isReady(patientId)) return null;

  const cached = medicalProfileCache.get(patientId);
  if (cached !== undefined) return cached;  // null incluso (profilo vuoto già verificato)

  const { data, error } = await supabase!
    .from("patient_medical_profiles")
    .select("patient_id, blood_type, allergies, diagnoses, emergency_contacts, notes, updated_at, updated_by")
    .eq("patient_id", patientId)
    .maybeSingle();

  if (error) {
    console.error("[fetchMedicalProfile] errore:", error);
    return null;
  }

  const result = data ? mapMedicalProfileRow(data) : null;
  medicalProfileCache.set(patientId, result);
  return result;
}

/**
 * UPSERT della scheda medica (insert se non esiste, update se esiste).
 * Una sola chiamata al DB. Invalida la cache locale dopo il salvataggio.
 */
export async function saveMedicalProfile(
  patientId: string,
  profile: Omit<MedicalProfile, "patientId" | "updatedAt" | "updatedBy">,
): Promise<{ error: string | null }> {
  if (!isReady(patientId)) return { error: "Non autenticato" };

  const { error } = await supabase!
    .from("patient_medical_profiles")
    .upsert(
      {
        patient_id: patientId,
        blood_type: profile.bloodType || null,
        allergies: profile.allergies,
        diagnoses: profile.diagnoses || null,
        emergency_contacts: profile.emergencyContacts,
        notes: profile.notes || null,
      },
      { onConflict: "patient_id" },
    );

  if (error) {
    console.error("[saveMedicalProfile] errore:", error);
    return { error: error.message };
  }

  medicalProfileCache.delete(patientId);
  return { error: null };
}

/**
 * Elimina la scheda medica del paziente.
 * Solo il caregiver primario è autorizzato (RLS lato DB).
 */
export async function deleteMedicalProfile(patientId: string): Promise<{ error: string | null }> {
  if (!isReady(patientId)) return { error: "Non autenticato" };

  const { error } = await supabase!
    .from("patient_medical_profiles")
    .delete()
    .eq("patient_id", patientId);

  if (error) {
    console.error("[deleteMedicalProfile] errore:", error);
    return { error: error.message };
  }

  medicalProfileCache.delete(patientId);
  return { error: null };
}

/** Invalida la cache della scheda medica (es. dopo realtime o navigazione). */
export function invalidateMedicalProfileCache(patientId?: string) {
  if (patientId) {
    medicalProfileCache.delete(patientId);
  } else {
    medicalProfileCache.clear();
  }
}

/* =========================================================
   RESET STORICO PAZIENTE
   Chiama la RPC atomica `reset_patient_history` che in una
   singola transazione PostgreSQL elimina eventi, notifiche e
   stock_movements, e reimposta pills_remaining sulle terapie.
   Solo il caregiver primario è autorizzato (verifica interna DB).
========================================================= */

export type ResetPatientHistoryResult = {
  ok: boolean;
  eventsDeleted: number;
  notifDeleted: number;
  stockDeleted: number;
  error: string | null;
};

/**
 * Azzera lo storico operativo del paziente (dosi, notifiche, movimenti scorta).
 * Mantiene intatti: anagrafica, terapie (configurazione), caregiver, scheda medica.
 * L'autorizzazione è verificata lato DB — genera errore se non si è il primario.
 */
export async function resetPatientHistory(
  patientId: string,
): Promise<ResetPatientHistoryResult> {
  if (!isReady(patientId)) {
    return { ok: false, eventsDeleted: 0, notifDeleted: 0, stockDeleted: 0, error: "Non autenticato" };
  }

  const { data, error } = await supabase!.rpc("reset_patient_history", {
    _patient_id: patientId,
  });

  if (error) {
    console.error("[resetPatientHistory] errore:", error);
    return {
      ok: false,
      eventsDeleted: 0,
      notifDeleted: 0,
      stockDeleted: 0,
      error: error.message,
    };
  }

  const d = data as any;
  return {
    ok: true,
    eventsDeleted: d?.events_deleted ?? 0,
    notifDeleted: d?.notif_deleted ?? 0,
    stockDeleted: d?.stock_deleted ?? 0,
    error: null,
  };
}