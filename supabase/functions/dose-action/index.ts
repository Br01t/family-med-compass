// FamilyMed — dose-action
// Endpoint chiamato dal service worker quando l'utente clicca "Conferma" o
// "Rimanda" direttamente dalla notifica push (anche ad app chiusa).
// Autenticazione: l'endpoint richiede l'`endpoint` della propria push
// subscription (già segreto condiviso tra browser e server) + eventId + action.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Max-Age": "86400",
};

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

  // Risolvi utente dal push endpoint
  const { data: sub, error: subErr } = await sb
    .from("push_subscriptions").select("user_id").eq("endpoint", endpoint).maybeSingle();
  if (subErr || !sub?.user_id) return json({ error: "unknown endpoint" }, 401);
  const userId = sub.user_id;

  // Verifica che l'utente sia il paziente titolare
  const { data: ev, error: evErr } = await sb
    .from("events").select("id, therapy_id, patient_id, scheduled_at, status, therapies(name, snooze_minutes, quantity)")
    .eq("id", eventId).maybeSingle();
  if (evErr || !ev) return json({ error: "event not found" }, 404);

  const { data: pt } = await sb.from("patients").select("user_id").eq("id", ev.patient_id).maybeSingle();
  if (!pt?.user_id || pt.user_id !== userId) return json({ error: "not the patient" }, 403);

  const nowIso = new Date().toISOString();

  if (action === "confirm") {
    const { error } = await sb.from("events").update({
      status: "taken",
      confirmed_at: nowIso,
      confirmed_by: "push-action",
      timeline: [{ at: nowIso, kind: "taken", message: "Confermata dalla notifica" }],
    }).eq("id", eventId);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, action: "confirmed" });
  }

  if (action === "snooze") {
    const minutes = Math.max(1, Number((ev as any).therapies?.snooze_minutes ?? 10));
    if (ev.status !== "scheduled") return json({ error: "cannot snooze in this state" }, 400);
    const snoozedUntil = new Date(Date.now() + minutes * 60_000).toISOString();
    const { error } = await sb.from("events").update({
      status: "snoozed",
      stage: "snoozed",
      snoozed_until: snoozedUntil,
      timeline: [{ at: nowIso, kind: "snoozed", message: `Rimandata di ${minutes} min` }],
    }).eq("id", eventId);
    if (error) return json({ error: error.message }, 500);

    // Notifica caregiver che ha rimandato
    const { data: cps } = await sb.from("caregiver_patients")
      .select("caregiver_id").eq("patient_id", ev.patient_id);
    for (const { caregiver_id } of (cps ?? []) as any[]) {
      await sb.from("notifications").insert({
        target_user_id: caregiver_id,
        kind: "snoozed",
        severity: "warning",
        title: `Dose rimandata di ${minutes} min`,
        message: `Sarà chiesta di nuovo alle ${new Date(snoozedUntil).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" })}`,
        patient_id: ev.patient_id,
        therapy_id: ev.therapy_id,
        event_id: ev.id,
        dose_key: `${ev.therapy_id}@${ev.scheduled_at}@snoozed@cg@${caregiver_id}`,
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
