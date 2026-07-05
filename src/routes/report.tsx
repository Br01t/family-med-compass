import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useFamilyMed } from "@/lib/store";
import { getAdherenceForPatient, getDosesForPatientOnDate } from "@/lib/therapy";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/report")({
  head: () => ({ meta: [{ title: "Report — FamilyMed" }] }),
  component: ReportPage,
});

function ReportPage() {
  const { data } = useFamilyMed();
  const now = new Date();

  // Compute stats across 30 days for all patients
  let totalScheduled = 0;
  let totalTaken = 0;
  let totalLate = 0;
  let totalSkipped = 0;
  const confirmDelays: number[] = [];

  for (let i = 0; i < 30; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    for (const p of data.patients) {
      const doses = getDosesForPatientOnDate(data, p.id, d, now);
      for (const dose of doses) {
        if (dose.scheduledAt > now) continue;
        totalScheduled++;
        if (dose.status === "taken") {
          totalTaken++;
          if (dose.event?.confirmedAt) {
            const delay =
              (new Date(dose.event.confirmedAt).getTime() -
                dose.scheduledAt.getTime()) /
              60000;
            if (delay >= 0) confirmDelays.push(delay);
          }
        } else if (dose.status === "late") totalLate++;
        else if (dose.status === "skipped") totalSkipped++;
      }
    }
  }
  const adherence30 =
    totalScheduled === 0 ? 100 : Math.round((totalTaken / totalScheduled) * 100);
  const avgDelay =
    confirmDelays.length === 0
      ? 0
      : Math.round(confirmDelays.reduce((a, b) => a + b, 0) / confirmDelays.length);

  return (
    <AppShell title="Report & statistiche" subtitle="Ultimi 30 giorni">
      <div className="grid gap-6 md:grid-cols-4">
        <Stat label="Aderenza 30gg" value={`${adherence30}%`} tone="primary" />
        <Stat label="Dosi in ritardo" value={String(totalLate)} tone="warning" />
        <Stat label="Dosi saltate" value={String(totalSkipped)} tone="accent" />
        <Stat label="Ritardo medio" value={`${avgDelay} min`} tone="primary" />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {data.patients.map((p) => (
          <PatientChart key={p.id} patientId={p.id} />
        ))}
      </div>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "primary" | "warning" | "accent";
}) {
  const styles = {
    primary: "text-primary",
    warning: "text-warning-foreground",
    accent: "text-accent",
  }[tone];
  return (
    <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-2 text-4xl font-black tracking-tight", styles)}>
        {value}
      </p>
    </div>
  );
}

function PatientChart({ patientId }: { patientId: string }) {
  const { data } = useFamilyMed();
  const patient = data.patients.find((p) => p.id === patientId)!;
  const now = new Date();
  const days = 14;
  const bars = Array.from({ length: days }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (days - 1 - i));
    const doses = getDosesForPatientOnDate(data, patientId, d, now);
    const past = doses.filter((x) => x.scheduledAt <= now);
    const taken = past.filter((x) => x.status === "taken").length;
    return {
      date: d,
      pct: past.length === 0 ? 0 : Math.round((taken / past.length) * 100),
    };
  });
  const adherence = getAdherenceForPatient(data, patientId, 14);

  return (
    <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
        <h3 className="truncate text-lg font-black tracking-tight">{patient.name}</h3>
        <span className="shrink-0 text-2xl font-black text-primary">
          {adherence}%
        </span>
      </div>
      <p className="text-xs text-muted-foreground">Ultimi 14 giorni</p>
      <div className="mt-5 flex h-32 items-end gap-1">
        {bars.map((b, i) => (
          <div key={i} className="group relative flex flex-1 flex-col items-center">
            <div className="flex h-24 w-full items-end">
              <div
                className={cn(
                  "w-full rounded-t transition-all",
                  b.pct >= 90 ? "bg-primary" : b.pct >= 70 ? "bg-warning" : "bg-accent",
                )}
                style={{ height: `${Math.max(b.pct, 3)}%` }}
                title={`${b.date.toLocaleDateString("it-IT")}: ${b.pct}%`}
              />
            </div>
            <span className="mt-1 text-[9px] text-muted-foreground">
              {b.date.getDate()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
