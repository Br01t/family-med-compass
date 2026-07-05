import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useFamilyMed } from "@/lib/store";
import {
  formatTime,
  getDosesForPatientOnDate,
} from "@/lib/therapy";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/storico")({
  head: () => ({ meta: [{ title: "Storico — FamilyMed" }] }),
  component: HistoryPage,
});

function HistoryPage() {
  const { data } = useFamilyMed();
  const patients = data.patients;
  const [patientId, setPatientId] = useState(patients[0]?.id);
  const [selected, setSelected] = useState<Date | null>(null);

  const now = new Date();
  const days = useMemo(() => {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const startPad = (monthStart.getDay() + 6) % 7; // start monday
    const total = startPad + monthEnd.getDate();
    const cells = Math.ceil(total / 7) * 7;
    return Array.from({ length: cells }, (_, i) => {
      const d = new Date(monthStart);
      d.setDate(1 + i - startPad);
      return d;
    });
  }, [now]);

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

  const dayDoses = selected
    ? getDosesForPatientOnDate(data, patientId!, selected, now)
    : [];

  return (
    <AppShell title="Storico" subtitle="Calendario mensile e dettaglio giornaliero">
      <div className="flex flex-wrap gap-2">
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
      </div>

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
                Clicca su una data per vedere l'elenco delle terapie e i loro stati.
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
                    Nessuna terapia in questo giorno.
                  </li>
                )}
                {dayDoses.map((d) => (
                  <li
                    key={d.id}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border/50 p-3"
                  >
                    <span className="shrink-0 font-mono text-sm font-bold text-primary">
                      {formatTime(d.scheduledAt)}
                    </span>
                    <span className="truncate text-sm font-semibold">
                      {d.therapy.name}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-xs font-bold",
                        d.status === "taken"
                          ? "text-success"
                          : d.status === "late" || d.status === "skipped"
                            ? "text-accent"
                            : "text-muted-foreground",
                      )}
                    >
                      {d.status === "taken"
                        ? "✓"
                        : d.status === "late" || d.status === "skipped"
                          ? "✕"
                          : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
      </div>
    </AppShell>
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
