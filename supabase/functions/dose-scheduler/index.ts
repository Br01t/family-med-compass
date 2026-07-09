// FamilyMed — dose-scheduler
// Invocata da pg_cron ogni minuto.
// Genera le righe `events` e avanza lo stage delle dosi
// (scheduled → reminder_pre → due → snoozed → final_due → taken | missed).
// Ogni transizione scrive una riga in `notifications`; il client paziente
// la trasforma in modale in-app e il caregiver la vede nel centro notifiche.
// Nessuna notifica push viene inviata: quel canale è stato rimosso.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function getEnv() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return { url, key };
}

type Therapy = {
  id: string; patient_id: string; name: string;
  quantity: number | null; dosage: string | null;
  times: string[] | null; recurrence: any;
  start_date: string; end_date: string | null;
  timeout_minutes: number | null;
  snooze_minutes: number | null;
  post_reminder_minutes: number | null;
  reminder_intervals: number[] | null;
  photo_drug: string | null; photo_package: string | null;
  active: boolean; suspended: boolean;
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

function romeHM(iso: string): string {
  return new Date(iso).toLocaleTimeString("it-IT", {
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome",
  });
}

function reminderBeforeMin(t: { reminder_intervals?: number[] | null }): number {
  const v = Array.isArray(t.reminder_intervals) ? t.reminder_intervals : [];
  const first = v.find((x) => Number.isFinite(Number(x)) && Number(x) !== 0);
  return Math.max(1, Math.abs(Number(first ?? 10)));
}

async function insertNotif(sb: any, row: any): Promise<void> {
  const { error } = await sb.from("notifications").insert(row);
  if (error && error.code !== "23505") {
    console.warn("[scheduler] insert notif:", error.message);
  }
}

async function notifyBoth(
  sb: any,
  ev: any,
  patient: any,
  therapy: any,
  spec: {
    kind: string; severity: string;
    patientTitle: string; patientBody: string;
    caregiverTitle: string; caregiverBody: string;
  },
) {
  const baseKey = `${ev.therapy_id}@${ev.scheduled_at}@${spec.kind}`;

  if (patient?.user_id) {
    await insertNotif(sb, {
      target_user_id: patient.user_id,
      kind: spec.kind,
      severity: spec.severity,
      title: `💊 ${spec.patientTitle}`,
      message: spec.patientBody,
      patient_id: ev.patient_id,
      therapy_id: ev.therapy_id,
      event_id: ev.id,
      dose_key: `${baseKey}@patient`,
    });
  }

  const { data: cps } = await sb
    .from("caregiver_patients").select("caregiver_id").eq("patient_id", ev.patient_id);
  for (const { caregiver_id } of (cps ?? []) as any[]) {
    await insertNotif(sb, {
      target_user_id: caregiver_id,
      kind: spec.kind,
      severity: spec.severity,
      title: `👨‍👩‍👧 ${spec.caregiverTitle}`,
      message: spec.caregiverBody,
      patient_id: ev.patient_id,
      therapy_id: ev.therapy_id,
      event_id: ev.id,
      dose_key: `${baseKey}@cg@${caregiver_id}`,
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
        "Access-Control-Max-Age": "86400",
      },
    });
  }
  const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getEnv();
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const now = new Date();
  const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const past = new Date(now.getTime() - 30 * 60 * 1000);

  const { data: therapies, error: tErr } = await sb
    .from("therapies").select("*").eq("active", true).eq("suspended", false);
  if (tErr) return new Response(`therapies error: ${tErr.message}`, { status: 500 });

  // Genera dosi future mancanti
  const rows: any[] = [];
  for (const th of (therapies ?? []) as Therapy[]) {
    for (const at of buildDoseTimes(th, past, horizon)) {
      rows.push({
        id: `e_${th.id}_${at.getTime()}`,
        therapy_id: th.id,
        patient_id: th.patient_id,
        scheduled_at: at.toISOString(),
        status: "scheduled",
        stage: "scheduled",
        timeline: [{ at: at.toISOString(), kind: "scheduled", message: "Dose programmata" }],
      });
    }
  }
  if (rows.length > 0) {
    await sb.from("events").upsert(rows, { onConflict: "therapy_id,scheduled_at", ignoreDuplicates: true });
  }

  const selectCols = "id, therapy_id, patient_id, scheduled_at, status, stage, snoozed_until, final_due_at, therapies(name, quantity, dosage, timeout_minutes, snooze_minutes, post_reminder_minutes, reminder_intervals, photo_drug, photo_package), patients(name, user_id)";

  // REMINDER_PRE
  const { data: preEvents } = await sb.from("events").select(selectCols)
    .in("status", ["scheduled"])
    .gte("scheduled_at", now.toISOString())
    .lte("scheduled_at", horizon.toISOString());
  for (const ev of (preEvents ?? []) as any[]) {
    const th = ev.therapies; const pt = ev.patients;
    const before = reminderBeforeMin(th);
    const diffMin = (new Date(ev.scheduled_at).getTime() - now.getTime()) / 60000;
    if (diffMin > before || diffMin <= Math.max(0, before - 2)) continue;
    await notifyBoth(sb, ev, pt, th, {
      kind: "reminder_pre",
      severity: "info",
      patientTitle: `Tra ${before} min: ${th?.name ?? "farmaco"}`,
      patientBody: `Alle ${romeHM(ev.scheduled_at)} — ${th?.dosage ?? ""}`,
      caregiverTitle: `Tra ${before} min: ${pt?.name ?? "paziente"} deve prendere ${th?.name ?? "il farmaco"}`,
      caregiverBody: `Alle ${romeHM(ev.scheduled_at)} — ${th?.dosage ?? ""}`,
    });
  }

  // DUE (ora esatta ±90s)
  const { data: dueEvents } = await sb.from("events").select(selectCols)
    .in("status", ["scheduled"])
    .gte("scheduled_at", new Date(now.getTime() - 60_000).toISOString())
    .lte("scheduled_at", new Date(now.getTime() + 90_000).toISOString());
  for (const ev of (dueEvents ?? []) as any[]) {
    const th = ev.therapies; const pt = ev.patients;
    await sb.from("events").update({ stage: "due" }).eq("id", ev.id).in("status", ["scheduled"]);
    await notifyBoth(sb, ev, pt, th, {
      kind: "due",
      severity: "warning",
      patientTitle: `È ora: ${th?.name ?? "farmaco"}`,
      patientBody: `${th?.quantity ?? 1} unità — ${th?.dosage ?? ""}`,
      caregiverTitle: `È ora: ${pt?.name ?? "paziente"} deve prendere ${th?.name ?? "il farmaco"}`,
      caregiverBody: `Orario: ${romeHM(ev.scheduled_at)} — ${th?.dosage ?? ""}`,
    });
  }

  // REMINDER_POST: dopo N minuti dall'orario, se ancora scheduled/due
  const { data: postEvents } = await sb.from("events").select(selectCols)
    .in("status", ["scheduled"])
    .lte("scheduled_at", new Date(now.getTime() - 60_000).toISOString())
    .gte("scheduled_at", new Date(now.getTime() - 30 * 60_000).toISOString());
  for (const ev of (postEvents ?? []) as any[]) {
    const th = ev.therapies; const pt = ev.patients;
    const postMin = Math.max(1, Number(th?.post_reminder_minutes ?? 5));
    const elapsed = (now.getTime() - new Date(ev.scheduled_at).getTime()) / 60000;
    if (elapsed < postMin || elapsed > postMin + 2) continue;
    if (ev.stage === "reminder_post" || ev.stage === "final_due" || ev.stage === "missed") continue;
    await sb.from("events").update({ stage: "reminder_post" }).eq("id", ev.id).in("status", ["scheduled"]);
    await notifyBoth(sb, ev, pt, th, {
      kind: "reminder_post",
      severity: "warning",
      patientTitle: `Non hai ancora preso ${th?.name ?? "il farmaco"}`,
      patientBody: `Erano le ${romeHM(ev.scheduled_at)}. Conferma o rimanda.`,
      caregiverTitle: `${pt?.name ?? "Paziente"} non ha ancora preso ${th?.name ?? "il farmaco"}`,
      caregiverBody: `Prevista alle ${romeHM(ev.scheduled_at)} — nessuna azione.`,
    });
  }


  // FINAL_DUE: snoozed alla scadenza dello snooze
  const { data: snoozedEvents } = await sb.from("events").select(selectCols)
    .eq("status", "snoozed")
    .not("snoozed_until", "is", null)
    .lte("snoozed_until", new Date(now.getTime() + 60_000).toISOString());
  for (const ev of (snoozedEvents ?? []) as any[]) {
    if (ev.stage === "final_due" || ev.stage === "missed") continue;
    if (ev.final_due_at) continue;
    const th = ev.therapies; const pt = ev.patients;
    await sb.from("events").update({
      stage: "final_due",
      final_due_at: now.toISOString(),
    }).eq("id", ev.id).eq("status", "snoozed");
    await notifyBoth(sb, ev, pt, th, {
      kind: "final_due",
      severity: "warning",
      patientTitle: `Ultima chiamata: ${th?.name ?? "farmaco"}`,
      patientBody: `Conferma la dose delle ${romeHM(ev.scheduled_at)}. Non puoi più rimandare.`,
      caregiverTitle: `${pt?.name ?? "Paziente"} — ultima chiamata per ${th?.name ?? "farmaco"}`,
      caregiverBody: `Rimandata, ora deve confermare entro il tempo massimo.`,
    });
  }

  // MISSED
  const { data: pendingEvents } = await sb.from("events").select(selectCols)
    .in("status", ["scheduled", "snoozed"])
    .lte("scheduled_at", new Date(now.getTime() - 5 * 60_000).toISOString());
  for (const ev of (pendingEvents ?? []) as any[]) {
    const th = ev.therapies; const pt = ev.patients;
    const timeoutMin = Number(th?.timeout_minutes ?? 10);
    const scheduledMs = new Date(ev.scheduled_at).getTime();
    const snoozeDeadline = ev.snoozed_until ? new Date(ev.snoozed_until).getTime() : null;
    const hardDeadline = snoozeDeadline
      ? snoozeDeadline + timeoutMin * 60_000
      : scheduledMs + timeoutMin * 60_000;
    if (now.getTime() < hardDeadline) continue;

    await sb.from("events").update({
      status: "missed",
      stage: "missed",
      timeline: [{ at: now.toISOString(), kind: "missed", message: "Dose non confermata entro il tempo massimo" }],
    }).eq("id", ev.id).in("status", ["scheduled", "snoozed"]);

    await notifyBoth(sb, ev, pt, th, {
      kind: "missed",
      severity: "alert",
      patientTitle: `Cura dimenticata: ${th?.name ?? "farmaco"}`,
      patientBody: `La dose delle ${romeHM(ev.scheduled_at)} è stata segnata come dimenticata. Probabilmente verrai contattato da un familiare.`,
      caregiverTitle: `${pt?.name ?? "Paziente"} non ha preso ${th?.name ?? "il farmaco"} (dimenticata)`,
      caregiverBody: `Dose delle ${romeHM(ev.scheduled_at)} — segnata come dimenticata dopo il tempo massimo.`,
    });
  }

  return new Response(JSON.stringify({ ok: true, at: now.toISOString() }), {
    headers: { "content-type": "application/json" },
  });
});
