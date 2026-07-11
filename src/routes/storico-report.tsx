import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useFamilyMed } from "@/lib/store";
import {
  doseDelayMinutes,
  formatTime,
  getDosesForPatientOnDate,
  statusLabel,
  wasTakenLate,
} from "@/lib/therapy";
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

type PerTherapyEntry = {
  name: string;
  scheduled: number;
  taken: number;
  late: number;
  skipped: number;
};

function HistoryReportPage() {
  const { data } = useFamilyMed();
  const patients = data.patients;
  const [patientId, setPatientId] = useState<string | undefined>(patients[0]?.id);
  const [period, setPeriod] = useState<PeriodDays>(30);
  const [selected, setSelected] = useState<Date | null>(null);
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

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
        perTherapy: [] as (PerTherapyEntry & {
          therapyId: string;
          adherence: number;
        })[],
      };
    }
    let scheduled = 0;
    let taken = 0;
    let late = 0;
    let skipped = 0;
    const delays: number[] = [];
    const bars: { date: Date; pct: number; count: number }[] = [];
    const perTherapy = new Map<string, PerTherapyEntry>();

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
          const delay = doseDelayMinutes(dose);
          if (delay !== null && delay >= 0) delays.push(delay);
          // Anche se ormai confermata, se è stata presa oltre il timeout va
          // comunque contata come dose "in ritardo" nello storico.
          if (wasTakenLate(dose)) {
            late++;
            entry.late++;
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
  }, [data, patientId, period]);

  const summary = (d: Date) => {
    if (!patientId) return null;
    if (d > now) return null;
    const doses = getDosesForPatientOnDate(data, patientId, d, now);
    const past = doses.filter((x) => x.scheduledAt <= now);
    if (past.length === 0) return null;
    // "Dimenticate": almeno una dose saltata o mai confermata (missed/skipped).
    const missed = past.some((x) => x.status === "skipped" || x.status === "missed");
    // "Qualche ritardo": nessuna dimenticata, ma almeno una presa/segnata in
    // ritardo rispetto all'orario previsto (anche se poi confermata).
    const someLate = past.some((x) => x.status === "late" || wasTakenLate(x));
    const allTaken = past.every((x) => x.status === "taken") && !someLate;
    return { total: past.length, allTaken, someLate, missed };
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
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:overflow-visible sm:px-0 sm:pb-0">
          {patients.map((p) => (
            <button
              key={p.id}
              onClick={() => setPatientId(p.id)}
              className={cn(
                "whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition shrink-0",
                patientId === p.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-secondary",
              )}
            >
              {p.name}
            </button>
          ))}
        </div>
        
        {/* Griglia fissa a 3 colonne su mobile per evitare overflow di testo o pillole */}
        <div className="grid grid-cols-3 gap-1 w-full rounded-full border border-border bg-card p-1 sm:ml-auto sm:w-auto sm:flex">
          {[7, 30, 90].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p as PeriodDays)}
              className={cn(
                "rounded-full py-1.5 px-2 text-[11px] font-bold uppercase tracking-wider transition text-center whitespace-nowrap sm:px-3",
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

      {/* KPI - Risolto il collasso forzando grid-cols-2 nativo e gestendo i box spaiati */}
      <div className="mt-6 grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        <Stat label={`Aderenza ${period}gg`} value={`${stats.adherence}%`} tone="primary" className="col-span-2 sm:col-span-1" />
        <Stat label="Dosi programmate" value={String(stats.scheduled)} tone="muted" />
        <Stat label="Dosi in ritardo" value={String(stats.late)} tone="warning" />
        <Stat label="Dosi saltate" value={String(stats.skipped)} tone="accent" />
        <Stat label="Ritardo medio" value={`${stats.avgDelay} min`} tone="primary" className="col-span-2 sm:col-span-1 md:col-span-2 lg:col-span-1" />
      </div>

      {stats.scheduled === 0 && (
        <div className="mt-4 rounded-2xl border border-dashed border-border bg-surface-muted p-4 text-sm text-muted-foreground">
          Nessuna assunzione registrata per il periodo selezionato.
        </div>
      )}

      {/* Grafico */}
      <div className="mt-6 rounded-3xl border border-border/60 bg-card p-4 sm:p-6 shadow-card">
        <div className="flex items-baseline justify-between">
          <h3 className="text-base sm:text-lg font-black tracking-tight">
            Aderenza giornaliera
          </h3>
          <span className="text-xs text-muted-foreground">
            Ultimi {period} giorni
          </span>
        </div>
        <div className="mt-5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="flex h-32 min-w-[600px] items-end gap-[3px]">
            {stats.bars.map((b, i) => (
              <div
                key={i}
                className="group relative flex flex-1 flex-col items-center cursor-pointer"
                onMouseEnter={() => setHoveredBar(i)}
                onMouseLeave={() => setHoveredBar(null)}
                onClick={() =>
                  setHoveredBar((current) => (current === i ? null : i))
                }
              >
                {hoveredBar === i && b.count > 0 && (
                  <div className="absolute bottom-full z-10 mb-2 rounded-xl bg-card px-3 py-2 text-xs shadow-lg border border-border whitespace-nowrap left-1/2 -translate-x-1/2">
                    <p className="font-bold">
                      {b.pct}% aderenza
                    </p>
                    <p className="text-muted-foreground">
                      {b.count} dosi programmate
                    </p>
                    <p className="text-muted-foreground">
                      {b.date.toLocaleDateString("it-IT", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>
                )}

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
                    style={{
                      height: `${Math.max(
                        b.pct,
                        b.count === 0 ? 4 : 6,
                      )}%`,
                    }}
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
      </div>

      {/* Calendario + dettaglio giornaliero */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-3xl border border-border/60 bg-card p-4 sm:p-6 shadow-card">
          <h3 className="text-base sm:text-lg font-black capitalize tracking-tight">
            {now.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}
          </h3>
          <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((d, idx) => (
              <div key={idx} className="hidden sm:block">{d}</div>
            ))}
            {["L", "M", "M", "G", "V", "S", "D"].map((d, idx) => (
              <div key={idx} className="sm:hidden">{d}</div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1">
            {days.map((d, i) => {
              const inMonth = d.getMonth() === now.getMonth();
              const isToday = d.toDateString() === now.toDateString();
              const s = summary(d);
              // Stessa priorità ovunque: dimenticate > qualche ritardo > tutte prese.
              const tone = s
                ? s.missed
                  ? "bg-accent-soft text-accent ring-accent/30"
                  : s.someLate
                    ? "bg-warning/15 text-warning-foreground ring-warning/30"
                    : "bg-success/15 text-success ring-success/30"
                : "";
              const dotColor = s
                ? s.missed
                  ? "bg-accent"
                  : s.someLate
                    ? "bg-warning"
                    : "bg-success"
                : "";
              return (
                <button
                  key={i}
                  disabled={!inMonth}
                  onClick={() => setSelected(d)}
                  className={cn(
                    "aspect-square rounded-xl border border-transparent p-1 text-xs sm:text-sm transition min-h-[40px]",
                    inMonth ? "" : "opacity-30 pointer-events-none",
                    isToday && "border-primary font-black",
                    selected?.toDateString() === d.toDateString() && "ring-2 ring-primary bg-secondary/30",
                    tone && `ring-1 ${tone}`,
                  )}
                >
                  <div className="flex h-full flex-col items-center justify-between">
                    <span className="font-semibold">{d.getDate()}</span>
                    {s ? (
                      <span className={cn("size-1.5 sm:size-2 rounded-full", dotColor)} />
                    ) : (
                      <span className="h-2 w-2" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <Legend />
        </div>

        <aside className="rounded-3xl border border-border/60 bg-card p-4 sm:p-6 shadow-card">
          {!selected ? (
            <>
              <h3 className="text-base sm:text-lg font-black tracking-tight">Seleziona un giorno</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Clicca una data per vedere le assunzioni registrate.
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-border/40 pb-2">
                <h3 className="text-base sm:text-lg font-black capitalize tracking-tight">
                  {selected.toLocaleDateString("it-IT", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                </h3>
                <button 
                  onClick={() => setSelected(null)}
                  className="sm:hidden text-xs font-bold text-muted-foreground bg-secondary px-2 py-1 rounded-full"
                >
                  Chiudi
                </button>
              </div>
              <ul className="mt-4 space-y-2 max-h-[320px] overflow-y-auto pr-1">
                {dayDoses.length === 0 && (
                  <li className="text-sm text-muted-foreground">
                    Nessuna terapia programmata in questo giorno.
                  </li>
                )}
                {dayDoses.map((d) => {
                  const takenLate = wasTakenLate(d);
                  const delay = doseDelayMinutes(d);
                  return (
                  <li
                    key={d.id}
                    className="rounded-xl border border-border/50 p-3"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-mono text-xs sm:text-sm font-bold text-primary">
                        {formatTime(d.scheduledAt)}
                      </span>
                      <span
                        className={cn(
                          "text-[9px] sm:text-[10px] font-bold uppercase tracking-widest",
                          d.status === "taken"
                            ? takenLate
                              ? "text-accent"
                              : "text-success"
                            : d.status === "late" || d.status === "skipped"
                              ? "text-accent"
                              : "text-muted-foreground",
                        )}
                      >
                        {takenLate ? "In ritardo" : statusLabel[d.status]}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm font-semibold">
                      {d.therapy.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {d.therapy.dosage} · {d.therapy.quantity} unità
                    </p>
                    {d.event?.confirmedAt && (
                      <p
                        className={cn(
                          "mt-1 text-xs",
                          takenLate ? "text-accent" : "text-success",
                        )}
                      >
                        Confermata alle {formatTime(new Date(d.event.confirmedAt))}
                        {takenLate && delay !== null
                          ? ` (${Math.round(delay)} min di ritardo)`
                          : ""}
                      </p>
                    )}
                  </li>
                  );
                })}
              </ul>
            </>
          )}
        </aside>
      </div>

      {/* Breakdown per terapia */}
      {stats.perTherapy.length > 0 && (
        <div className="mt-6 rounded-3xl border border-border/60 bg-card p-4 sm:p-6 shadow-card">
          <h3 className="text-base sm:text-lg font-black tracking-tight">
            Dettaglio per terapia
          </h3>
          <p className="text-xs text-muted-foreground">
            Ultimi {period} giorni
          </p>
          <div className="mt-4 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="w-[550px] text-sm md:w-full">
              <thead>
                <tr className="text-left text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  <th className="pb-2">Terapia</th>
                  <th className="pb-2 text-right">Prese</th>
                  <th className="pb-2 text-right">Ritardo</th>
                  <th className="pb-2 text-right">Saltate</th>
                  <th className="pb-2 text-right">Aderenza</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {stats.perTherapy.map((t) => (
                  <tr key={t.therapyId}>
                    <td className="py-2.5 pr-3 font-semibold text-xs sm:text-sm max-w-[170px] truncate">{t.name}</td>
                    <td className="py-2.5 text-right font-mono text-success text-xs sm:text-sm">
                      {t.taken}
                    </td>
                    <td className="py-2.5 text-right font-mono text-warning-foreground text-xs sm:text-sm">
                      {t.late}
                    </td>
                    <td className="py-2.5 text-right font-mono text-accent text-xs sm:text-sm">
                      {t.skipped}
                    </td>
                    <td className="py-2.5 text-right font-mono font-bold text-primary text-xs sm:text-sm">
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
  className,
}: {
  label: string;
  value: string;
  tone: "primary" | "warning" | "accent" | "muted";
  className?: string;
}) {
  const styles = {
    primary: "text-primary",
    warning: "text-warning-foreground",
    accent: "text-accent",
    muted: "text-foreground",
  }[tone];
  return (
    <div className={cn("rounded-2xl border border-border/60 bg-card p-3.5 sm:p-5 shadow-card flex flex-col justify-between min-w-0", className)}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
        {label}
      </p>
      <p className={cn("mt-1 text-xl sm:text-3xl font-black tracking-tight text-left", styles)}>
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
    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[10px] sm:text-xs text-muted-foreground border-t border-border/40 pt-3">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-2">
          <span className={cn("size-2 sm:size-2.5 rounded-full", i.color)} />
          {i.label}
        </span>
      ))}
    </div>
  );
}