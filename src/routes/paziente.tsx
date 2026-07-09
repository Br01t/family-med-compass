import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Bell,
  Check,
  ChevronRight,
  Clock,
  LogOut,
  Package,
  Pill,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useFamilyMed } from "@/lib/store";
import {
  formatDateLong,
  formatTime,
  getDosesForPatientOnDate,
  recurrenceLabel,
  statusDot,
  statusLabel,
  type ScheduledDose,
} from "@/lib/therapy";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/paziente")({
  head: () => ({
    meta: [
      { title: "La tua giornata — FamilyMed" },
      {
        name: "description",
        content: "Vista paziente: timeline delle cure, azioni in tempo reale e riassunto delle terapie.",
      },
    ],
  }),
  component: PatientPage,
});

function PatientPage() {
  const navigate = useNavigate();
  const {
    data,
    user,
    userProfile,
    loadingAuth,
    confirmDose,
    skipDose,
    snoozeDose,
    logout,
  } = useFamilyMed();

  const patient =
    (user && data?.patients?.find((p) => p.userId === user.id)) ??
    data?.patients?.find((p) => p.id === data.currentPatientId) ??
    data?.patients?.[0];

  // Tick ogni 30s per aggiornare gli stati derivati (reminder → due → late)
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  const now = new Date();
  void tick;

  // Loading / recovery skeleton
  if (loadingAuth || (user && userProfile?.role === "paziente" && !patient)) {
    return (
      <div className="min-h-screen grid place-items-center bg-background px-6">
        <div className="w-full max-w-md space-y-3">
          <div className="h-8 w-2/3 animate-pulse rounded-lg bg-muted" />
          <div className="h-40 animate-pulse rounded-3xl bg-muted/70" />
          <div className="h-24 animate-pulse rounded-2xl bg-muted/50" />
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="max-w-md rounded-3xl border border-border/60 bg-card p-8 text-center shadow-card">
          <p className="text-lg font-black tracking-tight">Ancora nessun paziente</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Il tuo profilo sarà pronto appena riceverai l'accesso da un caregiver.
          </p>
          {user && (
            <Button
              variant="outline"
              className="mt-6"
              onClick={async () => {
                await logout();
                navigate({ to: "/login" });
              }}
            >
              <LogOut className="mr-2 size-4" /> Esci
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Timeline ordinata "più imminente prima":
  //  1) dose attiva ora (reminder / due / snoozed / late)
  //  2) dosi future in ordine ascendente
  //  3) dosi già passate (taken / skipped / missed) in ordine discendente
  const allDoses = getDosesForPatientOnDate(data, patient.id, now, now);
  const doses = allDoses.slice().sort((a, b) => {
    const rank = (d: ScheduledDose) => {
      const inActive =
        d.status === "reminder" ||
        d.status === "due" ||
        d.status === "snoozed" ||
        d.status === "late";
      if (inActive) return 0;
      if (d.scheduledAt.getTime() >= now.getTime()) return 1;
      return 2;
    };
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 2) return b.scheduledAt.getTime() - a.scheduledAt.getTime();
    return a.scheduledAt.getTime() - b.scheduledAt.getTime();
  });
  const activeTherapies = data.therapies.filter(
    (t) => t.patientId === patient.id && t.active && !t.suspended,
  );
  const firstName = patient.name.split(" ")[0];

  const greeting =
    now.getHours() < 12
      ? "Buongiorno"
      : now.getHours() < 18
        ? "Buon pomeriggio"
        : "Buonasera";

  const takenToday = doses.filter((d) => d.status === "taken").length;
  const totalToday = doses.length;
  const progressPct = totalToday === 0 ? 0 : Math.round((takenToday / totalToday) * 100);

  // "Attiva ora": finestra dinamica basata su reminderIntervals[0] della terapia.
  // Include anche dosi "snoozed": vanno mostrate finché non scade il ritardo massimo.
  const activeDose = doses.find((d) => {
    if (d.status === "taken" || d.status === "skipped" || d.status === "missed") return false;
    if (d.status === "snoozed") {
      const snoozedUntil = d.event?.snoozedUntil ? new Date(d.event.snoozedUntil).getTime() : 0;
      const hardDeadline = snoozedUntil + (d.therapy.timeoutMinutes ?? 10) * 60_000;
      return now.getTime() <= hardDeadline;
    }
    const preMin = Math.abs(d.therapy.reminderIntervals?.[0] ?? 10);
    const diffMin = (d.scheduledAt.getTime() - now.getTime()) / 60000;
    return diffMin <= preMin && diffMin >= -180;
  });


  const handleLogout = async () => {
    await logout();
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-xl items-center justify-between px-5 pt-5">
        <Link to="/" className="flex items-center gap-2 font-black tracking-tight">
          <span className="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Pill className="size-4" />
          </span>
          FamilyMed
        </Link>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" asChild aria-label="Notifiche">
            <Link to="/notifiche">
              <Bell className="size-5" />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" asChild aria-label="Impostazioni">
            <Link to="/impostazioni"><Settings className="size-5" /></Link>
          </Button>
          <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Esci">
            <LogOut className="size-5" />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-5 pb-24 pt-4">
        {/* Hero */}
        <section className="fm-reveal">
          <p className="text-2xl text-muted-foreground">{greeting},</p>
          <h1 className="text-5xl font-black tracking-tight">{firstName}</h1>
          <p className="mt-2 text-base capitalize text-muted-foreground">
            {formatDateLong(now)} · {formatTime(now)}
          </p>

          {totalToday > 0 && (
            <div className="mt-5 rounded-2xl border border-border/60 bg-surface-muted p-4">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
                  Progresso di oggi
                </p>
                <p className="font-mono text-sm font-bold">
                  {takenToday}/{totalToday}
                </p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
        </section>

        {/* Azione attiva ora */}
        {activeDose && (
          <ActiveDoseCard
            dose={activeDose}
            now={now}
            onConfirm={() => {
              confirmDose({
                therapyId: activeDose.therapy.id,
                scheduledAt: activeDose.scheduledAt,
                confirmedBy: patient.id,
              });
              toast.success(`${activeDose.therapy.name} confermata`, {
                description: `Presa alle ${formatTime(new Date())}`,
              });
            }}
            onSnooze={() => {
              snoozeDose({
                therapyId: activeDose.therapy.id,
                scheduledAt: activeDose.scheduledAt,
                minutes: 10,
              });
              toast(`Ritarda di 10 min`, { description: activeDose.therapy.name });
            }}
            onSkip={() => {
              skipDose({
                therapyId: activeDose.therapy.id,
                scheduledAt: activeDose.scheduledAt,
              });
              toast(`Dose saltata`, { description: activeDose.therapy.name });
            }}
          />
        )}

        {/* Timeline giornaliera */}
        <section className="mt-10 fm-reveal [animation-delay:120ms]">
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            Timeline di oggi
          </h2>

          {activeTherapies.length === 0 ? (
            <EmptyTherapies name={firstName} />
          ) : doses.length === 0 ? (
            <div className="mt-4 rounded-3xl border border-border/60 bg-surface-muted p-8 text-center">
              <div className="mx-auto grid size-14 place-items-center rounded-full bg-success/15 text-success">
                <Sparkles className="size-7" />
              </div>
              <p className="mt-4 text-xl font-black">Oggi niente medicine</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Le tue terapie non prevedono dosi per oggi. Goditi la giornata.
              </p>
            </div>
          ) : (
            <ol className="mt-4 space-y-3">
              {doses.map((dose, idx) => (
                <TimelineItem
                  key={dose.id}
                  dose={dose}
                  isLast={idx === doses.length - 1}
                  isActive={dose.id === activeDose?.id}
                />
              ))}
            </ol>
          )}
        </section>

        {/* Riassunto terapie */}
        {activeTherapies.length > 0 && (
          <section className="mt-10 fm-reveal [animation-delay:200ms]">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
                Le mie terapie
              </h2>
              <Link
                to="/le-mie-terapie"
                className="text-xs font-semibold text-primary hover:underline"
              >
                Vedi tutto
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {activeTherapies.map((t) => {
                const low = t.pillsRemaining <= t.lowStockThreshold;
                return (
                  <Link
                    key={t.id}
                    to="/le-mie-terapie"
                    className="flex items-center gap-4 rounded-2xl border border-border/60 bg-card p-4 shadow-card transition hover:border-primary/60"
                  >
                    <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
                      <Pill className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-black">{t.name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {t.dosage} · {recurrenceLabel(t.recurrence)} ·{" "}
                        {t.times.join(", ")}
                      </p>
                      <p
                        className={cn(
                          "mt-1 flex items-center gap-1 text-xs",
                          low ? "font-semibold text-accent" : "text-muted-foreground",
                        )}
                      >
                        <Package className="size-3" />
                        {t.pillsRemaining} pillole rimanenti
                        {low && " · scorta bassa"}
                      </p>
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <div className="mt-12 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Pill className="size-4" /> FamilyMed · {patient.name}
        </div>
      </main>
    </div>
  );
}

function ActiveDoseCard({
  dose,
  now,
  onConfirm,
  onSnooze,
  onSkip,
}: {
  dose: ScheduledDose;
  now: Date;
  onConfirm: () => void;
  onSnooze: () => void;
  onSkip: () => void;
}) {
  const isLate = dose.status === "late";
  const isReminder = dose.status === "reminder";
  const isSnoozed = dose.status === "snoozed";
  // Le azioni si sbloccano solo dall'orario stabilito in poi.
  const canAct = now.getTime() >= dose.scheduledAt.getTime();
  const minutesToScheduled = Math.max(
    0,
    Math.ceil((dose.scheduledAt.getTime() - now.getTime()) / 60000),
  );

  // Countdown "ultimo momento utile" per dose rimandata.
  const timeoutMin = dose.therapy.timeoutMinutes ?? 10;
  const snoozedUntilMs = dose.event?.snoozedUntil
    ? new Date(dose.event.snoozedUntil).getTime()
    : 0;
  const hardDeadlineMs = snoozedUntilMs + timeoutMin * 60_000;
  const msToHardDeadline = hardDeadlineMs - now.getTime();
  const hardMM = Math.max(0, Math.floor(msToHardDeadline / 60000));
  const hardSS = Math.max(0, Math.floor((msToHardDeadline % 60000) / 1000));
  const snoozedCritical = msToHardDeadline <= 2 * 60_000;

  return (
    <section
      className={cn(
        "fm-reveal mt-8 rounded-3xl border-l-8 bg-card p-6 shadow-lift ring-1 ring-border [animation-delay:60ms]",
        isLate ? "border-accent" : isSnoozed ? "border-warning" : isReminder ? "border-warning" : "border-primary",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest",
            isLate
              ? "bg-accent-soft text-accent"
              : isSnoozed
                ? "bg-warning/20 text-warning-foreground"
                : !canAct
                  ? "bg-secondary text-muted-foreground"
                  : isReminder
                    ? "bg-warning/20 text-warning-foreground"
                    : "bg-primary-soft text-primary",
          )}
        >
          {isSnoozed ? "Rimandata" : isLate ? "In ritardo" : canAct ? "Adesso" : "In arrivo"}
        </span>
        <span className="flex items-center gap-1 font-mono text-sm text-muted-foreground">
          <Clock className="size-4" /> {formatTime(dose.scheduledAt)}
        </span>
      </div>

      {isSnoozed && snoozedUntilMs > 0 && (
        <div
          className={cn(
            "mt-4 rounded-2xl border-2 p-4 text-center",
            snoozedCritical
              ? "border-destructive bg-destructive/10"
              : "border-warning bg-warning/10",
          )}
        >
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Ultimo momento per confermare
          </p>
          <p
            className={cn(
              "mt-1 text-4xl font-black tabular-nums",
              snoozedCritical ? "text-destructive" : "text-warning-foreground",
            )}
          >
            {String(hardMM).padStart(2, "0")}:{String(hardSS).padStart(2, "0")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Se non confermi entro questo tempo, la dose sarà segnata come dimenticata
            e verrai contattato da un familiare.
          </p>
        </div>
      )}

      <div className="mt-4 flex items-start gap-4">
        {dose.therapy.photoPackage ? (
          <img
            src={dose.therapy.photoPackage}
            alt={dose.therapy.name}
            className="size-20 shrink-0 rounded-2xl object-cover ring-1 ring-border"
          />
        ) : (
          <div className="grid size-20 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
            <Pill className="size-8" />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="truncate text-3xl font-black leading-tight">
            {dose.therapy.name}
          </h3>
          <p className="text-base text-muted-foreground">
            {dose.therapy.dosage} · {dose.therapy.quantity} compressa
            {dose.therapy.quantity > 1 ? "e" : ""}
          </p>
          {dose.therapy.notes && (
            <p className="mt-1 text-sm italic text-muted-foreground">
              {dose.therapy.notes}
            </p>
          )}
        </div>
      </div>

      {!canAct && (
        <p className="mt-5 rounded-2xl bg-secondary/60 px-4 py-3 text-center text-sm font-semibold text-muted-foreground">
          Puoi confermare o rimandare solo dall'orario stabilito
          {minutesToScheduled > 0
            ? ` (tra ${minutesToScheduled} min, alle ${formatTime(dose.scheduledAt)})`
            : ""}
          .
        </p>
      )}

      <button
        onClick={onConfirm}
        disabled={!canAct}
        aria-disabled={!canAct}
        className="mt-6 h-20 w-full rounded-2xl bg-primary text-xl font-black text-primary-foreground shadow-lift transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none disabled:active:scale-100"
      >
        Ho preso la medicina
      </button>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={onSnooze}
          disabled={!canAct}
          aria-disabled={!canAct}
          className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface py-3 text-sm font-semibold text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-surface"
        >
          <Clock className="size-4" /> Ritarda 10 min
        </button>
        <button
          onClick={onSkip}
          disabled={!canAct}
          aria-disabled={!canAct}
          className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <X className="size-4" /> Salta
        </button>
      </div>
    </section>
  );
}

function TimelineItem({
  dose,
  isLast,
  isActive,
}: {
  dose: ScheduledDose;
  isLast: boolean;
  isActive: boolean;
}) {
  const done = dose.status === "taken" || dose.status === "skipped";

  return (
    <li className="relative flex gap-4">
      {/* Rail */}
      <div className="relative flex w-8 shrink-0 flex-col items-center">
        <div
          className={cn(
            "mt-2 grid size-6 place-items-center rounded-full ring-4 ring-background",
            statusDot[dose.status],
          )}
        >
          {dose.status === "taken" && (
            <Check className="size-3.5 text-success-foreground" />
          )}
          {dose.status === "skipped" && (
            <X className="size-3.5 text-destructive-foreground" />
          )}
        </div>
        {!isLast && <div className="mt-1 flex-1 w-px bg-border" />}
      </div>

      <div
        className={cn(
          "flex-1 rounded-2xl border p-4 transition",
          isActive
            ? "border-primary bg-primary-soft/40 shadow-card"
            : done
              ? "border-border/40 bg-surface-muted"
              : "border-border/60 bg-card",
        )}
      >
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-mono text-sm font-bold">
            {formatTime(dose.scheduledAt)}
          </p>
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {statusLabel[dose.status]}
          </span>
        </div>
        <p
          className={cn(
            "mt-1 truncate font-black",
            done ? "text-muted-foreground line-through" : "text-foreground",
          )}
        >
          {dose.therapy.name}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {dose.therapy.dosage} · {dose.therapy.quantity} compressa
          {dose.therapy.quantity > 1 ? "e" : ""}
        </p>
      </div>
    </li>
  );
}

function EmptyTherapies({ name }: { name: string }) {
  return (
    <div className="mt-4 rounded-3xl border border-dashed border-border bg-surface-muted p-8 text-center">
      <div className="mx-auto grid size-16 place-items-center rounded-full bg-primary-soft text-primary">
        <Pill className="size-8" />
      </div>
      <p className="mt-4 text-xl font-black">Nessuna terapia assegnata</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Ciao {name}! Quando un caregiver ti assegnerà una cura, la troverai qui con
        orari, promemoria e istruzioni.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <Button variant="outline" size="sm" asChild>
          <Link to="/notifiche">
            <Bell className="mr-2 size-4" /> Notifiche
          </Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/impostazioni">Impostazioni</Link>
        </Button>
      </div>
    </div>
  );
}
