import { useEffect } from "react";

/**
 * Sincronizza il badge sull'icona dell'app (Badging API) con il numero
 * di notifiche non lette. Funziona su Android in Chrome/Edge quando la PWA
 * è installata (Add to Home Screen). Su iOS non è supportato — il fallback
 * è il pallino rosso in-app nella navbar.
 */
export function useAppBadge(unreadCount: number) {
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (!nav.setAppBadge) return;
    try {
      if (unreadCount > 0) {
        void nav.setAppBadge(unreadCount);
      } else {
        void nav.clearAppBadge?.();
      }
    } catch {
      /* no-op */
    }
  }, [unreadCount]);
}
