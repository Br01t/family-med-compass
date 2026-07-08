// FamilyMed — push-sender
// Invocata da client o da altre edge (dose-scheduler) per inviare Web Push
// a tutte le subscription registrate per un utente.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@familymed.app";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// CORREZIONE CORS: Lettere maiuscole corrette per gli header accettati
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info, authorization, content-type, X-Client-Info, X-Client-Info",
  "Access-Control-Max-Age": "86400", // Dice al browser di salvare i permessi CORS per 24 ore senza rifare ogni volta il preflight
};

Deno.serve(async (req) => {
  // Gestione Preflight OPTIONS
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: cors });
  }
  
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { 
      status: 405, 
      headers: { ...cors, "Content-Type": "application/json" } 
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad json" }), { 
      status: 400, 
      headers: { ...cors, "Content-Type": "application/json" } 
    });
  }

  const targetUserId = body.targetUserId as string | undefined;
  if (!targetUserId) {
    return new Response(JSON.stringify({ error: "missing targetUserId" }), { 
      status: 400, 
      headers: { ...cors, "Content-Type": "application/json" } 
    });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: subs, error } = await sb
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", targetUserId);
    
  if (error) {
    return new Response(JSON.stringify({ error: `db: ${error.message}` }), { 
      status: 500, 
      headers: { ...cors, "Content-Type": "application/json" } 
    });
  }

  const payload = JSON.stringify({
    title: body.title ?? "FamilyMed",
    body: body.body ?? "",
    icon: body.icon ?? "/icons/icon-192.png",
    image: body.image,
    tag: body.tag,
    url: body.url ?? "/notifiche",
    requireInteraction: body.requireInteraction ?? body.isAlarm ?? false,
    isAlarm: body.isAlarm ?? false,
  });

  const results: any[] = [];
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        {
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth },
        },
        payload,
        { TTL: 60, urgency: body.isAlarm ? "high" : "normal" },
      );
      results.push({ id: s.id, ok: true });
    } catch (err: any) {
      const status = err?.statusCode;
      if (status === 404 || status === 410) {
        await sb.from("push_subscriptions").delete().eq("id", s.id);
      }
      results.push({ id: s.id, ok: false, status, err: err?.message });
    }
  }

  return new Response(JSON.stringify({ sent: results.length, results }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});