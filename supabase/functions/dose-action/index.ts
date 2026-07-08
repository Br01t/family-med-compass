// FamilyMed — dose-action
// Chiamata dal service worker quando l'utente clicca "Conferma" o "Rimanda"
// direttamente dalla notifica push (anche ad app chiusa).
// Dopo l'update dell'evento, notifica ANCHE il caregiver in tempo reale
// tramite push-sender, così non deve aspettare il prossimo giro di cron.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Max-Age": "86400",
};

function romeHM(d: Date | string) {
  return new Date(d).toLocaleTimeString("it-IT", {
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome",
  });
}

async function pushToUser(sb: any, targetUserId: string, payload: any) {
  try {
    await sb.functions.invoke("push-sender", {
      body: { targetUserId, url: "/notifiche", ...payload },
    });
  } catch (err) {
    console.warn("[dose-action] push failed:", err);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const { endpoint, eventId, action } = body as {
    endpoint?: string; eventId?: string; action?: "confirm" | "snooze";
  };
  if (!endpoint || !eventId || !action) return json({ error: "missing fields" }, 400);

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { data: sub, error: subErr } = await sb
    .from("push_subscriptions").select("user_id").eq("endpoint", endpoint).maybeSingle();
  if (subErr || !sub?.user_id) return json({ error: "unknown endpoint" }, 401);
  const userId = sub.user_id;

  const { data: ev, error: evErr } = await sb
    .from("events")
    .select("id, therapy_id, patient_id, scheduled_at, status, therapies(name, snooze_minutes, quantity, photo_drug, photo_package), patients(name, user_id)")
    .eq("id", eventId).maybeSingle();
  if (evErr || !ev) return json({ error: "event not found" }, 404);

  const patient = (ev as any).patients;
  const therapy = (ev as any).therapies;
  if (!patient?.user_id || patient.user_id !== userId) return json({ error: "not the patient" }, 403);

  const nowIso = new Date().toISOString();
  const image = therapy?.photo_drug ?? therapy?.photo_package ?? undefined;

  const { data: cps } = await sb
    .from("caregiver_patients").select("caregiver_id").eq("patient_id", ev.patient_id);
  const caregiverIds = ((cps ?? []) as any[]).map((r) => r.caregiver_id);

  if (action === "confirm") {
    const { error } = await sb.from("events").update({
      status: "taken",
      confirmed_at: nowIso,
      confirmed_by: "push-action",
      timeline: [{ at: nowIso, kind: "taken", message: "Confermata dalla notifica" }],
    }).eq("id", eventId);
    if (error) return json({ error: error.message }, 500);

    // Notifica caregiver: push immediata + riga in notifications
    const title = `👨‍👩‍👧 ${patient.name} ha preso ${therapy?.name ?? "la terapia"}`;
    const msg = `Confermata alle ${romeHM(nowIso)} (dose delle ${romeHM(ev.scheduled_at)}).`;
    const doseKey = `${ev.therapy_id}@${ev.scheduled_at}@taken-push`;
    for (const cid of caregiverIds) {
      await sb.from("notifications").insert({
        target_user_id: cid,
        kind: "taken", severity: "info",
        title, message: msg,
        patient_id: ev.patient_id, therapy_id: ev.therapy_id, event_id: ev.id,
        dose_key: `${doseKey}@${cid}`,
      }).then(() => {}, () => {});
      await pushToUser(sb, cid, {
        title, body: msg, image,
        tag: `cg-${ev.id}-taken`,
        kind: "taken", eventId: ev.id,
        icon: "/icons/badge-caregiver.png",
      });
    }
    return json({ ok: true, action: "confirmed" });
  }

  if (action === "snooze") {
    const minutes = Math.max(1, Number(therapy?.snooze_minutes ?? 10));
    if (ev.status !== "scheduled") return json({ error: "cannot snooze in this state" }, 400);
    const snoozedUntil = new Date(Date.now() + minutes * 60_000).toISOString();
    const { error } = await sb.from("events").update({
      status: "snoozed", stage: "snoozed", snoozed_until: snoozedUntil,
      timeline: [{ at: nowIso, kind: "snoozed", message: `Rimandata di ${minutes} min` }],
    }).eq("id", eventId);
    if (error) return json({ error: error.message }, 500);

    const title = `👨‍👩‍👧 ${patient.name} ha rimandato ${therapy?.name ?? "la terapia"}`;
    const msg = `Nuovo promemoria alle ${romeHM(snoozedUntil)} (dose delle ${romeHM(ev.scheduled_at)}).`;
    const doseKey = `${ev.therapy_id}@${ev.scheduled_at}@snoozed-push`;
    for (const cid of caregiverIds) {
      await sb.from("notifications").insert({
        target_user_id: cid,
        kind: "snoozed", severity: "warning",
        title, message: msg,
        patient_id: ev.patient_id, therapy_id: ev.therapy_id, event_id: ev.id,
        dose_key: `${doseKey}@${cid}`,
      }).then(() => {}, () => {});
      await pushToUser(sb, cid, {
        title, body: msg, image,
        tag: `cg-${ev.id}-snoozed`,
        kind: "snoozed", eventId: ev.id,
        icon: "/icons/badge-caregiver.png",
      });
    }
    return json({ ok: true, action: "snoozed", until: snoozedUntil });
  }

  return json({ error: "unknown action" }, 400);
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
