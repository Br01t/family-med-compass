import { createFileRoute } from "@tanstack/react-router";
import { CalendarPlus, FileDown, Pill, Plus, Power, PowerOff } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { AddTherapyDialog } from "@/components/AddTherapyDialog";
import { Button } from "@/components/ui/button";
import { useFamilyMed } from "@/lib/store";
import { recurrenceLabel } from "@/lib/therapy";
import { addTherapyToCalendar } from "@/lib/ics";
import { downloadTherapyReportPdf } from "@/lib/therapy-report";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";


export const Route = createFileRoute("/terapie")({
  head: () => ({ meta: [{ title: "Terapie — FamilyMed" }] }),
  component: TherapiesPage,
});

function TherapiesPage() {
  const { data, updateTherapy, deleteTherapy, isPrimaryCaregiverOf, userProfile } = useFamilyMed();
  const isPatientUser = userProfile?.role === "paziente";

  return (
    <AppShell
      title="Gestione terapie"
      subtitle="Modifica piani, orari e reminder per ogni paziente"
      actions={!isPatientUser && data.patients.some((p) => isPrimaryCaregiverOf(p.id)) ? <AddTherapyDialog /> : undefined}
    >
      <div className="space-y-8">
        {data.patients.map((p) => {
          const therapies = data.therapies.filter((t) => t.patientId === p.id);
          const canManage = isPrimaryCaregiverOf(p.id);
          return (
            <section key={p.id}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-xl bg-primary-soft font-black text-primary">
                    {p.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </div>
                  <div>
                    <h2 className="text-xl font-black tracking-tight">{p.name}</h2>
                    <p className="text-xs text-muted-foreground">
                      {therapies.length} terapie
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (therapies.length === 0) {
                              toast.error("Nessuna terapia da includere nel resoconto");
                              return;
                            }
                            downloadTherapyReportPdf(data, p, new Date());
                            toast.success("Resoconto PDF scaricato", {
                              description: p.name,
                            });
                          }}
                        >
                          <FileDown className="mr-1.5 size-3.5" />
                          Resoconto PDF
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-center">
                        <p className="font-semibold">
                          Scarica il resoconto completo
                        </p>
                        <p className="mt-1 text-xs">
                          Un PDF con tutte le terapie di {p.name} e la timeline
                          delle dosi di oggi (orari, stato, conferme).
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  {canManage && (
                    <AddTherapyDialog
                      initialPatientId={p.id}
                      trigger={
                        <Button variant="outline" size="sm" id={`add-therapy-${p.id}`}>
                          <Plus className="mr-1.5 size-3.5" /> Terapia
                        </Button>
                      }
                    />
                  )}
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {therapies.map((t) => (
                  <div
                    key={t.id}
                    className={cn(
                      "rounded-3xl border border-border/60 bg-card p-5 shadow-card transition",
                      t.suspended && "opacity-60",
                    )}
                  >
                    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
                      {t.photoDrug ? (
                        <img
                          src={t.photoDrug}
                          alt={t.name}
                          className="size-11 shrink-0 rounded-xl object-cover"
                        />
                      ) : (
                        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                          <Pill className="size-5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-lg font-black">{t.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.dosage} · {t.quantity} compressa/e
                        </p>
                      </div>
                      {canManage && (
                        <button
                          onClick={() => {
                            updateTherapy(t.id, { suspended: !t.suspended });
                            toast(t.suspended ? "Terapia riattivata" : "Terapia sospesa", {
                              description: t.name,
                            });
                          }}
                          className={cn(
                            "grid size-9 shrink-0 place-items-center rounded-lg border border-border/60 transition",
                            t.suspended
                              ? "text-muted-foreground hover:text-primary"
                              : "text-success hover:bg-secondary",
                          )}
                          aria-label="Sospendi terapia"
                        >
                          {t.suspended ? (
                            <PowerOff className="size-4" />
                          ) : (
                            <Power className="size-4" />
                          )}
                        </button>
                      )}
                    </div>

                    <dl className="mt-4 space-y-2 text-sm">
                      <Row label="Orari">
                        <span className="font-mono font-semibold">
                          {t.times.join(" · ")}
                        </span>
                      </Row>
                      <Row label="Ricorrenza">{recurrenceLabel(t.recurrence)}</Row>
                      <Row label="Categoria">{t.category}</Row>
                      <Row label="Timeout">{t.timeoutMinutes} min</Row>
                      <Row label="Reminder">
                        {t.reminderIntervals.map((r) => `${Math.abs(r)} min prima`).join(", ")}
                      </Row>
                      <Row label="Scorta">
                        <span
                          className={cn(
                            "font-bold",
                            t.pillsRemaining <= t.lowStockThreshold
                              ? "text-accent"
                              : "text-success",
                          )}
                        >
                          {t.pillsRemaining} compresse
                        </span>
                      </Row>
                    </dl>

                    {t.photoPackage && (
                      <div className="mt-3">
                        <p className="mb-1.5 text-xs uppercase tracking-widest text-muted-foreground">
                          Confezione
                        </p>
                        <img
                          src={t.photoPackage}
                          alt={`Confezione di ${t.name}`}
                          className="h-24 w-full rounded-lg border border-border/50 object-cover"
                        />
                      </div>
                    )}

                    {t.notes && (
                      <p className="mt-3 rounded-lg bg-surface-muted p-3 text-xs italic text-muted-foreground">
                        {t.notes}
                      </p>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      {canManage && (
                        <AddTherapyDialog
                          editTherapy={t}
                          trigger={
                            <Button variant="outline" size="sm" className="flex-1">
                              Modifica
                            </Button>
                          }
                        />
                      )}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const method = addTherapyToCalendar(t, p);
                                if (method === "google") {
                                  toast.success("Apri Google Calendar per salvare l'evento", {
                                    description:
                                      "Si è aperta una nuova scheda per ogni orario: tocca \"Salva\" per confermare.",
                                  });
                                } else {
                                  toast.success("Evento calendario esportato", {
                                    description: "Apri il file per aggiungerlo al calendario del telefono.",
                                  });
                                }
                              }}
                            >
                              <CalendarPlus className="mr-1.5 size-3.5" />
                              Calendario
                            </Button>
                          </TooltipTrigger>

                          <TooltipContent className="max-w-xs text-center">
                            <p className="font-semibold">
                              Aggiungi questa terapia al calendario
                            </p>
                            <p className="mt-1 text-xs">
                              Verrà scaricato un file calendario. Aprendolo verrà creato l'evento
                              all'orario esatto della cura con un promemoria automatico 30 minuti prima.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => {
                            if (confirm(`Eliminare "${t.name}"?`)) {
                              deleteTherapy(t.id);
                              toast.success("Terapia eliminata");
                            }
                          }}
                        >
                          Elimina
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </AppShell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-3">
      <dt className="text-xs uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className="truncate text-right">{children}</dd>
    </div>
  );
}