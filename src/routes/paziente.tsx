import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  LogOut,
  Package,
  Pill,
  Settings,
  Sparkles,
  X,
  Info,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { TherapyPhoto } from "@/components/TherapyPhoto";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export const Route = createFileRoute("/paziente")({
  head: () => ({
    meta: [
      { title: "La tua giornata — FamilyMed" },
      {
        name: "description",
        content:
          "Vista paziente: timeline delle cure, azioni in tempo reale e riassunto delle terapie.",
      },
    ],
  }),
  component: PatientPage,
});

function PatientPage() {
  const navigate = useNavigate();
  const { data, user, userProfile, loadingAuth, confirmDose, skipDose, snoozeDose, logout } =
    useFamilyMed();

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

  // "Chi ha fatto cosa" vale anche al contrario: sappiamo per certo (trigger
  // DB handle_dose_taken) che confermando una dose i caregiver collegati
  // ricevono davvero una notifica — quindi possiamo dirlo con sicurezza,
  // senza inventare un dato che non è vero.
  const informedWho =
    data.caregivers.length === 1
      ? data.caregivers[0].name.split(" ")[0]
      : data.caregivers.length > 1
        ? "i tuoi caregiver"
        : null;

  // Micro-interazione di conferma: tiene visibile per un paio di secondi
  // un feedback "fisico" (spunta grande + chi è stato avvisato) prima di
  // lasciare che la pagina torni al layout normale (prossima dose o riposo).
  const [justConfirmed, setJustConfirmed] = useState<{ therapyName: string; at: Date } | null>(
    null,
  );
  useEffect(() => {
    if (!justConfirmed) return;
    const id = setTimeout(() => setJustConfirmed(null), 2200);
    return () => clearTimeout(id);
  }, [justConfirmed]);

  // Watchdog: se una dose "rimandata" (snoozed) supera il suo termine
  // ultimo per confermare (lo stesso calcolo usato per decidere se la card
  // "Ultimo momento per confermare" è ancora attiva, vedi ActiveDoseCard),
  // viene segnata automaticamente come saltata (equivalente a
  // "dimenticata"). Senza questo controllo la card sparisce allo scadere
  // del countdown ma la dose resta con lo stato "snoozed" (tag
  // "Rimandata") finché non arriva il prossimo giro del cron server-side
  // (dose-scheduler).
  const autoSkippedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!patient) return;
    const list = getDosesForPatientOnDate(data, patient.id, now, now);
    for (const d of list) {
      if (d.status !== "snoozed") continue;
      const snoozedUntilMs = d.event?.snoozedUntil ? new Date(d.event.snoozedUntil).getTime() : 0;
      if (!snoozedUntilMs) continue;
      const hardDeadline = snoozedUntilMs + (d.therapy.timeoutMinutes ?? 10) * 60_000;
      if (Date.now() < hardDeadline) continue;
      const key = `${d.therapy.id}@${d.scheduledAt.toISOString()}`;
      if (autoSkippedRef.current.has(key)) continue;
      autoSkippedRef.current.add(key);
      skipDose({ therapyId: d.therapy.id, scheduledAt: d.scheduledAt });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, data, patient, skipDose]);

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
    now.getHours() < 12 ? "Buongiorno" : now.getHours() < 18 ? "Buon pomeriggio" : "Buonasera";

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

  const isDoneStatus = (d: ScheduledDose) =>
    d.status === "taken" || d.status === "skipped" || d.status === "missed";
  const isActiveIshStatus = (d: ScheduledDose) =>
    d.status === "reminder" || d.status === "due" || d.status === "snoozed" || d.status === "late";

  // DOPO: tutto ciò che oggi non è ancora dovuto e non è la dose attiva —
  // una semplice lista "ora — nome", niente altro.
  const upcomingDoses = doses
    .filter((d) => !isDoneStatus(d) && !isActiveIshStatus(d) && d.id !== activeDose?.id)
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

  // Storico di oggi (già preso / saltato): secondario, dietro un "mostra dettagli".
  const pastDosesToday = doses
    .filter((d) => isDoneStatus(d))
    .sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime());

  const handleLogout = async () => {
    await logout();
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-xl sm:max-w-2xl items-center justify-between px-4 sm:px-5 pt-5">
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
            <Link to="/impostazioni">
              <Settings className="size-5" />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Esci">
            <LogOut className="size-5" />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-xl sm:max-w-2xl px-4 sm:px-5 pb-24 pt-4">
        {/* Hero minimale: solo saluto e data, niente statistiche in primo piano */}
        <section className="fm-reveal">
          <p className="text-xl sm:text-2xl text-muted-foreground">{greeting},</p>
          <h1 className="truncate text-4xl sm:text-5xl font-black tracking-tight">{firstName}</h1>
          <p className="mt-2 text-base capitalize text-muted-foreground">
            {formatDateLong(now)} · {formatTime(now)}
          </p>
        </section>

        {/* ADESSO — l'unica azione che conta in questo momento */}
        {justConfirmed ? (
          <section className="mt-8">
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              Adesso
            </h2>
            <ConfirmedSplash
              therapyName={justConfirmed.therapyName}
              at={justConfirmed.at}
              informedWho={informedWho}
            />
          </section>
        ) : activeDose ? (
          <section className="mt-8">
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              Adesso
            </h2>
            <ActiveDoseCard
              dose={activeDose}
              now={now}
              onConfirm={() => {
                const at = new Date();
                confirmDose({
                  therapyId: activeDose.therapy.id,
                  scheduledAt: activeDose.scheduledAt,
                  confirmedBy: patient.id,
                });
                setJustConfirmed({ therapyName: activeDose.therapy.name, at });
                // Il feedback principale è la card animata qui sopra; il
                // toast resta solo come annuncio per chi usa uno screen
                // reader (aria-live), non è pensato per essere notato a video.
                toast.success(`${activeDose.therapy.name} confermata`, {
                  description: `Presa alle ${formatTime(at)}`,
                });
              }}
              onSnooze={(minutes) => {
                snoozeDose({
                  therapyId: activeDose.therapy.id,
                  scheduledAt: activeDose.scheduledAt,
                  minutes,
                });
                const label = minutes >= 60 ? "1 ora" : `${minutes} min`;
                toast(`Ti ricorderemo tra ${label}`, { description: activeDose.therapy.name });
              }}
              onSkip={() => {
                skipDose({
                  therapyId: activeDose.therapy.id,
                  scheduledAt: activeDose.scheduledAt,
                });
                toast(`Dose saltata`, { description: activeDose.therapy.name });
              }}
            />
          </section>
        ) : activeTherapies.length > 0 && doses.length > 0 ? (
          <section className="fm-reveal mt-8 rounded-3xl border border-dashed border-border/60 bg-surface-muted p-6 text-center [animation-delay:60ms]">
            <div className="mx-auto grid size-12 place-items-center rounded-full bg-success/15 text-success">
              <Check className="size-6" />
            </div>
            <p className="mt-3 text-base font-bold">Nessuna medicina da prendere ora</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ti avviseremo quando sarà il momento.
            </p>
          </section>
        ) : null}

        {/* DOPO — solo ora e nome, e basta */}
        {upcomingDoses.length > 0 && (
          <section className="mt-10 fm-reveal [animation-delay:120ms]">
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              Dopo
            </h2>
            <ul className="mt-3 divide-y divide-border/50">
              {upcomingDoses.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-3 text-lg">
                  <span className="font-mono font-bold tabular-nums">
                    {formatTime(d.scheduledAt)}
                  </span>
                  <span className="text-muted-foreground">—</span>
                  <span className="truncate font-semibold">{d.therapy.name}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {activeTherapies.length === 0 && <EmptyTherapies name={firstName} />}

        {activeTherapies.length > 0 && doses.length === 0 && (
          <div className="mt-8 rounded-3xl border border-border/60 bg-surface-muted p-8 text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-success/15 text-success">
              <Sparkles className="size-7" />
            </div>
            <p className="mt-4 text-xl font-black">Oggi niente medicine</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Le tue terapie non prevedono dosi per oggi. Goditi la giornata.
            </p>
          </div>
        )}

        {/* Tutto il resto: secondario, nascosto finché non lo chiedi tu */}
        {activeTherapies.length > 0 && (
          <Collapsible className="mt-10 fm-reveal [animation-delay:200ms]">
            <CollapsibleTrigger className="group flex w-full items-center justify-center gap-1.5 py-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground transition hover:text-foreground">
              Altri dettagli
              <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-8 pt-4">
              {totalToday > 0 && (
                <div className="rounded-2xl border border-border/60 bg-surface-muted p-4">
                  <div className="flex items-baseline justify-between">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
                        Progresso di oggi
                      </p>
                      <InfoPopover>
                        Mostra quante medicine hai già confermato rispetto al totale previsto per
                        oggi.
                      </InfoPopover>
                    </div>
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

              {pastDosesToday.length > 0 && (
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
                    Storico di oggi
                  </h2>
                  <ol className="mt-4 space-y-3">
                    {pastDosesToday.map((dose, idx) => (
                      <TimelineItem
                        key={dose.id}
                        dose={dose}
                        isLast={idx === pastDosesToday.length - 1}
                        isActive={false}
                      />
                    ))}
                  </ol>
                </div>
              )}

              <div>
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
                            {t.dosage} · {recurrenceLabel(t.recurrence)} · {t.times.join(", ")}
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
              </div>
            </CollapsibleContent>
          </Collapsible>
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
  onSnooze: (minutes: number) => void;
  onSkip: () => void;
}) {
  const [secondTick, setSecondTick] = useState(0);
  const [snoozePickerOpen, setSnoozePickerOpen] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondTick((value) => value + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  void secondTick;
  useEffect(() => {
    setSnoozePickerOpen(false);
  }, [dose.id]);

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
  const snoozedUntilMs = dose.event?.snoozedUntil ? new Date(dose.event.snoozedUntil).getTime() : 0;
  const hardDeadlineMs = dose.scheduledAt.getTime() + timeoutMin * 60_000;

  const msToHardDeadline = Math.max(0, hardDeadlineMs - Date.now());

  const hardMM = Math.floor(msToHardDeadline / 60000);

  const hardSS = Math.floor((msToHardDeadline % 60000) / 1000);
  const snoozedCritical = msToHardDeadline <= 2 * 60_000;

  return (
    <section
      className={cn(
        "fm-reveal mt-3 rounded-3xl border-l-8 bg-card p-4 sm:p-6 shadow-lift ring-1 ring-border [animation-delay:60ms]",
        isLate
          ? "border-accent"
          : isSnoozed
            ? "border-warning"
            : isReminder
              ? "border-warning"
              : "border-primary",
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
              "mt-1 text-3xl sm:text-4xl font-black tabular-nums",
              snoozedCritical ? "text-destructive" : "text-warning-foreground",
            )}
          >
            {String(hardMM).padStart(2, "0")}:{String(hardSS).padStart(2, "0")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Se non confermi entro questo tempo, la dose sarà segnata come dimenticata e verrai
            contattato da un familiare.
          </p>
        </div>
      )}

      <div className="mt-4 flex items-start gap-4">
        <TherapyPhoto
          src={dose.therapy.photoPackage}
          alt={dose.therapy.name}
          className="size-20 shrink-0 rounded-2xl object-cover ring-1 ring-border"
          fallbackIcon={
            <div className="grid size-20 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
              <Pill className="size-8" />
            </div>
          }
        />
        <div className="min-w-0">
          <h3 className="truncate text-2xl sm:text-3xl font-black leading-tight">
            {dose.therapy.name}
          </h3>
          <p className="text-base text-muted-foreground">
            {dose.therapy.dosage} · {dose.therapy.quantity} compressa
            {dose.therapy.quantity > 1 ? "e" : ""}
          </p>
          {dose.therapy.notes && (
            <p className="mt-1 text-sm italic text-muted-foreground">{dose.therapy.notes}</p>
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
        className="mt-6 h-16 sm:h-20 w-full rounded-2xl bg-primary text-lg sm:text-xl font-black text-primary-foreground shadow-lift transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none disabled:active:scale-100"
      >
        Ho preso la medicina
      </button>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={() => setSnoozePickerOpen((v) => !v)}
          disabled={!canAct}
          aria-disabled={!canAct}
          aria-expanded={snoozePickerOpen}
          className={cn(
            "flex items-center justify-center gap-2 rounded-xl border border-border bg-surface py-3 text-sm font-semibold text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-surface",
            snoozePickerOpen && "border-primary/50 bg-secondary",
          )}
        >
          <Clock className="size-4" /> Ricordamelo più tardi
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

      {snoozePickerOpen && (
        <div className="fm-reveal mt-2 rounded-2xl bg-surface-muted p-3">
          <p className="text-center text-xs font-semibold text-muted-foreground">
            Quando vuoi che te la ricordi?
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {[
              { minutes: 10, label: "10 min" },
              { minutes: 30, label: "30 min" },
              { minutes: 60, label: "1 ora" },
            ].map((opt) => (
              <button
                key={opt.minutes}
                onClick={() => {
                  setSnoozePickerOpen(false);
                  onSnooze(opt.minutes);
                }}
                className="rounded-xl border border-border bg-card py-2.5 text-sm font-bold text-foreground transition hover:border-primary hover:text-primary active:scale-95"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Conferma "fisica": occupa per ~2 secondi lo stesso spazio della card
 * ADESSO prima che la pagina torni al layout normale (prossima dose o
 * riposo). Sostituisce il solo toast con un feedback che si sente,
 * rinforzando la fiducia — soprattutto grazie a "chi è stato avvisato",
 * che qui è un dato vero, non decorativo (vedi trigger handle_dose_taken).
 */
function ConfirmedSplash({
  therapyName,
  at,
  informedWho,
}: {
  therapyName: string;
  at: Date;
  informedWho: string | null;
}) {
  return (
    <section className="fm-reveal mt-3 rounded-3xl border-l-8 border-success bg-card p-8 text-center shadow-lift ring-1 ring-border">
      <div className="fm-check mx-auto grid size-20 place-items-center rounded-full bg-success text-white">
        <Check className="size-10" strokeWidth={3} />
      </div>
      <p className="fm-reveal mt-4 text-2xl font-black tracking-tight [animation-delay:120ms]">
        Fatto!
      </p>
      <p className="fm-reveal mt-3 text-lg font-bold [animation-delay:180ms]">{therapyName}</p>
      <p className="fm-reveal text-sm text-muted-foreground [animation-delay:180ms]">
        presa alle {formatTime(at)}
      </p>
      {informedWho && (
        <p className="fm-reveal mt-4 text-sm font-semibold text-success [animation-delay:260ms]">
          {informedWho === "i tuoi caregiver"
            ? "I tuoi caregiver sono stati informati"
            : `${informedWho} è stato informato`}
        </p>
      )}
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
  const done = dose.status === "taken" || dose.status === "skipped" || dose.status === "missed";

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
          {dose.status === "taken" && <Check className="size-3.5 text-success-foreground" />}
          {(dose.status === "skipped" || dose.status === "missed") && (
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
          <p className="font-mono text-sm font-bold">{formatTime(dose.scheduledAt)}</p>
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
        Ciao {name}! Quando un caregiver ti assegnerà una cura, la troverai qui con orari,
        promemoria e istruzioni.
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

function InfoPopover({ children }: { children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground transition"
          aria-label="Informazioni"
        >
          <Info className="size-4" />
        </button>
      </PopoverTrigger>

      <PopoverContent className="max-w-xs text-sm leading-relaxed">{children}</PopoverContent>
    </Popover>
  );
}