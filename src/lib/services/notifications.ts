/**
 * Astrazione notifiche: unica interfaccia usata dall'app.
 * - Web (attuale): Notification API + <audio> HTML5.
 * - Capacitor (futuro): stessa API, backing con @capacitor/local-notifications
 *   e @capacitor/push-notifications. Nessun componente da modificare.
 */

export type NotificationPayload = {
  id?: string;
  title: string;
  body?: string;
  icon?: string;
  image?: string;
  requireInteraction?: boolean;
  playSound?: boolean;
  onClickUrl?: string;
};

export interface NotificationService {
  isSupported(): boolean;
  getPermission(): "granted" | "denied" | "default" | "unsupported";
  requestPermission(): Promise<"granted" | "denied" | "default" | "unsupported">;
  notify(payload: NotificationPayload): Promise<void>;
  playSound(): Promise<void>;
}

class WebNotificationService implements NotificationService {
  private audio: HTMLAudioElement | null = null;

  isSupported(): boolean {
    return typeof window !== "undefined" && "Notification" in window;
  }

  getPermission() {
    if (!this.isSupported()) return "unsupported" as const;
    return Notification.permission;
  }

  async requestPermission() {
    if (!this.isSupported()) return "unsupported" as const;
    if (Notification.permission !== "default") return Notification.permission;
    return await Notification.requestPermission();
  }

  async notify(payload: NotificationPayload): Promise<void> {
    if (!this.isSupported() || Notification.permission !== "granted") return;
    try {
      const n = new Notification(payload.title, {
        body: payload.body,
        icon: payload.icon ?? "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        // @ts-expect-error image is a non-standard field
        image: payload.image,
        tag: payload.id,
        requireInteraction: payload.requireInteraction ?? true,
        vibrate: [200, 100, 200] as any,
      });
      n.onclick = () => {
        window.focus();
        if (payload.onClickUrl) window.location.href = payload.onClickUrl;
        n.close();
      };
      if (payload.playSound) void this.playSound();
    } catch (e) {
      console.warn("[Notif] error", e);
    }
  }

  async playSound(): Promise<void> {
    if (typeof window === "undefined") return;
    try {
      if (!this.audio) {
        // Suono breve incorporato (beep sintetico via WebAudio se assente il file)
        this.audio = new Audio("/sounds/reminder.mp3");
        this.audio.volume = 0.9;
      }
      await this.audio.play().catch(async () => {
        // Fallback: beep sintetico
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = 880;
        gain.gain.value = 0.15;
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        setTimeout(() => { osc.stop(); ctx.close(); }, 400);
      });
    } catch (e) {
      console.warn("[Notif sound] error", e);
    }
  }
}

// Singleton — sostituirlo con CapacitorNotificationService quando integriamo Capacitor.
export const notificationService: NotificationService = new WebNotificationService();
