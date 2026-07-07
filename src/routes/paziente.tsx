import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Bell,
  Check,
  ChevronRight,
  Clock,
  LogOut,
  Package,
  Pill,
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

  const now = new Date();

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

  const doses = getDosesForPatientOnDate(data, patient.id, now, now);
  const activeTherapies = data.therapies.filter(
    (t) => t.patientId === patient.id && t.active && !t.suspended,
  );
  const firstName = patient.name.split(" ")[0];
  const unreadCount = data.notifications.filter(
    (n) => !n.read && (!n.patientId || n.patientId === patient.id),
  ).length;

  const greeting =
    now.getHours() < 12
      ? "Buongiorno"
      : now.getHours() < 18
        ? "Buon pomeriggio"
        : "Buonasera";

  const takenToday = doses.filter((d) => d.status === "taken").length;
  const totalToday = doses.length;
  const progressPct = totalToday === 0 ? 0 : Math.round((takenToday / totalToday) * 100);

  // "Attiva ora": pending entro ±15 min o già in ritardo
  const activeDose = doses.find((d) => {
    if (d.status === "taken" || d.status === "skipped") return false;
    const diffMin = (d.scheduledAt.getTime() - now.getTime()) / 60000;
    return diffMin <= 15 && diffMin >= -180; // finestra: 15 min prima → 3h dopo
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
            <Link to="/notifiche" className="relative">
              <Bell className="size-5" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
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
  onConfirm,
  onSnooze,
  onSkip,
}: {
  dose: ScheduledDose;
  onConfirm: () => void;
  onSnooze: () => void;
  onSkip: () => void;
}) {
  const isLate = dose.status === "late";
  const isReminder = dose.status === "reminder";

  return (
    <section
      className={cn(
        "fm-reveal mt-8 rounded-3xl border-l-8 bg-card p-6 shadow-lift ring-1 ring-border [animation-delay:60ms]",
        isLate ? "border-accent" : isReminder ? "border-warning" : "border-primary",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest",
            isLate
              ? "bg-accent-soft text-accent"
              : isReminder
                ? "bg-warning/20 text-warning-foreground"
                : "bg-primary-soft text-primary",
          )}
        >
          {isLate ? "In ritardo" : "Adesso"}
        </span>
        <span className="flex items-center gap-1 font-mono text-sm text-muted-foreground">
          <Clock className="size-4" /> {formatTime(dose.scheduledAt)}
        </span>
      </div>

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

      <button
        onClick={onConfirm}
        className="mt-6 h-20 w-full rounded-2xl bg-primary text-xl font-black text-primary-foreground shadow-lift transition active:scale-[0.98]"
      >
        Ho preso la medicina
      </button>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={onSnooze}
          className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface py-3 text-sm font-semibold text-foreground hover:bg-secondary"
        >
          <Clock className="size-4" /> Ritarda 10 min
        </button>
        <button
          onClick={onSkip}
          className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-muted-foreground hover:text-foreground"
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
