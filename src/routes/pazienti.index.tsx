import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Trash2, UserCheck, UserPlus2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { AddPatientDialog } from "@/components/AddPatientDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFamilyMed } from "@/lib/store";
import { getAdherenceForPatient, getNextDose, formatTime } from "@/lib/therapy";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pazienti/")({
  head: () => ({ meta: [{ title: "Pazienti — FamilyMed" }] }),
  component: PatientsListPage,
});

function PatientsListPage() {
  const {
    data,
    allPatients,
    followPatient,
    unfollowPatient,
    refreshAllPatients,
    deletePatient,
    userProfile,
  } = useFamilyMed();

  const isCaregiver = userProfile?.role === "caregiver";
  const [query, setQuery] = useState("");
  const followedIds = useMemo(
    () => new Set(data.patients.map((p) => p.id)),
    [data.patients],
  );

  const filteredAll = useMemo(() => {
    if (!query.trim()) return allPatients;
    const q = query.toLowerCase();
    return allPatients.filter((p) => p.name.toLowerCase().includes(q));
  }, [allPatients, query]);

  async function handleFollow(id: string, name: string) {
    try {
      await followPatient(id);
      toast.success("Ora segui questo paziente", { description: name });
      await refreshAllPatients();
    } catch (e) {
      toast.error("Impossibile seguire", {
        description: e instanceof Error ? e.message : "Riprova.",
      });
    }
  }

  async function handleUnfollow(id: string, name: string) {
    try {
      await unfollowPatient(id);
      toast.success("Hai smesso di seguire", { description: name });
      await refreshAllPatients();
    } catch (e) {
      toast.error("Impossibile scollegare", {
        description: e instanceof Error ? e.message : "Riprova.",
      });
    }
  }

  return (
    <AppShell
      title="I tuoi pazienti"
      subtitle={`${data.patients.length} persone seguite`}
      actions={<AddPatientDialog />}
    >
      {/* Seguiti */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-muted-foreground">
          Pazienti che segui
        </h2>
        {data.patients.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border/60 bg-surface-muted p-8 text-center text-sm text-muted-foreground">
            Non segui ancora nessun paziente. Scegli dalla lista sotto o creane uno nuovo.
          </div>
        ) : (
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
                          {p.birthYear ? new Date().getFullYear() - p.birthYear : "?"} anni
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
                        <p className="text-success">Nessuna dose in coda</p>
                      )}
                    </div>
                  </Link>

                  <div className="absolute right-4 top-4 flex gap-2 opacity-0 transition group-hover:opacity-100">
                    {isCaregiver && (
                      <button
                        className="grid size-8 place-items-center rounded-lg border border-border/60 bg-card text-muted-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                        aria-label="Smetti di seguire"
                        onClick={(e) => {
                          e.preventDefault();
                          handleUnfollow(p.id, p.name);
                        }}
                      >
                        <UserCheck className="size-3.5" />
                      </button>
                    )}
                    <button
                      className="grid size-8 place-items-center rounded-lg border border-border/60 bg-card text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
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
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Tutti i pazienti registrati — solo caregiver */}
      {isCaregiver && (
        <section className="mt-10">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
                Tutti i pazienti registrati
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Scegli chi seguire tra i pazienti presenti nel sistema.
              </p>
            </div>
            <Input
              placeholder="Cerca per nome…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="max-w-xs"
            />
          </div>

          {filteredAll.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border/60 bg-surface-muted p-8 text-center text-sm text-muted-foreground">
              Nessun paziente trovato.
            </div>
          ) : (
            <div className="divide-y divide-border/60 overflow-hidden rounded-3xl border border-border/60 bg-card shadow-card">
              {filteredAll.map((p) => {
                const followed = followedIds.has(p.id);
                return (
                  <div
                    key={p.id}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 p-4"
                  >
                    <div className="grid size-10 place-items-center rounded-xl bg-primary-soft text-sm font-black text-primary">
                      {p.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.birthYear ? `Anno ${p.birthYear}` : "Anno non specificato"}
                        {p.userId ? " · account paziente" : " · gestito da caregiver"}
                      </p>
                    </div>
                    {followed ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUnfollow(p.id, p.name)}
                      >
                        <UserCheck className="mr-2 size-4 text-primary" />
                        Seguito
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => handleFollow(p.id, p.name)}>
                        <UserPlus2 className="mr-2 size-4" />
                        Segui
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </AppShell>
  );
}
