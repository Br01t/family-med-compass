// Chiave pubblica VAPID — sicura da esporre al client.
// La chiave privata vive solo come secret nell'edge function push-sender.
export const VAPID_PUBLIC_KEY =
  "BMESHU6eBpeooMzkgGj86LBDoDMQva-oAPIkLzj56WrwLP8aOeBg2XenyGz-tRWkRsAOESHNmnzf-CL0oKgXXyM";

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}
