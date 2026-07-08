import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Bell, CalendarPlus, Clock, Info, Package, Pill, Settings } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useFamilyMed } from "@/lib/store";
import { recurrenceLabel } from "@/lib/therapy";
import { downloadIcs, therapyToIcs } from "@/lib/ics";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/le-mie-terapie")({
  head: () => ({
    meta: [
      { title: "Le mie terapie — FamilyMed" },
      {
        name: "description",
        content:
          "Vista paziente: elenco delle terapie assegnate con foto, orari, durata e istruzioni.",
      },
    ],
  }),
  component: MyTherapiesPage,
});

function formatDateIt(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function MyTherapiesPage() {
  const navigate = useNavigate();
  const { data, user, userProfile, loadingAuth } = useFamilyMed();

  const patient =
    (user && data?.patients?.find((p) => p.userId === user.id)) ??
    data?.patients?.find((p) => p.id === data.currentPatientId) ??
    data?.patients?.[0];

  if (loadingAuth || (user && userProfile?.role === "paziente" && !patient)) {
    return (
      <div className="min-h-screen grid place-items-center bg-background px-6">
        <div className="w-full max-w-md space-y-3">
          <div className="h-8 w-2/3 animate-pulse rounded-lg bg-muted" />
          <div className="h-40 animate-pulse rounded-3xl bg-muted/70" />
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="max-w-md rounded-3xl border border-border/60 bg-card p-8 text-center">
          <p className="text-lg font-black">Nessun paziente attivo</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate({ to: "/paziente" })}>
            Torna alla home
          </Button>
        </div>
      </div>
    );
  }

  const therapies = data.therapies.filter(
    (t) => t.patientId === patient.id && t.active && !t.suspended,
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-xl items-center justify-between px-5 pt-5">
        <Link
          to="/paziente"
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Indietro
        </Link>
        <div className="flex items-center gap-1">
          <span className="mr-1 flex items-center gap-2 font-black tracking-tight">
            <span className="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Pill className="size-4" />
            </span>
            FamilyMed
          </span>
          <Button variant="ghost" size="icon" asChild aria-label="Impostazioni">
            <Link to="/impostazioni"><Settings className="size-5" /></Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-5 pb-24 pt-4">
        <section className="fm-reveal">
          <p className="text-2xl text-muted-foreground">Le terapie di</p>
          <h1 className="text-4xl font-black tracking-tight">{patient.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {therapies.length === 0
              ? "Nessuna terapia attualmente assegnata."
              : `${therapies.length} terapia${therapies.length > 1 ? "e" : ""} attiv${
                  therapies.length > 1 ? "e" : "a"
                }.`}
          </p>
        </section>

        {therapies.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-dashed border-border bg-surface-muted p-8 text-center">
            <div className="mx-auto grid size-16 place-items-center rounded-full bg-primary-soft text-primary">
              <Pill className="size-8" />
            </div>
            <p className="mt-4 text-xl font-black">Nessuna terapia da mostrare</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Quando il tuo caregiver ti assegnerà una cura, la troverai qui.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {therapies.map((t) => {
              const lowStock = t.pillsRemaining <= t.lowStockThreshold;
              const reminderMin = Math.abs(t.reminderIntervals?.[0] ?? 10);
              return (
                <article
                  key={t.id}
                  className="rounded-3xl border border-border/60 bg-card p-5 shadow-card fm-reveal"
                >
                  <div className="flex items-start gap-4">
                    {t.photoPackage || t.photoDrug ? (
                      <img
                        src={t.photoPackage ?? t.photoDrug}
                        alt={t.name}
                        className="size-24 shrink-0 rounded-2xl object-cover ring-1 ring-border"
                      />
                    ) : (
                      <div className="grid size-24 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
                        <Pill className="size-10" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-2xl font-black leading-tight">
                        {t.name}
                      </h2>
                      <p className="text-base text-muted-foreground">
                        {t.dosage} · {t.quantity} unità per dose
                      </p>
                      <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
                        {t.category}
                      </p>
                    </div>
                  </div>

                  {t.photoDrug && t.photoPackage && (
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div>
                        <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                          Farmaco
                        </p>
                        <img
                          src={t.photoDrug}
                          alt={`${t.name} farmaco`}
                          className="h-24 w-full rounded-xl object-cover ring-1 ring-border"
                        />
                      </div>
                      <div>
                        <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                          Confezione
                        </p>
                        <img
                          src={t.photoPackage}
                          alt={`${t.name} confezione`}
                          className="h-24 w-full rounded-xl object-cover ring-1 ring-border"
                        />
                      </div>
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {t.times.map((time) => (
                      <span
                        key={time}
                        className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1.5 font-mono text-sm font-bold text-primary"
                      >
                        <Clock className="size-3.5" />
                        {time}
                      </span>
                    ))}
                  </div>

                  <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                    <Row label="Ricorrenza" value={recurrenceLabel(t.recurrence)} />
                    <Row
                      label="Periodo"
                      value={
                        t.endDate
                          ? `Dal ${formatDateIt(t.startDate)} al ${formatDateIt(t.endDate)}`
                          : `Dal ${formatDateIt(t.startDate)} · senza scadenza`
                      }
                    />
                    <Row
                      label="Promemoria"
                      value={`${reminderMin} minuti prima`}
                      icon={<Bell className="size-3.5" />}
                    />
                    <Row
                      label="Scorte"
                      value={`${t.pillsRemaining} pillole rimanenti`}
                      icon={<Package className="size-3.5" />}
                      tone={lowStock ? "warn" : undefined}
                    />
                  </dl>

                  {t.notes && (
                    <div className="mt-4 flex gap-2 rounded-2xl bg-surface-muted p-3 text-sm text-muted-foreground">
                      <Info className="mt-0.5 size-4 shrink-0 text-primary" />
                      <p className="italic">{t.notes}</p>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function Row({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  tone?: "warn";
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-surface-muted/50 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 flex items-center gap-1.5 font-semibold",
          tone === "warn" ? "text-accent" : "text-foreground",
        )}
      >
        {icon}
        {value}
      </p>
    </div>
  );
}
