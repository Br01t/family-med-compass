import { useEffect, useRef } from "react";
import { useFamilyMed } from "@/lib/store";
import { getDosesForPatientOnDate } from "@/lib/therapy";
import { notificationService } from "@/lib/services/notifications";

const FIRED_KEY = "familymed:firedNotifications:v2";

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
  const arr = Array.from(fired).slice(-500);
  window.localStorage.setItem(FIRED_KEY, JSON.stringify(arr));
}

// Ri-esportato per retro-compatibilità con /impostazioni
export async function requestNotificationPermission() {
  return notificationService.requestPermission();
}

/**
 * Scheduler in-app.
 * - Reminder T-10 min: notifica silenziosa "Tra 10 min: X"
 * - Al T-0 (±90s): notifica con suono e requireInteraction
 * Lavora finché la tab è aperta o l'app è in PWA. La copertura
 * "app chiusa" è gestita dall'edge function server-side.
 */
export function NotificationScheduler() {
  const { data } = useFamilyMed();
  const firedRef = useRef<Set<string>>(loadFired());

  useEffect(() => {
    if (!notificationService.isSupported()) return;

    const tick = () => {
      if (notificationService.getPermission() !== "granted") return;
      const now = new Date();
      for (const patient of data.patients) {
        const doses = getDosesForPatientOnDate(data, patient.id, now, now);
        for (const dose of doses) {
          if (dose.status === "taken" || dose.status === "skipped") continue;
          const t = dose.therapy;
          const diff = dose.scheduledAt.getTime() - now.getTime();
          const time = dose.scheduledAt.toLocaleTimeString("it-IT", {
            hour: "2-digit", minute: "2-digit",
          });

          // Reminder 10 min prima
          const reminderKey = `${dose.id}#reminder`;
          if (diff <= 10 * 60_000 && diff > 8 * 60_000 && !firedRef.current.has(reminderKey)) {
            void notificationService.notify({
              id: reminderKey,
              title: `⏰ Tra 10 min: ${t.name}`,
              body: `${patient.name} — ${t.dosage} alle ${time}`,
              icon: t.photoDrug,
              image: t.photoPackage,
              requireInteraction: false,
              playSound: false,
              onClickUrl: "/paziente",
            });
            firedRef.current.add(reminderKey);
            saveFired(firedRef.current);
          }

          // Notifica "è ora" ±90s
          const dueKey = `${dose.id}#due`;
          if (diff <= 90_000 && diff >= -60_000 && !firedRef.current.has(dueKey)) {
            void notificationService.notify({
              id: dueKey,
              title: `💊 ${t.name} — ore ${time}`,
              body: `${patient.name}: ${t.quantity ?? 1} unità${t.notes ? `\n${t.notes}` : ""}`,
              icon: t.photoDrug,
              image: t.photoPackage,
              requireInteraction: true,
              playSound: true,
              onClickUrl: "/paziente",
            });
            firedRef.current.add(dueKey);
            saveFired(firedRef.current);
          }
        }
      }
    };

    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [data]);

  return null;
}
