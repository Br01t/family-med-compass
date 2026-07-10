import { createFileRoute } from "@tanstack/react-router";
import { Package, Plus } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useFamilyMed } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/scorte")({
  head: () => ({ meta: [{ title: "Scorte — FamilyMed" }] }),
  component: InventoryPage,
});

function InventoryPage() {
  const { data, updateTherapy } = useFamilyMed();

  const grouped = data.patients.map((p) => ({
    patient: p,
    items: data.therapies.filter((t) => t.patientId === p.id),
  }));

  const addPack = (id: string) => {
    const t = data.therapies.find((x) => x.id === id);
    if (!t) return;
    updateTherapy(id, {
      packs: t.packs + 1,
      pillsRemaining: t.pillsRemaining + t.pillsPerPack,
    });
    toast.success("Confezione aggiunta", { description: `${t.name} +${t.pillsPerPack} compresse` });
  };

  return (
    <AppShell title="Gestione scorte" subtitle="Confezioni e compresse residue">
      <div className="w-full max-w-full block space-y-8 text-left min-w-0 overflow-hidden">
        {grouped.map(({ patient, items }) => (
          <section key={patient.id} className="block w-full min-w-0">
            <h2 className="mb-4 text-base sm:text-lg font-black tracking-tight">{patient.name}</h2>
            
            {/* VISTA MOBILE: Lista di Card (nascosta da md: in su) */}
            <div className="space-y-3 md:hidden">
              {items.map((t) => {
                const perDay = t.quantity * t.times.length;
                const daysLeft = Math.floor(t.pillsRemaining / Math.max(perDay, 1));
                const pct = Math.min(
                  100,
                  Math.round((t.pillsRemaining / (t.pillsPerPack * Math.max(t.packs, 1))) * 100),
                );
                const level =
                  pct <= 10
                    ? "Critico"
                    : pct <= 25
                      ? "Basso"
                      : pct <= 50
                        ? "Medio"
                        : pct <= 75
                          ? "Buono"
                          : "Pieno";

                return (
                  <div key={t.id} className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm space-y-3">
                    {/* Header farmaco */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                          <Package className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-bold text-sm">{t.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{t.dosage}</p>
                        </div>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                          pct <= 25
                            ? "bg-accent-soft text-accent"
                            : pct <= 50
                              ? "bg-warning/15 text-warning-foreground"
                              : "bg-success/10 text-success",
                        )}
                      >
                        {level}
                      </span>
                    </div>

                    {/* Info pillole e autonomia */}
                    <div className="grid grid-cols-2 gap-2 border-t border-b border-border/40 py-2.5 text-xs">
                      <div>
                        <p className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">Compresse</p>
                        <p className="font-mono font-bold mt-0.5">
                          {t.pillsRemaining}
                          <span className="text-muted-foreground font-normal"> / {t.pillsPerPack * Math.max(t.packs, 1)}</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">Autonomia</p>
                        <p className="font-semibold mt-0.5">~{daysLeft} giorni</p>
                      </div>
                    </div>

                    {/* Barra progresso e Bottone azione */}
                    <div className="flex items-center justify-between gap-4 pt-1">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                        <div
                          className={cn(
                            "h-full transition-all",
                            pct <= 10
                              ? "bg-accent"
                              : pct <= 25
                                ? "bg-warning"
                                : pct <= 50
                                  ? "bg-warning/70"
                                  : pct <= 75
                                    ? "bg-primary"
                                    : "bg-success",
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <Button size="sm" variant="outline" className="h-8 text-xs shrink-0" onClick={() => addPack(t.id)}>
                        <Plus className="mr-1 size-3.5" /> Confezione
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* VISTA DESKTOP: Tabella classica (nascosta su mobile, visibile da md: in su) */}
            <div className="hidden md:block overflow-x-auto rounded-3xl border border-border/60 bg-card shadow-card w-full">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted text-left text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Farmaco</th>
                    <th className="px-4 py-3">Compresse</th>
                    <th className="px-4 py-3">Autonomia</th>
                    <th className="px-4 py-3">Livello</th>
                    <th className="px-4 py-3 text-right">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((t) => {
                    const perDay = t.quantity * t.times.length;
                    const daysLeft = Math.floor(t.pillsRemaining / Math.max(perDay, 1));
                    const pct = Math.min(
                      100,
                      Math.round((t.pillsRemaining / (t.pillsPerPack * Math.max(t.packs, 1))) * 100),
                    );
                    const level =
                      pct <= 10
                        ? "Critico"
                        : pct <= 25
                          ? "Basso"
                          : pct <= 50
                            ? "Medio"
                            : pct <= 75
                              ? "Buono"
                              : "Pieno";
                    return (
                      <tr key={t.id} className="border-t border-border/50">
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="grid size-9 place-items-center rounded-lg bg-primary-soft text-primary">
                              <Package className="size-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-bold">{t.name}</p>
                              <p className="text-xs text-muted-foreground">{t.dosage}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 font-mono font-semibold">
                          {t.pillsRemaining}
                          <span className="text-xs text-muted-foreground">
                            {" "}
                            / {t.pillsPerPack * Math.max(t.packs, 1)}
                          </span>
                        </td>
                        <td className="px-4 py-4">~{daysLeft} giorni</td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-secondary">
                              <div
                                className={cn(
                                  "h-full transition-all",
                                  pct <= 10
                                    ? "bg-accent"
                                    : pct <= 25
                                      ? "bg-warning"
                                      : pct <= 50
                                        ? "bg-warning/70"
                                        : pct <= 75
                                          ? "bg-primary"
                                          : "bg-success",
                                )}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                                pct <= 25
                                  ? "bg-accent-soft text-accent"
                                  : pct <= 50
                                    ? "bg-warning/15 text-warning-foreground"
                                    : "bg-success/10 text-success",
                              )}
                            >
                              {level}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <Button size="sm" variant="outline" onClick={() => addPack(t.id)}>
                            <Plus className="mr-1 size-4" /> Confezione
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}

        {/* Box informativo inferiore corretto e fluido */}
        <div className="rounded-2xl border border-primary/20 bg-primary-soft p-4 sm:p-6 shadow-card block w-full">
          <h3 className="text-base sm:text-lg font-black tracking-tight text-primary">
            Verifica scorte con il paziente
          </h3>
          <p className="mt-2 text-xs sm:text-sm leading-relaxed text-muted-foreground">
            Questa sezione può essere utilizzata come <b>controllo aggiuntivo</b> insieme al paziente.
            Quando arriva un avviso di scorte in esaurimento (ad esempio quando rimangono 10 pillole), puoi contattare il paziente e chiedere conferma della quantità realmente disponibile.
          </p>
          <p className="mt-3 text-xs sm:text-sm leading-relaxed text-muted-foreground">
            Questo doppio controllo permette di individuare eventuali differenze tra le scorte
            registrate nell'app e quelle effettivamente presenti, migliorando la sicurezza e
            l'affidabilità della gestione della terapia.
          </p>
        </div>
      </div>
    </AppShell>
  );
}