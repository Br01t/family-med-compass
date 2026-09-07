import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock, Copy, Package, Plus, Share2, ShoppingCart, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { SecondaryCaregiverNotice } from "@/components/SecondaryCaregiverNotice";
import { Button } from "@/components/ui/button";
import { useFamilyMed } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useFeatureToggles } from "@/lib/feature-toggles";
import { DisabledFeatureBanner } from "@/components/DisabledFeatureBanner";
import { PlanGate } from "@/components/PlanGate";

export const Route = createFileRoute("/scorte")({
  head: () => ({ meta: [{ title: "Scorte — FamilyMed" }] }),
  component: InventoryPage,
});

function InventoryPage() {
  const { data, updateTherapy, isPrimaryCaregiverOf, isSecondaryCaregiverOf } = useFamilyMed();
  const { toggles } = useFeatureToggles();

  if (!toggles.scorte) {
    return (
      <AppShell title="Gestione scorte" subtitle="Confezioni e compresse residue">
        <DisabledFeatureBanner featureName="Scorte farmaci" />
      </AppShell>
    );
  }

  const grouped = data.patients.map((p) => ({
    patient: p,
    items: data.therapies.filter((t) => t.patientId === p.id),
    canManage: isPrimaryCaregiverOf(p.id),
  }));
  const hasSecondaryRole = data.patients.some((p) => isSecondaryCaregiverOf(p.id));

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
        {hasSecondaryRole && <SecondaryCaregiverNotice context="scorte" />}
        {grouped.map(({ patient, items, canManage }) => (
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
                      {canManage && (
                        <Button size="sm" variant="outline" className="h-8 text-xs shrink-0" onClick={() => addPack(t.id)}>
                          <Plus className="mr-1 size-3.5" /> Confezione
                        </Button>
                      )}
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
                          {canManage && (
                            <Button size="sm" variant="outline" onClick={() => addPack(t.id)}>
                              <Plus className="mr-1 size-4" /> Confezione
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}

        {/* Sezione Previsione & Riordino (Pro / Max) */}
        <PlanGate
          feature="stockDepletionPrediction"
          title="Previsioni di consumo & riordino"
          description="La data stimata di esaurimento scorte per ogni terapia, con il giorno consigliato per l'acquisto, è disponibile con i piani Pro e Max."
        >
          <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2">
              <CalendarClock className="size-5 text-primary" />
              <h3 className="font-bold text-lg tracking-tight text-foreground">
                Previsioni di consumo e riordino
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Quando finiscono davvero le scorte: data stimata di esaurimento e giorno
              consigliato per acquistare, calcolati su consumo e ricorrenza di ogni terapia.
            </p>
            <StockPredictions therapies={data.therapies} />
          </div>
        </PlanGate>

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
            l'affidabilità nella gestione della terapia.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
// ---------- Previsioni esaurimento scorte ----------

type TherapyLike = {
  id: string;
  patientId: string;
  name: string;
  dosage: string;
  quantity: number;
  times: string[];
  recurrence:
    | { kind: "daily" }
    | { kind: "weekdays" }
    | { kind: "weekend" }
    | { kind: "every_x_days"; x: number }
    | { kind: "specific_days"; days: number[] };
  startDate: string;
  endDate?: string;
  pillsRemaining: number;
  lowStockThreshold: number;
  active: boolean;
  suspended: boolean;
};

function scheduledOnDate(t: TherapyLike, date: Date): boolean {
  const start = new Date(t.startDate + "T00:00:00");
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  if (day < start) return false;
  if (t.endDate && day > new Date(t.endDate + "T23:59:59")) return false;
  const dow = day.getDay();
  switch (t.recurrence.kind) {
    case "daily":
      return true;
    case "weekdays":
      return dow >= 1 && dow <= 5;
    case "weekend":
      return dow === 0 || dow === 6;
    case "every_x_days": {
      const diff = Math.floor((day.getTime() - start.getTime()) / 86_400_000);
      return diff % t.recurrence.x === 0;
    }
    case "specific_days":
      return t.recurrence.days.includes(dow);
  }
}

/** Compresse consumate in media al giorno, stimata sui prossimi 30 giorni di calendario. */
function avgDailyConsumption(t: TherapyLike): number {
  const perDoseDay = t.quantity * Math.max(t.times.length, 1);
  if (perDoseDay <= 0) return 0;
  let doseDays = 0;
  const today = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    if (scheduledOnDate(t, d)) doseDays++;
  }
  return (doseDays * perDoseDay) / 30;
}

const dayFmt = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long" });

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

type Prediction = {
  therapy: TherapyLike;
  daysLeft: number; // arrotondato per difetto
  depletionDate: Date;
  purchaseBy: Date; // esaurimento - 2 giorni di margine
};

function buildPredictions(therapies: TherapyLike[]): Prediction[] {
  const today = new Date();
  return therapies
    .filter((t) => t.active && !t.suspended)
    .map((t) => {
      const perDay = avgDailyConsumption(t);
      const daysLeft = perDay > 0 ? Math.floor(t.pillsRemaining / perDay) : Number.POSITIVE_INFINITY;
      const depletionDate = addDays(today, Number.isFinite(daysLeft) ? daysLeft : 3650);
      const purchaseBy = addDays(depletionDate, -2);
      return { therapy: t, daysLeft, depletionDate, purchaseBy };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

function StockPredictions({ therapies }: { therapies: TherapyLike[] }) {
  const { data } = useFamilyMed();
  const patientName = (id: string) => data.patients.find((p) => p.id === id)?.name ?? "Paziente";
  const predictions = buildPredictions(therapies);

  if (predictions.length === 0) {
    return <p className="text-sm text-muted-foreground">Nessuna terapia attiva da analizzare.</p>;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <ul className="space-y-3">
      {predictions.map(({ therapy: t, daysLeft, depletionDate, purchaseBy }) => {
        const buyDate = purchaseBy < today ? today : purchaseBy;
        const urgent = daysLeft <= 5;
        const warning = !urgent && daysLeft <= 10;
        return (
          <li
            key={t.id}
            className={cn(
              "flex flex-col gap-2 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between",
              urgent
                ? "border-accent/40 bg-accent-soft"
                : warning
                  ? "border-warning/40 bg-warning/10"
                  : "border-border/60 bg-surface-muted",
            )}
          >
            <div className="min-w-0">
              <p className="truncate font-bold text-sm">
                {t.name} <span className="font-normal text-muted-foreground">· {t.dosage}</span>
              </p>
              <p className="text-xs text-muted-foreground">{patientName(t.patientId)}</p>
            </div>
            <div className="text-sm sm:text-right">
              <p className="font-bold">
                ≈ {Number.isFinite(daysLeft) ? `${daysLeft} ${daysLeft === 1 ? "giorno rimasto" : "giorni rimasti"}` : "scorta non stimabile"}
                {Number.isFinite(daysLeft) && (
                  <span className="block text-xs font-normal text-muted-foreground">
                    fino a {dayFmt.format(depletionDate)}
                  </span>
                )}
              </p>
              {(urgent || warning) && Number.isFinite(daysLeft) && (
                <p className={cn("mt-1 flex items-center gap-1 text-xs font-bold sm:justify-end", urgent ? "text-accent" : "text-warning-foreground")}>
                  <TriangleAlert className="size-3.5 shrink-0" />
                  Acquista entro {buyDate.getTime() === today.getTime() ? "oggi" : dayFmt.format(buyDate)}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ---------- Lista della spesa farmaci ----------

type ShoppingItem = {
  name: string;
  dosage: string;
  patient: string;
  packs: number;
  daysLeft: number;
};

/** Margine: una terapia entra in lista se finisce entro 10 giorni; si coprono 30 giorni. */
function buildShoppingList(predictions: Prediction[], patientName: (id: string) => string): ShoppingItem[] {
  return predictions
    .filter(({ therapy: t, daysLeft }) => Number.isFinite(daysLeft) && daysLeft <= 10)
    .map(({ therapy: t, daysLeft }) => {
      const perDay = avgDailyConsumption(t);
      const target = perDay * 30; // copertura 30 giorni
      const missing = Math.max(target - t.pillsRemaining, 0);
      const packs = Math.max(1, Math.ceil(missing / Math.max(t.pillsPerPack, 1)));
      return {
        name: t.name,
        dosage: t.dosage,
        patient: patientName(t.patientId),
        packs,
        daysLeft,
      };
    });
}

function shoppingListText(items: ShoppingItem[]): string {
  const lines = items.map(
    (i) => `• ${i.name} ${i.dosage} — ${i.packs} ${i.packs === 1 ? "confezione" : "confezioni"} (${i.patient})`,
  );
  return ["🛒 Lista della spesa farmaci — FamilyMed", "", ...lines].join("\n");
}

function ShoppingList({
  predictions,
  patientName,
}: {
  predictions: Prediction[];
  patientName: (id: string) => string;
}) {
  const items = buildShoppingList(predictions, patientName);
  if (items.length === 0) return null;

  const text = shoppingListText(items);

  const shareWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };

  const copyList = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Lista copiata", { description: "Puoi incollarla dove vuoi." });
    } catch {
      toast.error("Copia non riuscita", { description: "Il browser non consente l'accesso agli appunti." });
    }
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5 space-y-4">
      <div className="flex items-center gap-2">
        <ShoppingCart className="size-5 text-primary" />
        <h4 className="font-bold tracking-tight">Lista della spesa</h4>
      </div>
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={`${i.name}-${i.patient}`} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              <b>{i.name}</b> <span className="text-muted-foreground">{i.dosage} · {i.patient}</span>
            </span>
            <span className="shrink-0 rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-bold text-primary">
              {i.packs} {i.packs === 1 ? "confezione" : "confezioni"}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button className="flex-1" onClick={shareWhatsApp}>
          <Share2 className="mr-2 size-4" /> Condividi via WhatsApp
        </Button>
        <Button variant="outline" className="flex-1" onClick={copyList}>
          <Copy className="mr-2 size-4" /> Copia lista
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Utile da mandare a un familiare che passa in farmacia o da mostrare al medico.
      </p>
    </div>
  );
}
