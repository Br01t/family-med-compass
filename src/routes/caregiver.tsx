import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  ClipboardList,
  Package,
  Pill,
  RefreshCw,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useFamilyMed } from "@/lib/store";
import {
  fetchCaregiverDashboardStats,
  refreshMyCaregiverStats,
  type CaregiverDashboardStats,
} from "@/lib/supabase-service";
import {
  actorName,
  formatRelativeDay,
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
  const { data, userProfile } = useFamilyMed();
  const [tick, setTick] = useState(0);
  const [stats, setStats] = useState<CaregiverDashboardStats | null>(null);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Rate limit lato client: il pulsante manuale forza un
  // REFRESH MATERIALIZED VIEW CONCURRENTLY sul DB (già ridotto a cron
  // giornaliero, ma senza cooldown un utente che clicca ripetutamente lo
  // rifà ogni volta). 5 minuti di cooldown dopo l'ultimo uso.
  const REFRESH_COOLDOWN_MS = 5 * 60_000;
  const [refreshing, setRefreshing] = useState(false);
  const [lastManualRefreshAt, setLastManualRefreshAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const loadStats = async () => {
    const s = await fetchCaregiverDashboardStats();
    setStats(s);
  };
  useEffect(() => {
    loadStats();
  }, []);
  // Aggiorna il countdown del cooldown ogni secondo, solo mentre è attivo.
  useEffect(() => {
    if (!lastManualRefreshAt) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lastManualRefreshAt]);
  const cooldownRemainingMs = lastManualRefreshAt
    ? Math.max(0, REFRESH_COOLDOWN_MS - (nowTick - lastManualRefreshAt))
    : 0;
  const onCooldown = cooldownRemainingMs > 0;
  const handleRefresh = async () => {
    if (refreshing || onCooldown) return;
    setRefreshing(true);
    try {
      await refreshMyCaregiverStats();
      await loadStats();
      setLastManualRefreshAt(Date.now());
      setNowTick(Date.now());
    } finally {
      setRefreshing(false);
    }
  };
  void tick;
  const patients = data.patients;
  const now = new Date();

  // Fallback locale se la MV non ha ancora la riga o l'RPC fallisce
  const fallbackLowStock = useMemo(
    () => data.therapies.filter((t) => t.pillsRemaining <= t.lowStockThreshold),
    [data.therapies],
  );
  const fallbackAlerts = useMemo(() => {
    const isFree = (userProfile?.subscriptionPlan ?? "free") === "free";
    const cutoffMs = isFree ? 7 * 24 * 60 * 60 * 1000 : 180 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    return data.events.filter(
      (e) =>
        (e.status === "missed" || e.status === "skipped") &&
        !isDoseAcknowledged(e) &&
        now - new Date(e.scheduledAt).getTime() <= cutoffMs,
    ).length;
  }, [data.events, userProfile?.subscriptionPlan]);
  const fallbackAdherence = Math.round(
    patients.reduce((sum, p) => sum + getAdherenceForPatient(data, p.id), 0) /
      Math.max(patients.length, 1),
  );

  const totalAdherence = stats?.adherence7d ?? fallbackAdherence;
  // Gli alert attivi devono sempre coincidere in tempo reale con le dosi
  // mostrate nella pagina "/dose-da-confermare", evitando discrepanze dovute
  // a cache o a storici non filtrati della vista materializzata.
  const activeAlerts = fallbackAlerts;
  const lowStockCount = stats?.lowStockCount ?? fallbackLowStock.length;
  const lowStockNames =
    stats?.lowStockNames && stats.lowStockNames.length > 0
      ? stats.lowStockNames
      : fallbackLowStock.map((t) => t.name);

  const refreshedLabel = stats?.refreshedAt
    ? new Date(stats.refreshedAt).toLocaleString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  // CENTRO OPERATIVO: la prima domanda del caregiver è "c'è qualcosa da
  // fare?" — la risposta deve stare in cima, prima di qualsiasi metrica.
  const needsAction = activeAlerts > 0 || lowStockCount > 0;

  // "Chi ha fatto cosa": le ultime conferme reali, con nome di chi le ha
  // fatte. È il cuore della fiducia che l'app promette alla famiglia.
  const recentActivity = useMemo(() => {
    return data.events
      .filter((e) => e.status === "taken" && e.confirmedAt)
      .sort((a, b) => new Date(b.confirmedAt!).getTime() - new Date(a.confirmedAt!).getTime())
      .slice(0, 6)
      .map((e) => {
        const therapy = data.therapies.find((t) => t.id === e.therapyId);
        const patient = data.patients.find((p) => p.id === e.patientId);
        return {
          id: e.id,
          therapyName: therapy?.name ?? "Terapia",
          patientName: patient?.name ?? "—",
          who: actorName(data, e.confirmedBy),
          at: new Date(e.confirmedAt!),
        };
      });
  }, [data]);
  const mostRecent = recentActivity[0];

  return (
    <AppShell
      title="Panoramica famiglia"
      subtitle={`${patients.length} pazienti seguiti · aggiornamento live`}
    >
      <div className="mb-4 flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-xs text-muted-foreground">
          {refreshedLabel
            ? `Statistiche aggiornate: ${refreshedLabel}`
            : "Statistiche non ancora calcolate"}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing || onCooldown}
          className="w-full gap-2 sm:w-auto"
        >
          <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
          {refreshing
            ? "Aggiornamento…"
            : onCooldown
              ? `Già aggiornato (${Math.ceil(cooldownRemainingMs / 1000)}s)`
              : "Aggiorna"}
        </Button>
      </div>

      {/* "C'è qualcosa da fare?" — risposta immediata, azionabile, in cima */}
      {needsAction ? (
        <div className="rounded-3xl border border-accent/30 bg-accent-soft p-5 sm:p-7">
          <div className="flex items-start gap-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent text-accent-foreground">
              <Bell className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-black tracking-tight sm:text-2xl">
                C'è qualcosa da fare
              </h2>
              <div className="mt-3 space-y-2">
                {activeAlerts > 0 && (
                  <Link
                    to="/dose-da-confermare"
                    className="fm-interactive flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 shadow-sm"
                  >
                    <span className="text-sm font-semibold">
                      {activeAlerts}{" "}
                      {activeAlerts === 1 ? "dose da confermare" : "dosi da confermare"}
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-accent" />
                  </Link>
                )}
                {lowStockCount > 0 && (
                  <Link
                    to="/scorte"
                    className="fm-interactive flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 shadow-sm"
                  >
                    <span className="min-w-0 truncate text-sm font-semibold">
                      {lowStockCount}{" "}
                      {lowStockCount === 1 ? "farmaco in esaurimento" : "farmaci in esaurimento"}
                      {lowStockNames.length > 0 && `: ${lowStockNames.join(", ")}`}
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-warning-foreground" />
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-success/30 bg-success/10 p-5 sm:p-7">
          <div className="flex items-center gap-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-success text-white">
              <CheckCircle2 className="size-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-black tracking-tight sm:text-2xl">
                Tutto sotto controllo
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {mostRecent ? (
                  <>
                    Nessuna azione richiesta. Ultima conferma:{" "}
                    <span className="font-semibold text-foreground">{mostRecent.therapyName}</span>{" "}
                    di {mostRecent.patientName}
                    {mostRecent.who && (
                      <>
                        , da <span className="font-semibold text-foreground">{mostRecent.who}</span>
                      </>
                    )}{" "}
                    alle {formatTime(mostRecent.at)}.
                  </>
                ) : (
                  "Nessuna azione richiesta in questo momento."
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* "Chi ha fatto cosa": spinto in primo piano, non nascosto in fondo. */}
      {recentActivity.length > 0 && (
        <div className="mt-4 rounded-3xl border border-border/60 bg-card p-4 shadow-card sm:p-6">
          <div className="flex items-center gap-2">
            <ClipboardList className="size-4 text-primary" />
            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              Chi ha fatto cosa
            </h3>
          </div>
          <ul className="mt-3 divide-y divide-border/50">
            {recentActivity.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2.5 text-sm">
                <CheckCircle2 className="size-4 shrink-0 text-success" />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-semibold">{a.therapyName}</span>
                  <span className="text-muted-foreground"> · {a.patientName}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {a.who ? (
                    <>
                      da <span className="font-semibold text-foreground">{a.who}</span>{" "}
                    </>
                  ) : null}
                  {formatRelativeDay(a.at, now) === "oggi"
                    ? ""
                    : `${formatRelativeDay(a.at, now)} · `}
                  {formatTime(a.at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
        <MetricCard
          label="Aderenza media 7gg"
          value={`${totalAdherence}%`}
          hint="Indica quanto il paziente ha seguito fedelmente la terapia prescritta."
          icon={TrendingUp}
          tone="primary"
        />
        <Link
          to="/dose-da-confermare"
          className="fm-interactive block rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <MetricCard
            label="Alert attivi"
            value={String(activeAlerts)}
            hint={
              activeAlerts > 0 ? "Dose da confermare con il paziente" : "Nessuna dose in sospeso"
            }
            icon={AlertTriangle}
            tone="accent"
            clickable
          />
        </Link>
        <Link
          to="/scorte"
          className="fm-interactive block rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning"
        >
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

      <div className="mt-6 grid gap-6 sm:mt-8 lg:grid-cols-12">
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

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
        "relative rounded-3xl border border-border/60 bg-card p-4 shadow-card sm:p-6",
        clickable && ringStyles,
      )}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 sm:gap-4">
        <div
          className={cn("grid size-10 shrink-0 place-items-center rounded-2xl sm:size-12", styles)}
        >
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{value}</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground whitespace-normal">{hint}</p>
        </div>
        {clickable && (
          <div
            className={cn(
              "grid size-8 shrink-0 place-items-center self-start rounded-full",
              styles,
            )}
          >
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
  const lastTaken = [...doses]
    .filter((d) => d.status === "taken")
    .sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime())[0];
  const lastTakenBy = lastTaken ? actorName(data, lastTaken.event?.confirmedBy) : null;

  return (
    <Link
      to="/pazienti/$id"
      params={{ id: patientId }}
      className="fm-interactive block rounded-3xl border border-border/60 bg-card p-4 shadow-card sm:p-6"
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 sm:gap-4">
        <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary-soft text-lg font-black text-primary sm:size-14">
          {patient.name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2)}
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
          <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {problem ? (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-accent/20 bg-accent-soft/70 p-3">
          <span className={cn("size-2 shrink-0 rounded-full", statusDot[problem.status])} />
          <p className="min-w-0 truncate text-sm font-semibold text-accent">
            {statusLabel[problem.status]} — {problem.therapy.name} (
            {formatTime(problem.scheduledAt)})
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
          {lastTaken && (
            <span className="block text-xs font-normal text-success/80">
              {lastTakenBy ? `Ultima da ${lastTakenBy}` : "Ultima"} alle{" "}
              {lastTaken.event?.confirmedAt
                ? formatTime(new Date(lastTaken.event.confirmedAt))
                : formatTime(lastTaken.scheduledAt)}
            </span>
          )}
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
    <div className="rounded-3xl border border-border/60 bg-card p-4 shadow-card sm:p-6">
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
    <div className="rounded-3xl border border-border/60 bg-card p-4 shadow-card sm:p-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <h3 className="truncate text-lg font-black tracking-tight">Timeline dosi</h3>
        <span className="shrink-0 text-xs text-muted-foreground">{doses.length} dosi</span>
      </div>

      <div className="mt-4 flex overflow-x-auto rounded-full border border-border/60 bg-surface-muted p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setDayOffset(t.id)}
            className={cn(
              "shrink-0 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-widest transition",
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
          const who = d.status === "taken" ? actorName(data, d.event?.confirmedBy) : null;
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
              {who ? (
                // "Chi ha fatto cosa": qui sta la fiducia — non basta sapere
                // che è stata presa, conta sapere CHI l'ha confermata.
                <p className="mt-1 truncate text-xs font-semibold text-success">
                  ✓ Confermata da {who} alle{" "}
                  {d.event?.confirmedAt
                    ? formatTime(new Date(d.event.confirmedAt))
                    : formatTime(d.scheduledAt)}
                  <span className="font-normal text-muted-foreground"> · {patient?.name}</span>
                </p>
              ) : (
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
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}