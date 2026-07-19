import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, Package, Pill, RefreshCw, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useFamilyMed } from "@/lib/store";
import {
  fetchCaregiverDashboardStats,
  refreshMyCaregiverStats,
  type CaregiverDashboardStats,
} from "@/lib/supabase-service";
import {
  fetchCaregiverDashboardStats,
  type CaregiverDashboardStats,
} from "@/lib/supabase-service";
import {
  formatTime,
  getAdherenceForPatient,
  getDosesForPatientOnDate,
  getNextDose,
  isDoseAcknowledged,
  statusDot,
  statusLabel,
  statusTone,
} from "@/lib/therapy";
import type { ScheduledDose } from "@/lib/therapy";
import { cn } from "@/lib/utils";



export const Route = createFileRoute("/caregiver")({
  head: () => ({
    meta: [
      { title: "Dashboard Caregiver — FamilyMed" },
      { name: "description", content: "Monitoraggio live delle terapie della tua famiglia." },
    ],
  }),
  component: CaregiverHome,
});

function CaregiverHome() {
  const { data } = useFamilyMed();
  const [tick, setTick] = useState(0);
  const [stats, setStats] = useState<CaregiverDashboardStats | null>(null);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Ricarica le stats aggregate dal DB (materialized view precalcolata,
  // refresh ogni 5 min) ogni 60s + subito al mount. Evita di calcolare
  // aderenza/alert/scorte a client ad ogni render con l'intero dataset.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const s = await fetchCaregiverDashboardStats();
      if (!cancelled) setStats(s);
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);
  void tick;
  const patients = data.patients;
  const now = new Date();

  // Fallback locale se la MV non ha ancora la riga o l'RPC fallisce
  const fallbackLowStock = useMemo(
    () => data.therapies.filter((t) => t.pillsRemaining <= t.lowStockThreshold),
    [data.therapies],
  );
  const fallbackAlerts = useMemo(
    () =>
      data.events.filter(
        (e) => (e.status === "missed" || e.status === "skipped") && !isDoseAcknowledged(e),
      ).length,
    [data.events],
  );
  const fallbackAdherence = Math.round(
    patients.reduce((sum, p) => sum + getAdherenceForPatient(data, p.id), 0) /
      Math.max(patients.length, 1),
  );

  const totalAdherence = stats?.adherence7d ?? fallbackAdherence;
  const activeAlerts = stats?.activeAlerts ?? fallbackAlerts;
  const lowStockCount = stats?.lowStockCount ?? fallbackLowStock.length;
  const lowStockNames =
    stats?.lowStockNames && stats.lowStockNames.length > 0
      ? stats.lowStockNames
      : fallbackLowStock.map((t) => t.name);


  return (
    <AppShell
      title="Panoramica famiglia"
      subtitle={`${patients.length} pazienti seguiti · aggiornamento live`}
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <MetricCard
          label="Aderenza media 7gg"
          value={`${totalAdherence}%`}
          hint="Indica quanto il paziente ha seguito fedelmente la terapia prescritta."
          icon={TrendingUp}
          tone="primary"
        />
        <Link to="/dose-da-confermare" className="block rounded-3xl transition hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <MetricCard
            label="Alert attivi"
            value={String(activeAlerts)}
            hint={activeAlerts > 0 ? "Dose da confermare con il paziente" : "Nessuna dose in sospeso"}
            icon={AlertTriangle}
            tone="accent"
            clickable
          />
        </Link>
        <Link to="/scorte" className="block rounded-3xl transition hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning">
          <MetricCard
            label="Scorte in esaurimento"
            value={String(lowStockCount)}
            hint={lowStockCount > 0 ? lowStockNames.join(", ") : "Tutto ok"}

            icon={Package}
            tone="warning"
            clickable
          />
        </Link>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-12">
        <section className="space-y-4 lg:col-span-8">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              Pazienti
            </h2>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/pazienti">
                Tutti <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {patients.map((patient) => (
              <PatientCard key={patient.id} patientId={patient.id} />
            ))}
          </div>

          <TimelineCard now={now} />

        </section>

        <aside className="space-y-4 lg:col-span-4">
          {/* <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <h3 className="truncate text-lg font-black tracking-tight">
                Scorte in esaurimento
              </h3>
              <Button variant="link" size="sm" className="shrink-0 p-0" asChild>
                <Link to="/scorte">Gestisci</Link>
              </Button>
            </div>
            <ul className="mt-4 space-y-3">
              {lowStock.length === 0 && (
                <li className="text-sm text-muted-foreground">
                  Nessuna scorta bassa. 👌
                </li>
              )}
              {lowStock.map((t) => {
                const daysLeft = Math.floor(
                  t.pillsRemaining / (t.quantity * t.times.length),
                );
                return (
                  <li
                    key={t.id}
                    className="flex items-center justify-between border-b border-border/50 pb-3 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{t.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.pillsRemaining} compresse · ~{daysLeft}gg
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-accent">
                      Ordina
                    </span>
                  </li>
                );
              })}
            </ul>
          </div> */}

          <WeeklyAdherenceCard />
        </aside>
      </div>
    </AppShell>
  );
}

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  clickable = false,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "primary" | "accent" | "warning";
  clickable?: boolean;
}) {
  const styles = {
    primary: "bg-primary-soft text-primary",
    accent: "bg-accent-soft text-accent",
    warning: "bg-warning/15 text-warning-foreground",
  }[tone];
  const ringStyles = {
    primary: "",
    accent: "ring-1 ring-accent/30 hover:ring-accent/60",
    warning: "ring-1 ring-warning/40 hover:ring-warning/70",
  }[tone];
  return (
    <div
      className={cn(
        "relative rounded-3xl border border-border/60 bg-card p-6 shadow-card",
        clickable && ringStyles,
      )}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4">
        <div className={cn("grid size-12 place-items-center rounded-2xl", styles)}>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-3xl font-black tracking-tight">{value}</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground whitespace-normal">{hint}</p>
        </div>
        {clickable && (
          <div className={cn("grid size-8 shrink-0 place-items-center self-start rounded-full", styles)}>
            <ArrowRight className="size-4" />
          </div>
        )}
      </div>
      {clickable && (
        <span className="pointer-events-none absolute bottom-3 right-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
          Apri →
        </span>
      )}
    </div>
  );
}

function PatientCard({ patientId }: { patientId: string }) {
  const { data } = useFamilyMed();
  const patient = data.patients.find((p) => p.id === patientId)!;
  const now = new Date();
  const doses = getDosesForPatientOnDate(data, patientId, now, now);
  const taken = doses.filter((d) => d.status === "taken").length;
  const progress = doses.length === 0 ? 0 : Math.round((taken / doses.length) * 100);
  const adherence = getAdherenceForPatient(data, patientId);
  const next = getNextDose(data, patientId);
  const problem = doses.find((d) => d.status === "late" || d.status === "reminder");

  return (
    <Link
      to="/pazienti/$id"
      params={{ id: patientId }}
      className="block rounded-3xl border border-border/60 bg-card p-6 shadow-card transition hover:shadow-lift"
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-4">
        <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary-soft text-lg font-black text-primary">
          {patient.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-black tracking-tight">{patient.name}</p>
          <p className="text-xs text-muted-foreground">
            {patient.birthYear ? now.getFullYear() - patient.birthYear : "?"} anni
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={cn(
              "text-2xl font-black",
              adherence >= 90 ? "text-success" : adherence >= 75 ? "text-primary" : "text-accent",
            )}
          >
            {adherence}%
          </p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Aderenza
          </p>
        </div>
      </div>

      <div className="mt-5">
        <div className="flex justify-between text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          <span>Oggi</span>
          <span>
            {taken} / {doses.length}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {problem ? (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-accent/20 bg-accent-soft/70 p-3">
          <span className={cn("size-2 shrink-0 rounded-full", statusDot[problem.status])} />
          <p className="min-w-0 truncate text-sm font-semibold text-accent">
            {statusLabel[problem.status]} — {problem.therapy.name} ({formatTime(problem.scheduledAt)})
          </p>
        </div>
      ) : next ? (
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-surface-muted p-3">
          <p className="min-w-0 truncate text-sm text-muted-foreground">
            Prossima: <span className="font-semibold text-foreground">{next.therapy.name}</span>
          </p>
          <span className="shrink-0 font-mono text-sm font-bold text-primary">
            {formatTime(next.scheduledAt)}
          </span>
        </div>
      ) : (
        <div className="mt-4 rounded-xl bg-success/10 p-3 text-sm font-semibold text-success">
          ✓ Giornata completata
        </div>
      )}
    </Link>
  );
}

function WeeklyAdherenceCard() {
  const { data } = useFamilyMed();
  const patients = data.patients;
  const days = 7;
  const now = new Date();
  const bars = Array.from({ length: days }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (days - 1 - i));
    let total = 0;
    let taken = 0;
    for (const p of patients) {
      const doses = getDosesForPatientOnDate(data, p.id, d, now);
      for (const dose of doses) {
        if (dose.scheduledAt > now) continue;
        total++;
        if (dose.status === "taken") taken++;
      }
    }
    return {
      label: d.toLocaleDateString("it-IT", { weekday: "short" }).slice(0, 3),
      pct: total === 0 ? 0 : Math.round((taken / total) * 100),
    };
  });

  return (
    <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
      <div className="flex items-center gap-2">
        <Pill className="size-4 text-primary" />
        <h3 className="text-lg font-black tracking-tight">Aderenza settimanale</h3>
      </div>
      <div className="mt-6 flex h-32 items-end gap-1.5">
        {bars.map((b, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-2">
            <div className="flex h-24 w-full items-end">
              <div
                className={cn(
                  "w-full rounded-t-md transition-all",
                  b.pct >= 90 ? "bg-primary" : b.pct >= 70 ? "bg-warning" : "bg-accent",
                )}
                style={{ height: `${Math.max(b.pct, 4)}%` }}
              />
            </div>
            <span className="text-[10px] font-bold capitalize text-muted-foreground">
              {b.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimelineCard({ now }: { now: Date }) {
  const { data } = useFamilyMed();
  const [dayOffset, setDayOffset] = useState<-1 | 0 | 1>(0);

  const targetDate = new Date(now);
  targetDate.setDate(targetDate.getDate() + dayOffset);

  const doses: Array<ScheduledDose & { patientId: string }> = [];
  for (const p of data.patients) {
    const dd = getDosesForPatientOnDate(data, p.id, targetDate, now);
    for (const dose of dd) doses.push({ ...dose, patientId: p.id });
  }
  doses.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

  const tabs: Array<{ id: -1 | 0 | 1; label: string }> = [
    { id: -1, label: "Ieri" },
    { id: 0, label: "Oggi" },
    { id: 1, label: "Domani" },
  ];

  return (
    <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <h3 className="truncate text-lg font-black tracking-tight">Timeline dosi</h3>
        <span className="shrink-0 text-xs text-muted-foreground">{doses.length} dosi</span>
      </div>

      <div className="mt-4 inline-flex rounded-full border border-border/60 bg-surface-muted p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setDayOffset(t.id)}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-widest transition",
              dayOffset === t.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="relative mt-6 space-y-5 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-border">
        {doses.length === 0 && (
          <p className="text-sm text-muted-foreground">Nessuna dose in questo giorno.</p>
        )}
        {doses.map((d) => {
          const patient = data.patients.find((p) => p.id === d.patientId);
          const isFuture = d.scheduledAt > now;
          return (
            <div key={d.id} className="relative pl-10">
              <div className="absolute left-0 top-1.5 grid size-6 place-items-center rounded-full bg-background ring-2 ring-border">
                <div className={cn("size-2 rounded-full", statusDot[d.status])} />
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <p className="truncate text-sm font-semibold">{d.therapy.name}</p>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {formatTime(d.scheduledAt)}
                </span>
              </div>
              <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <p className="truncate text-xs text-muted-foreground">
                  {patient?.name} {isFuture ? "· in programma" : ""}
                </p>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                    statusTone[d.status],
                  )}
                >
                  {statusLabel[d.status]}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}