import { supabase } from "./supabase";
import { VAPID_PUBLIC_KEY, urlBase64ToUint8Array } from "./vapid";

/** Registra questo browser per ricevere Web Push per l'utente `userId`. */
export async function subscribeToPush(userId: string): Promise<{ ok: boolean; reason?: string }> {
  if (typeof window === "undefined") return { ok: false, reason: "no-window" };
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, reason: "unsupported" };
  }
  if (Notification.permission === "denied") return { ok: false, reason: "denied" };
  if (Notification.permission !== "granted") {
    const p = await Notification.requestPermission();
    if (p !== "granted") return { ok: false, reason: "denied" };
  }
  if (!supabase) return { ok: false, reason: "no-supabase" };

  // Assicura che ci sia un service worker attivo. In dev/preview lo skippiamo perché sw.js non è registrato.
  let reg = await navigator.serviceWorker.getRegistration();
  if (!reg) {
    try {
      reg = await navigator.serviceWorker.register("/sw.js");
      await reg.update().catch(() => {});
    } catch (err) {
      console.warn("[push] sw register failed:", err);
      return { ok: false, reason: "sw-failed" };
    }
  }
  try {
    reg = await navigator.serviceWorker.ready;
  } catch (err) {
    console.warn("[push] sw ready failed:", err);
    return { ok: false, reason: "sw-not-ready" };
  }

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
    } catch (err) {
      console.warn("[push] subscribe failed:", err);
      return { ok: false, reason: "subscribe-failed" };
    }
  }

  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, reason: "bad-sub" };
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent,
    },
    { onConflict: "endpoint" },
  );
  if (error) {
    console.warn("[push] save subscription failed:", error.message);
    return { ok: false, reason: error.message };
  }
  return { ok: true };
}

/** Invoca l'edge function push-sender per notificare un utente su tutti i suoi dispositivi. */
export async function sendPushToUser(payload: {
  targetUserId: string;
  title: string;
  body?: string;
  icon?: string;
  image?: string;
  url?: string;
  tag?: string;
  requireInteraction?: boolean;
  isAlarm?: boolean;
}): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.functions.invoke("push-sender", { body: payload });
  } catch (err) {
    console.warn("[push] send failed:", err);
  }
}

/** Ritorna true se il browser corrente ha una subscription registrata sul server per `userId`. */
export async function isSubscribedOnThisDevice(userId: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  if (!supabase) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return false;
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint")
    .eq("user_id", userId)
    .eq("endpoint", sub.endpoint)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

/** Rimuove la subscription sia dal browser che dal server. */
export async function unsubscribeFromPush(userId: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    if (supabase) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .eq("user_id", userId)
        .eq("endpoint", sub.endpoint);
    }
    await sub.unsubscribe();
  }
  return true;
}

