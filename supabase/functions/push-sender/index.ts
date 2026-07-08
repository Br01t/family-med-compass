// FamilyMed — push-sender
// Invia Web Push a tutte le subscription registrate per un utente.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@familymed.app";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Max-Age": "86400",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const targetUserId = body.targetUserId as string | undefined;
  if (!targetUserId) return json({ error: "missing targetUserId" }, 400);

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: subs, error } = await sb
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", targetUserId);
  if (error) return json({ error: `db: ${error.message}` }, 500);

  const payload = JSON.stringify({
    title: body.title ?? "FamilyMed",
    body: body.body ?? "",
    icon: body.icon ?? "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    image: body.image,
    tag: body.tag,
    url: body.url ?? "/notifiche",
    requireInteraction: body.requireInteraction ?? body.isAlarm ?? false,
    isAlarm: !!body.isAlarm,
    kind: body.kind,
    eventId: body.eventId,
    actions: Array.isArray(body.actions) ? body.actions : [],
  });

  const results: any[] = [];
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { TTL: 300, urgency: body.isAlarm ? "high" : "normal" },
      );
      results.push({ id: s.id, ok: true });
    } catch (err: any) {
      const status = err?.statusCode;
      if (status === 404 || status === 410) {
        await sb.from("push_subscriptions").delete().eq("id", s.id);
      }
      results.push({ id: s.id, ok: false, status, err: err?.message });
      console.warn("[push-sender]", status, err?.message);
    }
  }

  return json({ sent: results.length, results });
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
