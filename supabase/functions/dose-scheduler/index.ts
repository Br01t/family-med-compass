// FamilyMed — dose-scheduler
// Edge function invocata da pg_cron ogni minuto.
// Compiti:
//   1. Per ogni terapia attiva/non sospesa, genera in public.events le dosi mancanti fino a +24h.
//   2. Marca "missed" le dosi pending scadute oltre timeout + snooze.
//   3. Inserisce notifiche pre/due/post/missed a paziente e caregiver collegati.
//   4. Invia Web Push persistenti, con allarme per il momento esatto.
//
// Deploy: `supabase functions deploy dose-scheduler --no-verify-jwt`
// Vars richieste: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (impostate di default nel runtime).

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Therapy = {
  id: string;
  patient_id: string;
  name: string;
  quantity: number | null;
  times: string[] | null;
  recurrence: any;
  start_date: string;
  end_date: string | null;
  timeout_minutes: number | null;
  snooze_minutes: number | null;
  reminder_intervals: number[] | null;
  active: boolean;
  suspended: boolean;
};

function scheduledOnDate(recurrence: any, date: Date, startIso: string): boolean {
  const start = new Date(startIso + "T00:00:00Z");
  if (date < start) return false;
  const dow = date.getUTCDay();
  const kind = recurrence?.kind ?? "daily";
  switch (kind) {
    case "daily": return true;
    case "weekdays": return dow >= 1 && dow <= 5;
    case "weekend": return dow === 0 || dow === 6;
    case "every_x_days": {
      const x = Math.max(1, Number(recurrence?.x ?? 1));
      const diff = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
      return diff % x === 0;
    }
    case "specific_days":
      return Array.isArray(recurrence?.days) && recurrence.days.includes(dow);
    default: return true;
  }
}

function buildDoseTimes(therapy: Therapy, from: Date, to: Date): Date[] {
  const times: Date[] = [];
  if (!therapy.times || therapy.times.length === 0) return times;
  const cursor = new Date(from);
  cursor.setUTCHours(0, 0, 0, 0);
  const end = new Date(to);
  while (cursor <= end) {
    if (
      scheduledOnDate(therapy.recurrence, cursor, therapy.start_date) &&
      (!therapy.end_date || new Date(therapy.end_date + "T23:59:59Z") >= cursor)
    ) {
      for (const t of therapy.times) {
        const [h, m] = t.split(":").map(Number);
        const dt = new Date(cursor);
        dt.setUTCHours(h ?? 0, m ?? 0, 0, 0);
        if (dt >= from && dt <= to) times.push(new Date(dt));
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return times;
}

function getReminderBeforeMinutes(therapy: { reminder_intervals?: number[] | null }): number {
  const values = Array.isArray(therapy.reminder_intervals) ? therapy.reminder_intervals : [];
  const first = values.find((value) => Number.isFinite(Number(value)) && Number(value) !== 0);
  return Math.max(1, Math.abs(Number(first ?? 10)));
}

async function sendPush(sb: any, targetUserId: string, payload: {
  title: string;
  body?: string;
  tag?: string;
  isAlarm?: boolean;
  requireInteraction?: boolean;
}) {
  try {
    await sb.functions.invoke("push-sender", {
      body: { targetUserId, ...payload, url: "/notifiche" },
    });
  } catch (err) {
    console.warn("[dose-scheduler] push failed:", err);
  }
}

async function getCaregiverIds(sb: any, patientId: string): Promise<string[]> {
  const { data } = await sb
    .from("caregiver_patients")
    .select("caregiver_id")
    .eq("patient_id", patientId);
  return ((data ?? []) as Array<{ caregiver_id: string }>).map((row) => row.caregiver_id);
}

async function notifyRecipients(sb: any, input: {
  patientId: string;
  patientUserId?: string | null;
  caregiverIds?: string[];
  therapyId: string;
  eventId: string;
  scheduledAt: string;
  kind: "reminder_pre" | "due" | "reminder_post" | "missed";
  severity: "info" | "warning" | "alert";
  patientTitle: string;
  patientMessage: string;
  caregiverTitle: string;
  caregiverMessage: string;
  isAlarm?: boolean;
  requireInteraction?: boolean;
}) {
  const recipients = [
    ...(input.patientUserId
      ? [{ userId: input.patientUserId, title: input.patientTitle, message: input.patientMessage, audience: "patient" }]
      : []),
    ...((input.caregiverIds ?? []).map((userId) => ({
      userId,
      title: input.caregiverTitle,
      message: input.caregiverMessage,
      audience: "caregiver",
    }))),
  ];

  for (const recipient of recipients) {
    const doseKey = `${input.therapyId}@${input.scheduledAt}@${input.kind}@${recipient.audience}`;
    const { error } = await sb.from("notifications").insert({
      target_user_id: recipient.userId,
      kind: input.kind,
      severity: input.severity,
      title: recipient.title,
      message: recipient.message,
      patient_id: input.patientId,
      therapy_id: input.therapyId,
      event_id: input.eventId,
      dose_key: doseKey,
    });
    if (!error) {
      await sendPush(sb, recipient.userId, {
        title: recipient.title,
        body: recipient.message,
        tag: doseKey,
        isAlarm: input.isAlarm,
        requireInteraction: input.requireInteraction,
      });
    }
  }
}

Deno.serve(async (_req) => {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const now = new Date();
  const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const past = new Date(now.getTime() - 30 * 60 * 1000);

  // 1. Carica terapie attive
  const { data: therapies, error: tErr } = await sb
    .from("therapies")
    .select("*")
    .eq("active", true)
    .eq("suspended", false);
  if (tErr) return new Response(`therapies error: ${tErr.message}`, { status: 500 });

  // 2. Genera dosi mancanti in events (status=scheduled)
  const rows: any[] = [];
  for (const th of (therapies ?? []) as Therapy[]) {
    for (const at of buildDoseTimes(th, past, horizon)) {
      rows.push({
        id: `e_${th.id}_${at.getTime()}`,
        therapy_id: th.id,
        patient_id: th.patient_id,
        scheduled_at: at.toISOString(),
        status: "scheduled",
        timeline: [{ at: at.toISOString(), kind: "scheduled", message: "Dose programmata" }],
      });
    }
  }
  if (rows.length > 0) {
    await sb.from("events").upsert(rows, { onConflict: "therapy_id,scheduled_at", ignoreDuplicates: true });
  }

  // 3a. Reminder PRE → notifica paziente + caregiver
  const reminderWindowStart = now.toISOString();
  const reminderWindowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const { data: reminderEvents } = await sb
    .from("events")
    .select("id, therapy_id, patient_id, scheduled_at, status, therapies(name, quantity, dosage, reminder_intervals, photo_drug), patients(name, user_id)")
    .in("status", ["scheduled"])
    .gte("scheduled_at", reminderWindowStart)
    .lte("scheduled_at", reminderWindowEnd);

  for (const ev of (reminderEvents ?? []) as any[]) {
    const patient = ev.patients;
    const therapy = ev.therapies;
    const reminderBefore = getReminderBeforeMinutes(therapy);
    const diffMs = new Date(ev.scheduled_at).getTime() - now.getTime();
    if (diffMs > reminderBefore * 60 * 1000 || diffMs <= Math.max(0, reminderBefore - 2) * 60 * 1000) continue;
    if (!patient?.user_id) continue;
    const caregivers = await getCaregiverIds(sb, ev.patient_id);
    const time = new Date(ev.scheduled_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
    await notifyRecipients(sb, {
      patientId: ev.patient_id,
      patientUserId: patient.user_id,
      caregiverIds: caregivers,
      therapyId: ev.therapy_id,
      eventId: ev.id,
      scheduledAt: ev.scheduled_at,
      kind: "reminder_pre",
      severity: "info",
      patientTitle: `Tra ${reminderBefore} min: ${therapy?.name ?? "farmaco"}`,
      patientMessage: `Alle ${time} — ${therapy?.dosage ?? ""}`,
      caregiverTitle: `${patient?.name ?? "Paziente"}: promemoria tra ${reminderBefore} min`,
      caregiverMessage: `${therapy?.name ?? "Farmaco"} previsto alle ${time}.`,
    });
  }

  // 3b. DUE → notifica paziente + caregiver + SVEGLIA
  const dueWindowStart = new Date(now.getTime() - 60 * 1000).toISOString();
  const dueWindowEnd = new Date(now.getTime() + 90 * 1000).toISOString();
  const { data: dueEvents } = await sb
    .from("events")
    .select("id, therapy_id, patient_id, scheduled_at, status, therapies(name, quantity, dosage, photo_drug), patients(name, user_id)")
    .in("status", ["scheduled"])
    .gte("scheduled_at", dueWindowStart)
    .lte("scheduled_at", dueWindowEnd);

  for (const ev of (dueEvents ?? []) as any[]) {
    const patient = ev.patients;
    const therapy = ev.therapies;
    if (!patient?.user_id) continue;
    const caregivers = await getCaregiverIds(sb, ev.patient_id);
    const time = new Date(ev.scheduled_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
    await notifyRecipients(sb, {
      patientId: ev.patient_id,
      patientUserId: patient.user_id,
      caregiverIds: caregivers,
      therapyId: ev.therapy_id,
      eventId: ev.id,
      scheduledAt: ev.scheduled_at,
      kind: "due",
      severity: "warning",
      patientTitle: `È ora: ${therapy?.name ?? "farmaco"}`,
      patientMessage: `${therapy?.quantity ?? 1} unità — ${therapy?.dosage ?? ""}. Conferma o rimanda ora.`,
      caregiverTitle: `${patient?.name ?? "Paziente"}: dose da prendere ora`,
      caregiverMessage: `${therapy?.name ?? "Farmaco"} delle ${time}: in attesa di conferma o rimando.`,
      isAlarm: true,
      requireInteraction: true,
    });
  }

  // 3c. Reminder POST → paziente + caregiver se ancora pending oltre post_reminder_minutes
  const { data: postEvents } = await sb
    .from("events")
    .select("id, therapy_id, patient_id, scheduled_at, status, therapies(name, dosage, post_reminder_minutes, timeout_minutes), patients(name, user_id)")
    .in("status", ["scheduled", "snoozed"])
    .lte("scheduled_at", new Date(now.getTime() - 60_000).toISOString());

  for (const ev of (postEvents ?? []) as any[]) {
    const patient = ev.patients;
    const therapy = ev.therapies;
    if (!patient?.user_id) continue;
    const postMin = Math.max(1, Number(therapy?.post_reminder_minutes ?? 5));
    const timeoutMin = Number(therapy?.timeout_minutes ?? 10);
    const elapsedMin = (now.getTime() - new Date(ev.scheduled_at).getTime()) / 60_000;
    if (elapsedMin < postMin || elapsedMin >= timeoutMin) continue;
    if (elapsedMin > postMin + 2) continue; // finestra di 2 min per non spammare
    const caregivers = await getCaregiverIds(sb, ev.patient_id);
    const time = new Date(ev.scheduled_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
    await notifyRecipients(sb, {
      patientId: ev.patient_id,
      patientUserId: patient.user_id,
      caregiverIds: caregivers,
      therapyId: ev.therapy_id,
      eventId: ev.id,
      scheduledAt: ev.scheduled_at,
      kind: "reminder_post",
      severity: "warning",
      patientTitle: `Ancora da prendere: ${therapy?.name ?? "farmaco"}`,
      patientMessage: `Non hai ancora confermato la dose delle ${time}. ${therapy?.dosage ?? ""}`,
      caregiverTitle: `${patient?.name ?? "Paziente"}: dose non ancora confermata`,
      caregiverMessage: `${therapy?.name ?? "Farmaco"} delle ${time}: nessuna conferma ricevuta.`,
      requireInteraction: true,
    });
  }

  // 4. Missed: pending oltre timeout(+ snooze) → status=missed + notifica caregiver
  const { data: pendingEvents } = await sb
    .from("events")
    .select("id, therapy_id, patient_id, scheduled_at, status, snoozed_until, therapies(name, timeout_minutes, snooze_minutes), patients(name)")
    .in("status", ["scheduled", "snoozed"])
    .lte("scheduled_at", new Date(now.getTime() - 5 * 60 * 1000).toISOString());

  for (const ev of (pendingEvents ?? []) as any[]) {
    const th = ev.therapies;
    const timeoutMin = th?.timeout_minutes ?? 10;
    const deadline = ev.snoozed_until
      ? new Date(ev.snoozed_until).getTime()
      : new Date(ev.scheduled_at).getTime() + timeoutMin * 60 * 1000;
    if (now.getTime() < deadline) continue;

    await sb.from("events").update({
      status: "missed",
      timeline: [{ at: now.toISOString(), kind: "missed", message: "Dose non confermata" }],
    }).eq("id", ev.id).eq("status", ev.status);

    const title = `${ev.patients?.name ?? "Paziente"} non ha preso ${th?.name ?? "il farmaco"}`;
    const message = `Prevista alle ${new Date(ev.scheduled_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" })}`;
    const caregiverIds = await getCaregiverIds(sb, ev.patient_id);
    for (const caregiver_id of caregiverIds) {
      const doseKey = `${ev.therapy_id}@${ev.scheduled_at}@missed`;
      const { error } = await sb.from("notifications").insert({
        target_user_id: caregiver_id,
        kind: "missed",
        severity: "alert",
        title,
        message,
        patient_id: ev.patient_id,
        therapy_id: ev.therapy_id,
        event_id: ev.id,
        dose_key: doseKey,
      });
      if (!error) {
        await sendPush(sb, caregiver_id, {
          title,
          body: message,
          tag: doseKey,
          requireInteraction: true,
        });
      }
    }

    // Notifica anche il paziente
    const { data: pat } = await sb.from("patients").select("user_id").eq("id", ev.patient_id).maybeSingle();
    if (pat?.user_id) {
      const doseKey = `${ev.therapy_id}@${ev.scheduled_at}@missed-patient`;
      const patientTitle = `Cura dimenticata: ${th?.name ?? "farmaco"}`;
      const patientMessage = `La dose delle ${new Date(ev.scheduled_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" })} è stata segnata come dimenticata. Potresti essere contattato da un familiare.`;
      const { error } = await sb.from("notifications").insert({
        target_user_id: pat.user_id,
        kind: "missed",
        severity: "alert",
        title: patientTitle,
        message: patientMessage,
        patient_id: ev.patient_id,
        therapy_id: ev.therapy_id,
        event_id: ev.id,
        dose_key: doseKey,
      });
      if (!error) await sendPush(sb, pat.user_id, { title: patientTitle, body: patientMessage, tag: doseKey, requireInteraction: true });
    }
  }

  return new Response(JSON.stringify({ ok: true, at: now.toISOString() }), {
    headers: { "content-type": "application/json" },
  });
});
