import { useEffect, useMemo, useRef, useState } from "react";
import { AlertOctagon, Check, Clock, X } from "lucide-react";
import { useFamilyMed } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { getPrimedAlarmAudioContext } from "@/lib/alarm-audio";

type AlarmNotif = {
  id: string;
  kind: "due" | "final_due";
  title: string;
  message: string | null;
  therapy_id: string | null;
  patient_id: string | null;
  event_id: string | null;
  created_at: string;
};

/**
 * Sveglia insistente per il paziente: quando arriva una notifica `kind='due'`
 * apre un modal fullscreen con suono in loop, vibrazione e wakelock
 * finché il paziente non conferma / rimanda / salta.
 */
export function AlarmRinger() {
  const { user, userProfile, data, confirmDose, snoozeDose, skipDose, markNotificationRead } = useFamilyMed();
  const [alarm, setAlarm] = useState<AlarmNotif | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<{ osc: OscillatorNode; gain: GainNode } | null>(null);
  const vibrateIntervalRef = useRef<number | null>(null);
  const wakeLockRef = useRef<any>(null);

  const isPatient = userProfile?.role === "paziente";

  // Realtime subscription a notifications con kind='due' per questo utente
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
          if (n.kind === "due" || n.kind === "final_due") {
            setAlarm({
              id: n.id,
              kind: n.kind,
              title: n.title,
              message: n.message,
              therapy_id: n.therapy_id,
              patient_id: n.patient_id,
              event_id: n.event_id,
              created_at: n.created_at,
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, isPatient]);

  // Se la notifica "È ora" è già arrivata mentre l'app era chiusa, apri comunque l'allarme.
  useEffect(() => {
    if (!user || !isPatient || alarm) return;
    const due = data.notifications.find(
      (n) => (n.kind === "due" || n.kind === "final_due") && !n.read && (!n.targetUserId || n.targetUserId === user.id),
    );
    if (!due) return;
    setAlarm({
      id: due.id,
      kind: due.kind as "due" | "final_due",
      title: due.title,
      message: due.message,
      therapy_id: due.therapyId ?? null,
      patient_id: due.patientId ?? null,
      event_id: due.eventId ?? null,
      created_at: due.createdAt,
    });
  }, [alarm, data.notifications, isPatient, user]);

  // Avvia suono + vibrazione + wakelock quando l'allarme si apre
  useEffect(() => {
    if (!alarm) return;

    // WakeLock
    if ("wakeLock" in navigator) {
      (navigator as any).wakeLock
        .request("screen")
        .then((wl: any) => (wakeLockRef.current = wl))
        .catch(() => {});
    }

    // Suono in loop (WebAudio, così non serve un file mp3)
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

      // Beep-beep ogni secondo (0.15s on, 0.85s off)
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

    // Vibrazione
    if ("vibrate" in navigator) navigator.vibrate([400, 200, 400, 200, 400]);
    const vib = window.setInterval(() => {
      if ("vibrate" in navigator) navigator.vibrate([400, 200, 400]);
    }, 3000);

    return () => {
      // Ferma tutto
      if (vibrateIntervalRef.current) window.clearInterval(vibrateIntervalRef.current);
      window.clearInterval(vib);
      if (oscRef.current) {
        try {
          oscRef.current.osc.stop();
        } catch {}
        oscRef.current = null;
      }
      if (audioCtxRef.current) {
        audioCtxRef.current = null;
      }
      if ("vibrate" in navigator) navigator.vibrate(0);
      if (wakeLockRef.current) {
        try {
          wakeLockRef.current.release();
        } catch {}
        wakeLockRef.current = null;
      }
    };
  }, [alarm]);

  const therapy = useMemo(
    () => (alarm ? data.therapies.find((t) => t.id === alarm.therapy_id) : undefined),
    [alarm, data.therapies],
  );

  if (!alarm || !isPatient) return null;

  async function handleAction(action: "confirm" | "snooze" | "skip") {
    if (!alarm || !therapy || !user) {
      if (alarm) markNotificationRead(alarm.id);
      setAlarm(null);
      return;
    }
    const scheduledAt = alarm.event_id ? extractScheduledFromEventId(alarm.event_id) : new Date();
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
      } else {
        await skipDose({ therapyId: therapy.id, scheduledAt });
      }
    } catch (err) {
      console.warn("[alarm] action failed:", err);
    }
    markNotificationRead(alarm.id);
    setAlarm(null);
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-3xl border-4 border-primary bg-card p-6 shadow-2xl animate-pulse-slow">
        <div className="flex items-center justify-center gap-3">
          <AlertOctagon className="size-8 text-primary animate-bounce" />
          <p className="text-sm font-black uppercase tracking-widest text-primary">È ora del farmaco</p>
        </div>

        {therapy?.photoDrug && (
          <img
            src={therapy.photoDrug}
            alt=""
            className="mx-auto mt-4 h-40 w-40 rounded-2xl object-cover border-2 border-border"
          />
        )}

        <h2 className="mt-4 text-center text-3xl font-black tracking-tight">
          {therapy?.name ?? alarm.title}
        </h2>
        {therapy && (
          <p className="mt-2 text-center text-lg font-semibold text-muted-foreground">
            {therapy.quantity} unità — {therapy.dosage}
          </p>
        )}
        {alarm.message && (
          <p className="mt-2 text-center text-sm text-muted-foreground">{alarm.message}</p>
        )}

        <div className="mt-6 grid gap-3">
          <Button size="lg" className="h-14 text-lg font-bold" onClick={() => handleAction("confirm")}>
            <Check className="mr-2 size-6" /> Ho preso il farmaco
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-12 font-semibold"
            onClick={() => handleAction("snooze")}
          >
            <Clock className="mr-2 size-5" /> Rimanda di {therapy?.snoozeMinutes ?? 10} min
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="h-10 text-sm text-muted-foreground"
            onClick={() => handleAction("skip")}
          >
            <X className="mr-2 size-4" /> Salta questa dose
          </Button>
        </div>
      </div>
    </div>
  );
}

function extractScheduledFromEventId(eventId: string): Date {
  // formato "e_<therapyId>_<ms>" dallo scheduler
  const parts = eventId.split("_");
  const ms = Number(parts[parts.length - 1]);
  if (Number.isFinite(ms)) return new Date(ms);
  return new Date();
}
