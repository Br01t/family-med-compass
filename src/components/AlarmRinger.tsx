import { useEffect, useMemo, useRef, useState } from "react";
import { AlertOctagon, Bell, Check, Clock } from "lucide-react";
import { useFamilyMed } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { getPrimedAlarmAudioContext } from "@/lib/alarm-audio";

type ModalNotif = {
  id: string;
  kind: "reminder_pre" | "due" | "reminder_post" | "final_due";
  title: string;
  message: string | null;
  therapy_id: string | null;
  patient_id: string | null;
  event_id: string | null;
  created_at: string;
};

const HANDLED_KEY = "familymed:handledModals:v1";

function loadHandled(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(HANDLED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
function saveHandled(set: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      HANDLED_KEY,
      JSON.stringify(Array.from(set).slice(-500)),
    );
  } catch {}
}

/**
 * Modali in-app per il paziente sostitutivi delle notifiche push:
 *  - `reminder_pre`: card informativa, senza suono, con "Ho capito"
 *  - `due` / `final_due`: sveglia insistente con suono, vibrazione e wakelock
 *
 * Ogni notifica visualizzata viene marcata come letta subito, così non
 * viene riproposta al successivo mount o refresh realtime.
 */
export function AlarmRinger() {
  const {
    user, userProfile, data,
    confirmDose, snoozeDose, skipDose, markNotificationRead,
  } = useFamilyMed();
  const [modal, setModal] = useState<ModalNotif | null>(null);
  const handledRef = useRef<Set<string>>(loadHandled());

  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<{ osc: OscillatorNode; gain: GainNode } | null>(null);
  const vibrateIntervalRef = useRef<number | null>(null);
  const wakeLockRef = useRef<any>(null);

  const isPatient = userProfile?.role === "paziente";
  const isAlarm = modal?.kind === "due" || modal?.kind === "final_due";

  const openModal = (n: ModalNotif) => {
    if (handledRef.current.has(n.id)) return;
    handledRef.current.add(n.id);
    saveHandled(handledRef.current);
    // Mark read immediately: la notifica non deve essere riproposta.
    markNotificationRead(n.id);
    setModal((prev) => {
      if (!prev) return n;
      // Priorità: final_due > due > reminder_pre
      const rank = (k: ModalNotif["kind"]) =>
        k === "final_due" ? 3 : k === "due" ? 2 : 1;
      return rank(n.kind) > rank(prev.kind) ? n : prev;
    });
  };

  // Realtime: nuove notifiche in ingresso
  useEffect(() => {
    if (!supabase || !user || !isPatient) return;
    const channel = supabase
      .channel(`alarm-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `target_user_id=eq.${user.id}`,
        },
        (payload) => {
          const n = payload.new as any;
          if (n.kind !== "reminder_pre" && n.kind !== "due" && n.kind !== "final_due") return;
          openModal({
            id: n.id,
            kind: n.kind,
            title: n.title,
            message: n.message,
            therapy_id: n.therapy_id,
            patient_id: n.patient_id,
            event_id: n.event_id,
            created_at: n.created_at,
          });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, isPatient]);

  // All'apertura dell'app: recupera l'eventuale ultima notifica NON gestita.
  useEffect(() => {
    if (!user || !isPatient || modal) return;
    for (const n of data.notifications) {
      if (n.kind !== "reminder_pre" && n.kind !== "due" && n.kind !== "final_due") continue;
      if (n.targetUserId && n.targetUserId !== user.id) continue;
      if (handledRef.current.has(n.id)) continue;
      if (n.read) {
        // già segnata letta in un'altra sessione: memorizza per non riproporre
        handledRef.current.add(n.id);
        continue;
      }
      openModal({
        id: n.id,
        kind: n.kind as ModalNotif["kind"],
        title: n.title,
        message: n.message,
        therapy_id: n.therapyId ?? null,
        patient_id: n.patientId ?? null,
        event_id: n.eventId ?? null,
        created_at: n.createdAt,
      });
      break;
    }
    saveHandled(handledRef.current);
  }, [modal, data.notifications, isPatient, user]);

  // Sveglia insistente solo per due/final_due
  useEffect(() => {
    if (!modal || !isAlarm) return;

    if ("wakeLock" in navigator) {
      (navigator as any).wakeLock
        .request("screen")
        .then((wl: any) => (wakeLockRef.current = wl))
        .catch(() => {});
    }

    try {
      void getPrimedAlarmAudioContext().then((ctx) => {
        if (!ctx) return;
        audioCtxRef.current = ctx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = 880;
        gain.gain.value = 0;
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        oscRef.current = { osc, gain };
        const beep = () => {
          if (!audioCtxRef.current) return;
          const now = audioCtxRef.current.currentTime;
          gain.gain.cancelScheduledValues(now);
          gain.gain.setValueAtTime(0.001, now);
          gain.gain.exponentialRampToValueAtTime(0.5, now + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        };
        beep();
        const beepInterval = window.setInterval(beep, 1000);
        vibrateIntervalRef.current = beepInterval;
      });
    } catch (err) {
      console.warn("[alarm] audio failed:", err);
    }

    if ("vibrate" in navigator) navigator.vibrate([400, 200, 400, 200, 400]);
    const vib = window.setInterval(() => {
      if ("vibrate" in navigator) navigator.vibrate([400, 200, 400]);
    }, 3000);

    return () => {
      if (vibrateIntervalRef.current) window.clearInterval(vibrateIntervalRef.current);
      window.clearInterval(vib);
      if (oscRef.current) {
        try { oscRef.current.osc.stop(); } catch {}
        oscRef.current = null;
      }
      audioCtxRef.current = null;
      if ("vibrate" in navigator) navigator.vibrate(0);
      if (wakeLockRef.current) {
        try { wakeLockRef.current.release(); } catch {}
        wakeLockRef.current = null;
      }
    };
  }, [modal, isAlarm]);

  const therapy = useMemo(
    () => (modal ? data.therapies.find((t) => t.id === modal.therapy_id) : undefined),
    [modal, data.therapies],
  );

  if (!modal || !isPatient) return null;

  async function handleAction(action: "confirm" | "snooze" | "skip" | "dismiss") {
    if (!modal) return;
    if (action !== "dismiss" && therapy && user) {
      const scheduledAt = modal.event_id
        ? extractScheduledFromEventId(modal.event_id)
        : new Date();
      try {
        if (action === "confirm") {
          await confirmDose({
            therapyId: therapy.id,
            scheduledAt,
            confirmedBy: userProfile?.name ?? "Paziente",
          });
        } else if (action === "snooze") {
          await snoozeDose({
            therapyId: therapy.id,
            scheduledAt,
            minutes: therapy.snoozeMinutes ?? 10,
          });
        } else if (action === "skip") {
          await skipDose({ therapyId: therapy.id, scheduledAt });
        }
      } catch (err) {
        console.warn("[modal] action failed:", err);
      }
    }
    setModal(null);
  }

  // --- Reminder pre: modale leggera ---
  if (modal.kind === "reminder_pre") {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
        <div className="w-full max-w-md rounded-3xl border-2 border-primary/60 bg-card p-6 shadow-xl">
          <div className="flex items-center justify-center gap-3">
            <Bell className="size-7 text-primary" />
            <p className="text-sm font-black uppercase tracking-widest text-primary">
              Promemoria
            </p>
          </div>
          <h2 className="mt-4 text-center text-2xl font-black tracking-tight">
            {therapy?.name ?? modal.title}
          </h2>
          {therapy && (
            <p className="mt-2 text-center text-base font-semibold text-muted-foreground">
              {therapy.quantity} unità — {therapy.dosage}
            </p>
          )}
          {modal.message && (
            <p className="mt-2 text-center text-sm text-muted-foreground">{modal.message}</p>
          )}
          <Button size="lg" className="mt-6 h-14 w-full text-lg font-bold" onClick={() => handleAction("dismiss")}>
            Ho capito
          </Button>
        </div>
      </div>
    );
  }

  // --- Due / Final due: sveglia ---
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-3xl border-4 border-primary bg-card p-6 shadow-2xl animate-pulse-slow">
        <div className="flex items-center justify-center gap-3">
          <AlertOctagon className="size-8 text-primary animate-bounce" />
          <p className="text-sm font-black uppercase tracking-widest text-primary">
            {modal.kind === "final_due" ? "Ultima chiamata" : "È ora del farmaco"}
          </p>
        </div>

        <h2 className="mt-4 text-center text-3xl font-black tracking-tight">
          {therapy?.name ?? modal.title}
        </h2>
        {therapy && (
          <p className="mt-2 text-center text-lg font-semibold text-muted-foreground">
            {therapy.quantity} unità — {therapy.dosage}
          </p>
        )}
        {modal.message && (
          <p className="mt-2 text-center text-sm text-muted-foreground">{modal.message}</p>
        )}

        <div className="mt-6 grid gap-3">
          <Button size="lg" className="h-14 text-lg font-bold" onClick={() => handleAction("confirm")}>
            <Check className="mr-2 size-6" /> Ho preso il farmaco
          </Button>
          {modal.kind === "due" && (
            <Button
              size="lg"
              variant="outline"
              className="h-12 font-semibold"
              onClick={() => handleAction("snooze")}
            >
              <Clock className="mr-2 size-5" /> Rimanda di {therapy?.snoozeMinutes ?? 10} min
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => handleAction("skip")}
          >
            Salta questa dose
          </Button>
          {modal.kind === "final_due" && (
            <p className="text-center text-xs text-muted-foreground">
              Non è più possibile rimandare questa dose.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function extractScheduledFromEventId(eventId: string): Date {
  const parts = eventId.split("_");
  const ms = Number(parts[parts.length - 1]);
  if (Number.isFinite(ms)) return new Date(ms);
  return new Date();
}
