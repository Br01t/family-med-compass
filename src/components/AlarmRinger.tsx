import { useEffect, useMemo, useRef, useState } from "react";
import { AlertOctagon, Bell, Check, Clock, Timer } from "lucide-react";
import { useFamilyMed } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { getPrimedAlarmAudioContext } from "@/lib/alarm-audio";

function formatMMSS(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "00:00";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

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
  const [busy, setBusy] = useState(false);
  const handledRef = useRef<Set<string>>(loadHandled());


  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<{ osc: OscillatorNode; gain: GainNode } | null>(null);
  const vibrateIntervalRef = useRef<number | null>(null);
  const wakeLockRef = useRef<any>(null);

  const isPatient = userProfile?.role === "paziente";
  const isAlarm =
    modal?.kind === "due" ||
    modal?.kind === "reminder_post" ||
    modal?.kind === "final_due";

  const openModal = (n: ModalNotif) => {
    if (handledRef.current.has(n.id)) return;
    handledRef.current.add(n.id);
    saveHandled(handledRef.current);
    // NON marchiamo qui come letta: la notifica deve restare nel centro
    // notifiche del paziente finché non compie un'azione sulla modale.
    setModal((prev) => {
      if (!prev) {
        return n;
      }
      // Priorità: final_due > reminder_post > due > reminder_pre.
      // Quando sostituiamo una modale precedente, la marchiamo letta
      // (l'utente non la vedrà più; la successiva è più urgente).
      const rank = (k: ModalNotif["kind"]) =>
        k === "final_due" ? 4 : k === "reminder_post" ? 3 : k === "due" ? 2 : 1;
      if (rank(n.kind) > rank(prev.kind)) {
        markNotificationRead(prev.id);
        return n;
      }
      return prev;
    });
  };



  // All'apertura dell'app: recupera l'eventuale ultima notifica NON gestita.
  useEffect(() => {
    if (!user || !isPatient || modal) return;
    for (const n of data.notifications) {
      if (n.kind !== "reminder_pre" && n.kind !== "due" && n.kind !== "reminder_post" && n.kind !== "final_due") continue;
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

  const scheduledAt = useMemo(
    () => (modal?.event_id ? extractScheduledFromEventId(modal.event_id) : new Date()),
    [modal?.event_id],
  );

  // Recupera l'evento per leggere snoozed_until reale (fonte di verità per il
  // countdown della modale final_due).
  const eventForModal = useMemo(() => {
    if (!modal) return undefined;
    return data.events.find(
      (e) =>
        e.therapyId === modal.therapy_id &&
        Math.abs(new Date(e.scheduledAt).getTime() - scheduledAt.getTime()) < 60_000,
    );
  }, [modal, data.events, scheduledAt]);

  // Tick al secondo per aggiornare i countdown
  const [nowTs, setNowTs] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!modal) return;
    const id = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [modal]);

  // Auto-skip: se il countdown "tempo per confermare" (due/reminder_post) o
  // "ultima occasione" (final_due) arriva a zero senza un'azione
  // dell'utente, la dose viene segnata automaticamente come saltata
  // (equivalente a "dimenticata"). Così la modale non resta bloccata su
  // 00:00 e la dose smette subito di comparire come "rimandata" invece di
  // aspettare il prossimo giro del cron server-side (dose-scheduler) che
  // la marcherebbe "missed" con ritardo.
  const autoHandledIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!modal || !therapy) return;
    if (
      modal.kind !== "final_due" &&
      modal.kind !== "due" &&
      modal.kind !== "reminder_post"
    ) return;
    if (autoHandledIdRef.current === modal.id) return;

    const postMinLocal = Math.max(1, Number(therapy.postReminderMinutes ?? 5));
    const snoozedUntilLocal = eventForModal?.snoozedUntil
      ? new Date(eventForModal.snoozedUntil).getTime()
      : null;
    // final_due: la scadenza è lo snoozed_until reale (o, in sua assenza,
    // orario + postReminderMinutes). due/reminder_post: orario + postReminderMinutes.
    const deadline =
      modal.kind === "final_due"
        ? snoozedUntilLocal ?? scheduledAt.getTime() + postMinLocal * 60_000
        : scheduledAt.getTime() + postMinLocal * 60_000;

    if (nowTs < deadline) return;

    autoHandledIdRef.current = modal.id;
    void handleAction("skip");
  }, [modal, therapy, eventForModal, scheduledAt, nowTs, handleAction]);

  if (!modal || !isPatient) return null;

  const postMin = Math.max(1, Number(therapy?.postReminderMinutes ?? 5));
  // Il rimando dura ESATTAMENTE quanto il postReminderMinutes della terapia,
  // ed è concesso una sola volta. Dopo lo scadere, la dose è dimenticata.
  const snoozeMin = postMin;
  const timeoutMin = snoozeMin;
  const reminderBeforeMin = Math.max(1, Math.abs(therapy?.reminderIntervals?.[0] ?? 10));

  // Ha già rimandato una volta?
  const alreadySnoozed = Boolean(
    eventForModal?.snoozedUntil ||
      eventForModal?.status === "snoozed" ||
      eventForModal?.timeline?.some((t) => t.kind === "snoozed"),
  );

  const msToScheduled = scheduledAt.getTime() - nowTs;
  const msToPostDeadline = scheduledAt.getTime() + postMin * 60_000 - nowTs;
  const msToMissedDeadline = scheduledAt.getTime() + timeoutMin * 60_000 - nowTs;
  // Final due: deadline = snoozed_until (nessun timeout extra).
  const snoozedUntilMs = eventForModal?.snoozedUntil
    ? new Date(eventForModal.snoozedUntil).getTime()
    : null;
  const finalDueStartRef = useRef<number | null>(null);
  if (modal.kind === "final_due" && finalDueStartRef.current === null) {
    finalDueStartRef.current = nowTs;
  }
  if (modal.kind !== "final_due") {
    finalDueStartRef.current = null;
  }
  const msFinalRemaining = snoozedUntilMs
    ? snoozedUntilMs - nowTs
    : finalDueStartRef.current !== null
      ? finalDueStartRef.current + snoozeMin * 60_000 - nowTs
      : snoozeMin * 60_000;

  async function handleAction(action: "confirm" | "snooze" | "skip" | "dismiss") {
    if (!modal || busy) return;
    setBusy(true);
    try {
      // Marca sempre la notifica come letta dopo un'azione utente.
      markNotificationRead(modal.id);
      if (action !== "dismiss" && therapy && user) {
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
              minutes: therapy.postReminderMinutes ?? 5,
            });
          } else if (action === "skip") {
            await skipDose({ therapyId: therapy.id, scheduledAt });
          }
        } catch (err) {
          console.warn("[modal] action failed:", err);
        }
      }
      setModal(null);
    } finally {
      setBusy(false);
    }
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

          {/* Timer countdown all'orario della dose */}
          <div className="mt-4 rounded-2xl bg-primary-soft p-4 text-center">
            <div className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
              <Timer className="size-4" /> Manca all'orario della dose
            </div>
            <div className="mt-1 text-3xl font-black tabular-nums text-primary">
              {formatMMSS(msToScheduled)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Preavviso: {reminderBeforeMin} min · Dose alle{" "}
              {scheduledAt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>

        </div>
      </div>
    );
  }

  // --- Due / Reminder post / Final due: sveglia ---
  const isFinal = modal.kind === "final_due";
  const alarmMsRemaining = isFinal ? msFinalRemaining : msToMissedDeadline;
  const alarmCritical = alarmMsRemaining <= 2 * 60_000;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-3xl border-4 border-primary bg-card p-6 shadow-2xl animate-pulse-slow">
        <div className="flex items-center justify-center gap-3">
          <AlertOctagon className="size-8 text-primary animate-bounce" />
          <p className="text-sm font-black uppercase tracking-widest text-primary">
            {modal.kind === "final_due" ? "Ultima chiamata" : modal.kind === "reminder_post" ? "Non l'hai ancora preso" : "È ora del farmaco"}
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

        {/* Pannello timer */}
        <div className="mt-4 space-y-2 rounded-2xl border border-border/60 bg-secondary/30 p-4">
          {!isFinal && (
            <>
              <TimerRow
                label="Tempo per confermare"
                value={formatMMSS(msToPostDeadline)}
                hint={`fino a ${postMin} min dopo l'orario`}
                tone={msToPostDeadline > 0 ? "warning" : "muted"}
              />
              <TimerRow
                label="Ritardo massimo (poi dimenticata)"
                value={formatMMSS(msToMissedDeadline)}
                hint={`totale ${timeoutMin} min dall'orario`}
                tone={alarmCritical ? "danger" : "primary"}
              />
              <p className="pt-1 text-[11px] text-muted-foreground">
                {alreadySnoozed
                  ? "Hai già rimandato questa dose: non puoi rimandarla di nuovo."
                  : `Puoi rimandare UNA sola volta di ${snoozeMin} min. Dopo, la dose sarà segnata come dimenticata.`}
              </p>
            </>
          )}
          {isFinal && (
            <>
              <TimerRow
                label="Ultima occasione: confermare ora"
                value={formatMMSS(msFinalRemaining)}
                hint="Allo scadere la dose sarà segnata come dimenticata"
                tone={alarmCritical ? "danger" : "primary"}
              />
              <p className="pt-1 text-[11px] text-muted-foreground">
                Non puoi più rimandare questa dose.
              </p>
            </>
          )}
        </div>

        <div className="mt-6 grid gap-3">
          <Button size="lg" className="h-14 text-lg font-bold" onClick={() => handleAction("confirm")} disabled={busy}>
            <Check className="mr-2 size-6" /> Ho preso il farmaco
          </Button>
          {(modal.kind === "due" || modal.kind === "reminder_post") && !alreadySnoozed && (
            <Button
              size="lg"
              variant="outline"
              className="h-12 font-semibold"
              onClick={() => handleAction("snooze")} disabled={busy}
            >
              <Clock className="mr-2 size-5" /> Rimanda di {snoozeMin} min (ultima volta)
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => handleAction("skip")} disabled={busy}
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

function TimerRow({
  label, value, hint, tone,
}: {
  label: string; value: string; hint?: string;
  tone: "primary" | "warning" | "danger" | "muted";
}) {
  const toneCls =
    tone === "danger" ? "text-destructive"
    : tone === "warning" ? "text-warning-foreground"
    : tone === "primary" ? "text-primary"
    : "text-muted-foreground";
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      <div className={`shrink-0 text-2xl font-black tabular-nums ${toneCls}`}>{value}</div>
    </div>
  );
}

function extractScheduledFromEventId(eventId: string): Date {
  const parts = eventId.split("_");
  const ms = Number(parts[parts.length - 1]);
  if (Number.isFinite(ms)) return new Date(ms);
  return new Date();
}