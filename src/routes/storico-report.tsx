import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useFamilyMed } from "@/lib/store";
import { formatTime, getDosesForPatientOnDate } from "@/lib/therapy";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/storico-report")({
  head: () => ({
    meta: [
      { title: "Storico & Report — FamilyMed" },
      {
        name: "description",
        content:
          "Storico giornaliero delle assunzioni e report di aderenza calcolati dai dati reali.",
      },
    ],
  }),
  component: HistoryReportPage,
});

type PeriodDays = 7 | 30 | 90;

function HistoryReportPage() {
  const { data } = useFamilyMed();
  const patients = data.patients;
  const [patientId, setPatientId] = useState<string | undefined>(patients[0]?.id);
  const [period, setPeriod] = useState<PeriodDays>(30);
  const [selected, setSelected] = useState<Date | null>(null);

  const now = new Date();

  // Calendario del mese
  const days = useMemo(() => {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const startPad = (monthStart.getDay() + 6) % 7;
    const total = startPad + monthEnd.getDate();
    const cells = Math.ceil(total / 7) * 7;
    return Array.from({ length: cells }, (_, i) => {
      const d = new Date(monthStart);
      d.setDate(1 + i - startPad);
      return d;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now.getMonth(), now.getFullYear()]);

  // Statistiche per il periodo (dati reali da data.events + programma terapie)
  const stats = useMemo(() => {
    if (!patientId) {
      return {
        scheduled: 0,
        taken: 0,
        late: 0,
        skipped: 0,
        avgDelay: 0,
        adherence: 0,
        bars: [] as { date: Date; pct: number; count: number }[],
        perTherapy: [] as {
          therapyId: string;
          name: string;
          scheduled: number;
          taken: number;
          late: number;
          skipped: number;
          adherence: number;
        }[],
      };
    }
    let scheduled = 0;
    let taken = 0;
    let late = 0;
    let skipped = 0;
    const delays: number[] = [];
    const bars: { date: Date; pct: number; count: number }[] = [];
    const perTherapy = new Map<
      string,
      { name: string; scheduled: number; taken: number; late: number; skipped: number }
    >();

    for (let i = period - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const doses = getDosesForPatientOnDate(data, patientId, d, now);
      let dayScheduled = 0;
      let dayTaken = 0;
      for (const dose of doses) {
        if (dose.scheduledAt > now) continue;
        scheduled++;
        dayScheduled++;
        const entry =
          perTherapy.get(dose.therapy.id) ??
          {
            name: dose.therapy.name,
            scheduled: 0,
            taken: 0,
            late: 0,
            skipped: 0,
          };
        entry.scheduled++;
        if (dose.status === "taken") {
          taken++;
          dayTaken++;
          entry.taken++;
          if (dose.event?.confirmedAt) {
            const delay =
              (new Date(dose.event.confirmedAt).getTime() -
                dose.scheduledAt.getTime()) /
              60000;
            if (delay >= 0) delays.push(delay);
          }
        } else if (dose.status === "late") {
          late++;
          entry.late++;
        } else if (dose.status === "skipped") {
          skipped++;
          entry.skipped++;
        }
        perTherapy.set(dose.therapy.id, entry);
      }
      bars.push({
        date: d,
        pct: dayScheduled === 0 ? 0 : Math.round((dayTaken / dayScheduled) * 100),
        count: dayScheduled,
      });
    }

    const avgDelay =
      delays.length === 0
        ? 0
        : Math.round(delays.reduce((a, b) => a + b, 0) / delays.length);
    const adherence = scheduled === 0 ? 0 : Math.round((taken / scheduled) * 100);

    const perTherapyList = Array.from(perTherapy.entries())
      .map(([therapyId, v]) => ({
        therapyId,
        ...v,
        adherence: v.scheduled === 0 ? 0 : Math.round((v.taken / v.scheduled) * 100),
      }))
      .sort((a, b) => b.scheduled - a.scheduled);

    return {
      scheduled,
      taken,
      late,
      skipped,
      avgDelay,
      adherence,
      bars,
      perTherapy: perTherapyList,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, patientId, period]);

  const summary = (d: Date) => {
    if (!patientId) return null;
    if (d > now) return null;
    const doses = getDosesForPatientOnDate(data, patientId, d, now);
    const past = doses.filter((x) => x.scheduledAt <= now);
    if (past.length === 0) return null;
    const late = past.some((x) => x.status === "late" || x.status === "skipped");
    const missing = past.some((x) => x.status !== "taken" && x.scheduledAt < now);
    const allTaken = past.every((x) => x.status === "taken");
    return { total: past.length, allTaken, late, missing };
  };

  const dayDoses =
    selected && patientId
      ? getDosesForPatientOnDate(data, patientId, selected, now)
      : [];

  return (
    <AppShell
      title="Storico & Report"
      subtitle="Assunzioni reali, aderenza e statistiche"
    >
      {/* Selettori */}
      <div className="flex flex-wrap items-center gap-2">
        {patients.map((p) => (
          <button
            key={p.id}
            onClick={() => setPatientId(p.id)}
            className={cn(
              "rounded-full border px-4 py-2 text-sm font-semibold transition",
              patientId === p.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:bg-secondary",
            )}
          >
            {p.name}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1 rounded-full border border-border bg-card p-1">
          {[7, 30, 90].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p as PeriodDays)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-widest transition",
                period === p
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p} giorni
            </button>
          ))}
        </div>
      </div>

      {/* KPI */}
      <div className="mt-6 grid gap-4 md:grid-cols-5">
        <Stat label={`Aderenza ${period}gg`} value={`${stats.adherence}%`} tone="primary" />
        <Stat label="Dosi programmate" value={String(stats.scheduled)} tone="muted" />
        <Stat label="Dosi in ritardo" value={String(stats.late)} tone="warning" />
        <Stat label="Dosi saltate" value={String(stats.skipped)} tone="accent" />
        <Stat label="Ritardo medio" value={`${stats.avgDelay} min`} tone="primary" />
      </div>

      {stats.scheduled === 0 && (
        <div className="mt-4 rounded-2xl border border-dashed border-border bg-surface-muted p-4 text-sm text-muted-foreground">
          Nessuna assunzione registrata per il periodo selezionato.
        </div>
      )}

      {/* Grafico */}
      <div className="mt-6 rounded-3xl border border-border/60 bg-card p-6 shadow-card">
        <div className="flex items-baseline justify-between">
          <h3 className="text-lg font-black tracking-tight">
            Aderenza giornaliera
          </h3>
          <span className="text-xs text-muted-foreground">
            Ultimi {period} giorni
          </span>
        </div>
        <div className="mt-5 flex h-32 items-end gap-[3px]">
          {stats.bars.map((b, i) => (
            <div key={i} className="group relative flex flex-1 flex-col items-center">
              <div className="flex h-28 w-full items-end">
                <div
                  className={cn(
                    "w-full rounded-t transition-all",
                    b.count === 0
                      ? "bg-muted"
                      : b.pct >= 90
                        ? "bg-primary"
                        : b.pct >= 70
                          ? "bg-warning"
                          : "bg-accent",
                  )}
                  style={{ height: `${Math.max(b.pct, b.count === 0 ? 4 : 6)}%` }}
                  title={`${b.date.toLocaleDateString("it-IT")}: ${b.pct}% (${b.count} dosi)`}
                />
              </div>
              {period <= 30 && (
                <span className="mt-1 text-[9px] text-muted-foreground">
                  {b.date.getDate()}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Calendario + dettaglio giornaliero */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
          <h3 className="text-lg font-black capitalize tracking-tight">
            {now.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}
          </h3>
          <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1">
            {days.map((d, i) => {
              const inMonth = d.getMonth() === now.getMonth();
              const isToday = d.toDateString() === now.toDateString();
              const s = summary(d);
              const tone = s
                ? s.allTaken
                  ? "bg-success/15 text-success ring-success/30"
                  : s.late || s.missing
                    ? "bg-accent-soft text-accent ring-accent/30"
                    : "bg-warning/15 text-warning-foreground ring-warning/30"
                : "";
              return (
                <button
                  key={i}
                  disabled={!inMonth}
                  onClick={() => setSelected(d)}
                  className={cn(
                    "aspect-square rounded-xl border border-transparent p-1.5 text-sm transition",
                    inMonth ? "" : "opacity-30",
                    isToday && "border-primary font-black",
                    selected?.toDateString() === d.toDateString() && "ring-2 ring-primary",
                    tone && `ring-1 ${tone}`,
                  )}
                >
                  <div className="flex h-full flex-col items-center justify-between">
                    <span className="text-sm font-semibold">{d.getDate()}</span>
                    {s && (
                      <span className="text-[10px]">
                        {s.allTaken ? "✓" : s.late || s.missing ? "✕" : "⚠"}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <Legend />
        </div>

        <aside className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
          {!selected ? (
            <>
              <h3 className="text-lg font-black tracking-tight">Seleziona un giorno</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Clicca una data per vedere le assunzioni registrate.
              </p>
            </>
          ) : (
            <>
              <h3 className="text-lg font-black capitalize tracking-tight">
                {selected.toLocaleDateString("it-IT", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </h3>
              <ul className="mt-4 space-y-2">
                {dayDoses.length === 0 && (
                  <li className="text-sm text-muted-foreground">
                    Nessuna terapia programmata in questo giorno.
                  </li>
                )}
                {dayDoses.map((d) => (
                  <li
                    key={d.id}
                    className="rounded-xl border border-border/50 p-3"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-mono text-sm font-bold text-primary">
                        {formatTime(d.scheduledAt)}
                      </span>
                      <span
                        className={cn(
                          "text-[10px] font-bold uppercase tracking-widest",
                          d.status === "taken"
                            ? "text-success"
                            : d.status === "late" || d.status === "skipped"
                              ? "text-accent"
                              : "text-muted-foreground",
                        )}
                      >
                        {d.status}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm font-semibold">
                      {d.therapy.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {d.therapy.dosage} · {d.therapy.quantity} unità
                    </p>
                    {d.event?.confirmedAt && (
                      <p className="mt-1 text-xs text-success">
                        Confermata alle {formatTime(new Date(d.event.confirmedAt))}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
      </div>

      {/* Breakdown per terapia */}
      {stats.perTherapy.length > 0 && (
        <div className="mt-6 rounded-3xl border border-border/60 bg-card p-6 shadow-card">
          <h3 className="text-lg font-black tracking-tight">
            Dettaglio per terapia
          </h3>
          <p className="text-xs text-muted-foreground">
            Ultimi {period} giorni
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  <th className="pb-2">Terapia</th>
                  <th className="pb-2 text-right">Programmate</th>
                  <th className="pb-2 text-right">Prese</th>
                  <th className="pb-2 text-right">Ritardo</th>
                  <th className="pb-2 text-right">Saltate</th>
                  <th className="pb-2 text-right">Aderenza</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {stats.perTherapy.map((t) => (
                  <tr key={t.therapyId}>
                    <td className="py-2 pr-3 font-semibold">{t.name}</td>
                    <td className="py-2 text-right font-mono">{t.scheduled}</td>
                    <td className="py-2 text-right font-mono text-success">
                      {t.taken}
                    </td>
                    <td className="py-2 text-right font-mono text-warning-foreground">
                      {t.late}
                    </td>
                    <td className="py-2 text-right font-mono text-accent">
                      {t.skipped}
                    </td>
                    <td className="py-2 text-right font-mono font-bold text-primary">
                      {t.adherence}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
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
  tone: "primary" | "warning" | "accent" | "muted";
}) {
  const styles = {
    primary: "text-primary",
    warning: "text-warning-foreground",
    accent: "text-accent",
    muted: "text-foreground",
  }[tone];
  return (
    <div className="rounded-3xl border border-border/60 bg-card p-5 shadow-card">
      <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-2 text-3xl font-black tracking-tight", styles)}>
        {value}
      </p>
    </div>
  );
}

function Legend() {
  const items = [
    { label: "Tutte prese", color: "bg-success" },
    { label: "Qualche ritardo", color: "bg-warning" },
    { label: "Dimenticate", color: "bg-accent" },
  ];
  return (
    <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-2">
          <span className={cn("size-2.5 rounded-full", i.color)} />
          {i.label}
        </span>
      ))}
    </div>
  );
}
