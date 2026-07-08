import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { Notification } from "@/lib/mock-data";

/**
 * Mostra un toast quando arrivano NUOVE notifiche nella lista (rispetto
 * al render precedente). Serve come rinforzo in-app della push, e come
 * unico canale visivo quando la push non arriva (browser blocca, PWA non
 * installata, iOS, ecc.).
 */
export function useNotificationToasts(notifications: Notification[] | undefined) {
  const seenIds = useRef<Set<string>>(new Set());
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (!notifications) return;
    // Alla prima esecuzione registro le esistenti senza mostrare toast.
    if (!bootstrapped.current) {
      for (const n of notifications) seenIds.current.add(n.id);
      bootstrapped.current = true;
      return;
    }
    const fresh = notifications.filter((n) => !seenIds.current.has(n.id));
    for (const n of fresh) {
      seenIds.current.add(n.id);
      const opts = {
        description: n.message,
        duration: n.severity === "alert" ? 12000 : 6000,
      };
      if (n.severity === "alert") toast.error(n.title, opts);
      else if (n.severity === "warning") toast.warning(n.title, opts);
      else toast.info(n.title, opts);
    }
  }, [notifications]);
}
