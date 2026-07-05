import { createFileRoute, Link } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { AddPatientDialog } from "@/components/AddPatientDialog";
import { useFamilyMed } from "@/lib/store";
import { getAdherenceForPatient, getNextDose, formatTime } from "@/lib/therapy";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pazienti/")({
  head: () => ({ meta: [{ title: "Pazienti — FamilyMed" }] }),
  component: PatientsListPage,
});

function PatientsListPage() {
  const { data, deletePatient } = useFamilyMed();
  return (
    <AppShell
      title="I tuoi pazienti"
      subtitle={`${data.patients.length} persone seguite`}
      actions={<AddPatientDialog />}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.patients.map((p) => {
          const adherence = getAdherenceForPatient(data, p.id);
          const next = getNextDose(data, p.id);
          return (
            <div key={p.id} className="group relative">
              <Link
                to="/pazienti/$id"
                params={{ id: p.id }}
                className="block rounded-3xl border border-border/60 bg-card p-6 shadow-card transition hover:shadow-lift"
              >
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4">
                  <div className="grid size-14 place-items-center rounded-2xl bg-primary-soft font-black text-primary">
                    {p.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-lg font-black">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date().getFullYear() - p.birthYear} anni ·{" "}
                      {p.caregiverIds.length} caregiver
                    </p>
                  </div>
                  <p
                    className={cn(
                      "shrink-0 text-2xl font-black",
                      adherence >= 90
                        ? "text-success"
                        : adherence >= 75
                          ? "text-primary"
                          : "text-accent",
                    )}
                  >
                    {adherence}%
                  </p>
                </div>
                <div className="mt-4 rounded-xl bg-surface-muted p-3 text-sm">
                  {next ? (
                    <p className="min-w-0 truncate">
                      Prossima:{" "}
                      <span className="font-semibold">{next.therapy.name}</span> ·{" "}
                      <span className="font-mono text-primary">
                        {formatTime(next.scheduledAt)}
                      </span>
                    </p>
                  ) : (
                    <p className="text-success">Giornata completata</p>
                  )}
                </div>
              </Link>
              {/* Delete button */}
              <button
                className="absolute right-4 top-4 grid size-8 place-items-center rounded-lg border border-border/60 bg-card text-muted-foreground opacity-0 transition hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                aria-label="Elimina paziente"
                onClick={(e) => {
                  e.preventDefault();
                  if (confirm(`Eliminare il paziente "${p.name}" e tutte le sue terapie?`)) {
                    deletePatient(p.id);
                    toast.success("Paziente eliminato", { description: p.name });
                  }
                }}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
