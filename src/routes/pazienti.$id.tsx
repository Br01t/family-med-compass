import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarPlus, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { FamilyInviteCard } from "@/components/FamilyInviteCard";
import { useFamilyMed } from "@/lib/store";
import {
  formatTime,
  getAdherenceForPatient,
  getDosesForPatientOnDate,
  statusDot,
  statusLabel,
  statusTone,
} from "@/lib/therapy";
import { downloadIcs, therapyToIcs } from "@/lib/ics";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";


export const Route = createFileRoute("/pazienti/$id")({
  head: ({ params }) => ({ meta: [{ title: `Paziente ${params.id} — FamilyMed` }] }),
  component: PatientDetail,
  notFoundComponent: () => (
    <AppShell title="Paziente non trovato">
      <Button asChild>
        <Link to="/pazienti">Torna ai pazienti</Link>
      </Button>
    </AppShell>
  ),
});

function PatientDetail() {
  const { id } = Route.useParams();
  const { data, user } = useFamilyMed();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  void tick;
  const patient = data.patients.find((p) => p.id === id);

  if (!patient) {
    return (
      <AppShell title="Paziente non trovato">
        <Button asChild>
          <Link to="/pazienti">Torna ai pazienti</Link>
        </Button>
      </AppShell>
    );
  }

  const now = new Date();
  const doses = getDosesForPatientOnDate(data, patient.id, now, now);
  const adherence = getAdherenceForPatient(data, patient.id);
  const therapies = data.therapies.filter((t) => t.patientId === patient.id);
  // const caregivers = data.caregivers.filter((c) => patient.caregiverIds.includes(c.id));
  const todayEvents = data.events
    .filter((e) => e.patientId === patient.id)
    .flatMap((e) =>
      e.timeline
        .filter((t) => new Date(t.at).toDateString() === now.toDateString())
        .map((t) => ({ ...t, therapyId: e.therapyId })),
    )
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <AppShell
      title={patient.name}
      subtitle={`${patient.birthYear ? now.getFullYear() - patient.birthYear : "?"} anni · Aderenza ${adherence}%`}
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link to="/pazienti">
            <ChevronLeft className="mr-1 size-4" /> Tutti
          </Link>
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-12">
        <section className="space-y-4 lg:col-span-8">
          <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
            <h3 className="text-lg font-black tracking-tight">Terapie di oggi</h3>
            <ul className="mt-4 space-y-3">
              {doses.length === 0 && (
                <li className="text-sm text-muted-foreground">
                  Nessuna terapia programmata oggi.
                </li>
              )}
              {doses.map((d) => (
                <li
                  key={d.id}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 rounded-2xl border border-border/60 p-4"
                >
                  <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary-soft font-mono text-sm font-black text-primary">
                    {formatTime(d.scheduledAt)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-black">{d.therapy.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.therapy.dosage} · {d.therapy.quantity}x
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest",
                      statusTone[d.status],
                    )}
                  >
                    {statusLabel[d.status]}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
            <h3 className="text-lg font-black tracking-tight">Timeline di oggi</h3>
            <div className="relative mt-6 space-y-5 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-border">
              {todayEvents.length === 0 && (
                <p className="text-sm text-muted-foreground">Nessun evento oggi.</p>
              )}
              {todayEvents.map((t, i) => {
                const therapy = data.therapies.find((th) => th.id === t.therapyId);
                return (
                  <div key={i} className="relative pl-10">
                    <div className="absolute left-0 top-1.5 grid size-6 place-items-center rounded-full bg-background ring-2 ring-border">
                      <div className={cn("size-2 rounded-full", statusDot.due)} />
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                      <p className="truncate text-sm font-semibold">{t.message}</p>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {formatTime(new Date(t.at))}
                      </span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {therapy?.name}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <aside className="space-y-4 lg:col-span-4">
          <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
            <h3 className="text-lg font-black tracking-tight">Piano terapeutico</h3>
            <ul className="mt-3 space-y-2">
              {therapies.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-col gap-2 rounded-xl border border-border/50 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{t.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.times.join(", ")} · {t.dosage}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                        t.active && !t.suspended
                          ? "bg-success/15 text-success"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {t.suspended ? "Sospesa" : t.active ? "Attiva" : "Off"}
                    </span>
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => {
                            const ics = therapyToIcs(t, patient, "caregiver");
                            downloadIcs(`${t.name.replace(/\s+/g, "_")}.ics`, ics);
                            toast.success("Evento calendario esportato", {
                              description: "Apri il file per aggiungerlo al calendario.",
                            });
                          }}
                        >
                          <CalendarPlus className="mr-1.5 size-3.5" />
                          Aggiungi al calendario
                        </Button>
                      </TooltipTrigger>

                      <TooltipContent className="max-w-xs text-center">
                        <p className="font-semibold">
                          Sincronizza la terapia con il calendario
                        </p>
                        <p className="mt-1 text-xs">
                          Verrà scaricato un file calendario. Aprendolo verrà creato
                          automaticamente l'evento all'orario previsto con un promemoria
                          predefinito 30 minuti prima.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </li>
              ))}
            </ul>
            <Button variant="outline" className="mt-4 w-full" asChild>
              <Link to="/terapie">Gestisci terapie</Link>
            </Button>
          </div>

          {/* <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
            <h3 className="text-lg font-black tracking-tight">Caregiver</h3>
            <ul className="mt-3 space-y-3">
              {caregivers.map((c) => (
                <li key={c.id} className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-full bg-primary-soft font-bold text-primary">
                    {c.name.slice(0, 1)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.relation}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div> */}
        </aside>
      </div>
    </AppShell>
  );
}
