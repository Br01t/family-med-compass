import { useEffect, useRef } from "react";
import { useFamilyMed } from "@/lib/store";
import { getDosesForPatientOnDate } from "@/lib/therapy";

const FIRED_KEY = "familymed:firedNotifications:v1";

function loadFired(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(FIRED_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}
function saveFired(fired: Set<string>) {
  // Mantiene solo gli ultimi ~500 per non crescere all'infinito
  const arr = Array.from(fired).slice(-500);
  window.localStorage.setItem(FIRED_KEY, JSON.stringify(arr));
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  return await Notification.requestPermission();
}

/**
 * Scheduler in-app per notifiche web dei farmaci.
 * Attivo finché l'app è aperta (o installata come PWA e con la tab viva).
 * Ogni 30s ispeziona le dosi del paziente corrente e mostra una notifica
 * quando l'ora programmata è entro ±90s e non è ancora stata mostrata.
 */
export function NotificationScheduler() {
  const { data } = useFamilyMed();
  const firedRef = useRef<Set<string>>(loadFired());

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    const tick = () => {
      if (Notification.permission !== "granted") return;
      const now = new Date();
      for (const patient of data.patients) {
        const doses = getDosesForPatientOnDate(data, patient.id, now, now);
        for (const dose of doses) {
          if (dose.status === "taken" || dose.status === "skipped") continue;
          const diff = dose.scheduledAt.getTime() - now.getTime();
          // finestra: da -60s a +90s attorno all'ora esatta
          if (diff > 90_000 || diff < -60_000) continue;
          if (firedRef.current.has(dose.id)) continue;

          const t = dose.therapy;
          const time = dose.scheduledAt.toLocaleTimeString("it-IT", {
            hour: "2-digit",
            minute: "2-digit",
          });
          try {
            const n = new Notification(
              `💊 ${t.name} ${t.dosage} — ore ${time}`,
              {
                body:
                  `${patient.name}: ${t.quantity} unità` +
                  (t.notes ? `\n${t.notes}` : ""),
                icon: t.photoDrug || "/icons/icon-192.png",
                badge: "/icons/icon-192.png",
                image: t.photoPackage || t.photoDrug || undefined,
                tag: dose.id,
                requireInteraction: true,
                // @ts-expect-error vibrate è supportato su Android
                vibrate: [200, 100, 200],
              },
            );
            n.onclick = () => {
              window.focus();
              window.location.href = "/paziente";
              n.close();
            };
          } catch (e) {
            console.warn("[Notif] errore:", e);
          }
          firedRef.current.add(dose.id);
          saveFired(firedRef.current);
        }
      }
    };

    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [data]);

  return null;
}
