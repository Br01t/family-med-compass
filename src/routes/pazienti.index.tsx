import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { KeyRound, Link2Off, Trash2 } from "lucide-react";
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
    redeemInvite,
    unfollowPatient,
    deletePatient,
    userProfile,
    isPrimaryCaregiverOf,
    isSecondaryCaregiverOf,
  } = useFamilyMed();

  const isCaregiver = userProfile?.role === "caregiver";
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);

  async function handleRedeem(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) {
      toast.error("Codice invalido", { description: "Inserisci il codice che ti ha dato il paziente." });
      return;
    }
    setRedeeming(true);
    try {
      await redeemInvite(trimmed);
      toast.success("Collegamento riuscito", {
        description: "Ora fai parte della famiglia di questo paziente.",
      });
      setCode("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Riprova.";
      toast.error("Impossibile usare il codice", { description: msg });
    } finally {
      setRedeeming(false);
    }
  }

  async function handleUnfollow(id: string, name: string) {
    if (!confirm(`Scollegarti dalla famiglia di ${name}? Perderai l'accesso ai suoi dati.`)) return;
    try {
      await unfollowPatient(id);
      toast.success("Scollegato dalla famiglia", { description: name });
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
      {/* Redeem invite */}
      {isCaregiver && (
        <section className="mb-6 rounded-3xl border border-border/60 bg-card p-6 shadow-card">
          <div className="mb-3 flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary">
              <KeyRound className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-black">Collegati a un nuovo paziente</h2>
              <p className="text-xs text-muted-foreground">
                Inserisci il codice invito generato dal paziente dalle sue Impostazioni.
              </p>
            </div>
          </div>
          <form onSubmit={handleRedeem} className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Codice invito (es. A3F7K2)"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={12}
              className="font-mono tracking-widest"
              autoCapitalize="characters"
            />
            <Button type="submit" disabled={redeeming || code.trim().length < 4}>
              {redeeming ? "Verifica…" : "Usa codice"}
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">
            Per motivi di privacy non esiste più un elenco pubblico dei pazienti: solo chi possiede
            un codice valido può collegarsi a una famiglia.
          </p>
        </section>
      )}

      {/* Seguiti */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-muted-foreground">
          Pazienti che segui
        </h2>
        {data.patients.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border/60 bg-surface-muted p-8 text-center text-sm text-muted-foreground">
            {isCaregiver
              ? "Non segui ancora nessun paziente. Chiedi al paziente un codice invito, oppure crea tu un nuovo paziente."
              : "Nessun paziente collegato al tuo account."}
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
                        aria-label="Scollegati dalla famiglia"
                        onClick={(e) => {
                          e.preventDefault();
                          handleUnfollow(p.id, p.name);
                        }}
                      >
                        <Link2Off className="size-3.5" />
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
    </AppShell>
  );
}
