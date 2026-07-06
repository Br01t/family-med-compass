import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ChevronLeft, Clock, Pill, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useFamilyMed } from "@/lib/store";
import {
  formatDateLong,
  formatTime,
  getDosesForPatientOnDate,
  getNextDose,
  statusLabel,
} from "@/lib/therapy";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/paziente")({
  head: () => ({
    meta: [
      { title: "La tua giornata — FamilyMed" },
      { name: "description", content: "Vista paziente: le medicine di oggi in un solo tap." },
    ],
  }),
  component: PatientPage,
});

function PatientPage() {
  const { data, confirmDose, skipDose } = useFamilyMed();
  if (!data?.patients || data.patients.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Caricamento paziente...</p>
      </div>
    );
  }

  const patient =
    data.patients.find((p) => p.id === data.currentPatientId) ??
    data.patients[0];

  if (!patient) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Nessun paziente trovato</p>
      </div>
    );
  }
  const now = new Date();
  const doses = getDosesForPatientOnDate(data, patient.id, now, now);
  const next = getNextDose(data, patient.id);
  const firstName = patient.name.split(" ")[0];

  const remaining = doses.filter(
    (d) => d.status !== "taken" && d.status !== "skipped",
  );
  const completed = doses.filter((d) => d.status === "taken" || d.status === "skipped");

  const greeting =
    now.getHours() < 12
      ? "Buongiorno"
      : now.getHours() < 18
        ? "Buon pomeriggio"
        : "Buonasera";

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-xl items-center justify-between px-5 pt-5">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/">
            <ChevronLeft className="mr-1 size-4" /> Home
          </Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/caregiver">Modalità caregiver</Link>
        </Button>
      </header>

      <main className="mx-auto max-w-xl px-5 pb-24 pt-4">
        <section className="fm-reveal">
          <p className="text-2xl text-muted-foreground">{greeting},</p>
          <h1 className="text-5xl font-black tracking-tight">{firstName}</h1>
          <p className="mt-2 text-base capitalize text-muted-foreground">
            {formatDateLong(now)} · {formatTime(now)}
          </p>
        </section>

        {next && (
          <section className="fm-reveal mt-8 rounded-2xl border border-border/60 bg-surface-muted p-6 [animation-delay:60ms]">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Prossimo farmaco
            </p>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <p className="text-5xl font-black tracking-tight text-primary">
                {formatTime(next.scheduledAt)}
              </p>
              <p className="truncate text-right text-lg font-semibold text-foreground">
                {next.therapy.name}
              </p>
            </div>
          </section>
        )}

        <section className="mt-8 space-y-4 fm-reveal [animation-delay:120ms]">
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            Da prendere oggi ({remaining.length})
          </h2>

          {remaining.length === 0 && (
            <div className="rounded-3xl border border-success/30 bg-success/10 p-8 text-center">
              <div className="mx-auto grid size-14 place-items-center rounded-full bg-success text-success-foreground fm-pop">
                <Check className="size-7" />
              </div>
              <p className="mt-4 text-xl font-black">Hai preso tutte le medicine!</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Bravo {firstName}. A domani mattina.
              </p>
            </div>
          )}

          {remaining.map((dose) => {
            const isLate = dose.status === "late";
            const isReminder = dose.status === "reminder";
            return (
              <article
                key={dose.id}
                className={cn(
                  "rounded-3xl bg-card p-6 shadow-card ring-1 ring-border transition",
                  "border-l-8",
                  isLate
                    ? "border-accent"
                    : isReminder
                      ? "border-warning"
                      : "border-primary",
                )}
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="size-4" />
                      <span className="font-mono font-semibold text-foreground">
                        {formatTime(dose.scheduledAt)}
                      </span>
                    </div>
                    <h3 className="mt-2 truncate text-2xl font-black leading-tight">
                      {dose.therapy.name}
                    </h3>
                    <p className="text-base text-muted-foreground">
                      {dose.therapy.dosage} · {dose.therapy.quantity} compressa
                      {dose.therapy.quantity > 1 ? "e" : ""}
                    </p>
                    {dose.therapy.notes && (
                      <p className="mt-2 text-sm italic text-muted-foreground">
                        {dose.therapy.notes}
                      </p>
                    )}
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest",
                      isLate
                        ? "bg-accent-soft text-accent"
                        : isReminder
                          ? "bg-warning/20 text-warning-foreground"
                          : "bg-primary-soft text-primary",
                    )}
                  >
                    {statusLabel[dose.status]}
                  </span>
                </div>

                <button
                  onClick={() => {
                    confirmDose({
                      therapyId: dose.therapy.id,
                      scheduledAt: dose.scheduledAt,
                      confirmedBy: patient.id,
                    });
                    toast.success(`${dose.therapy.name} confermata`, {
                      description: `Presa alle ${formatTime(new Date())}`,
                    });
                  }}
                  className="mt-5 h-20 w-full rounded-2xl bg-primary text-xl font-black text-primary-foreground shadow-lift transition active:scale-[0.98]"
                >
                  Ho preso la medicina
                </button>

                <button
                  onClick={() => {
                    skipDose({
                      therapyId: dose.therapy.id,
                      scheduledAt: dose.scheduledAt,
                    });
                    toast(`Dose saltata`, { description: dose.therapy.name });
                  }}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" /> Salta questa dose
                </button>
              </article>
            );
          })}
        </section>

        {completed.length > 0 && (
          <section className="mt-10 space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              Già completate ({completed.length})
            </h2>
            {completed.map((dose) => (
              <div
                key={dose.id}
                className="flex items-center justify-between rounded-2xl border border-border/60 bg-surface-muted p-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="grid size-10 shrink-0 place-items-center rounded-full bg-success/15 text-success">
                    {dose.status === "taken" ? (
                      <Check className="size-5" />
                    ) : (
                      <X className="size-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{dose.therapy.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {dose.status === "taken"
                        ? `Presa alle ${dose.event?.confirmedAt ? formatTime(new Date(dose.event.confirmedAt)) : "--"}`
                        : "Saltata"}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 font-mono text-sm text-muted-foreground">
                  {formatTime(dose.scheduledAt)}
                </span>
              </div>
            ))}
          </section>
        )}

        <div className="mt-12 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Pill className="size-4" /> Dati locali · demo FamilyMed
        </div>
      </main>
    </div>
  );
}
