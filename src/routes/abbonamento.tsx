import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Check,
  X,
  Sparkles,
  ShieldCheck,
  Zap,
  Users,
  Pill,
  Clock,
  FileText,
  Lock,
  ArrowLeft,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFamilyMed } from "@/lib/store";
import { PLAN_LIMITS, formatPrice, type SubscriptionPlan } from "@/lib/subscription";
import { toast } from "sonner";

export const Route = createFileRoute("/abbonamento")({
  component: AbbonamentoPage,
});

function AbbonamentoPage() {
  const { subscriptionPlan, updateSubscriptionPlan, userProfile } = useFamilyMed();
  const [isAnnual, setIsAnnual] = useState(false);
  const [updating, setUpdating] = useState(false);

  const handleSwitchPlan = async (plan: SubscriptionPlan) => {
    if (plan === subscriptionPlan) return;
    setUpdating(true);
    try {
      await updateSubscriptionPlan(plan);
      toast.success(`Piano aggiornato con successo a ${PLAN_LIMITS[plan].name}!`);
    } catch (err: any) {
      toast.error("Errore durante l'aggiornamento del piano. Riprova.");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <AppShell title="Piani e Abbonamenti" subtitle="Scegli il piano ideale per le esigenze della tua famiglia o del tuo gruppo di cura.">
      <div className="max-w-6xl mx-auto space-y-8 pb-12">
        {/* Back header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild className="rounded-xl">
            <Link to="/impostazioni">
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
              Piani e Abbonamenti
            </h1>
            <p className="text-sm text-muted-foreground">
              Scegli il piano ideale per le esigenze della tua famiglia o del tuo gruppo di cura.
            </p>
          </div>
        </div>

        {/* Current Plan Banner */}
        <div className="rounded-3xl border border-primary/20 bg-primary/5 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lift">
              <Sparkles className="size-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
                  Piano Corrente
                </span>
                <Badge variant="secondary" className="bg-primary/10 text-primary font-bold">
                  {PLAN_LIMITS[subscriptionPlan].name}
                </Badge>
              </div>
              <p className="text-sm font-medium text-foreground mt-0.5">
                Hai accesso ai limiti del piano <span className="font-bold">{PLAN_LIMITS[subscriptionPlan].name}</span> ({PLAN_LIMITS[subscriptionPlan].maxPatients} pazienti, {PLAN_LIMITS[subscriptionPlan].maxCaregiversPerPatient} persone per paziente).
              </p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground bg-background/60 px-3 py-1.5 rounded-xl border border-border/40">
            Simulatore attivo: puoi cambiare piano con 1-click
          </div>
        </div>

        {/* Monthly / Annual Toggle */}
        <div className="flex justify-center items-center gap-3 pt-2">
          <span className={`text-sm font-semibold ${!isAnnual ? "text-foreground" : "text-muted-foreground"}`}>
            Fatturazione Mensile
          </span>
          <button
            onClick={() => setIsAnnual(!isAnnual)}
            className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${
              isAnnual ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`inline-block size-5 transform rounded-full bg-white transition-transform ${
                isAnnual ? "translate-x-8" : "translate-x-1"
              }`}
            />
          </button>
          <div className="flex items-center gap-1.5">
            <span className={`text-sm font-semibold ${isAnnual ? "text-foreground" : "text-muted-foreground"}`}>
              Fatturazione Annuale
            </span>
            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold border-emerald-500/20 text-[10px]">
              -33% sconto
            </Badge>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          {/* FREE PLAN */}
          <PlanCard
            planKey="free"
            isCurrent={subscriptionPlan === "free"}
            isAnnual={isAnnual}
            updating={updating}
            onSelect={() => handleSwitchPlan("free")}
            features={[
              { label: "1 Paziente gestibile", check: true },
              { label: "1 Persona per paziente (solo titolare)", check: true },
              { label: "Max 3 terapie attive per paziente", check: true },
              { label: "1 Promemoria orario fisso", check: true },
              { label: "Storico ultimi 7 giorni", check: true },
              { label: "Export Dati GDPR", check: true },
              { label: "Foto farmaco/confezione", check: false },
              { label: "Statistiche aderenza & Parametri vitali", check: false },
              { label: "Storico movimenti & Previsione scorte", check: false },
              { label: "Report PDF", check: false },
              { label: "Ruoli e Permessi caregiver", check: false },
              { label: "Audit log", check: false },
            ]}
          />

          {/* PRO PLAN */}
          <PlanCard
            planKey="pro"
            isCurrent={subscriptionPlan === "pro"}
            isAnnual={isAnnual}
            highlighted={true}
            updating={updating}
            onSelect={() => handleSwitchPlan("pro")}
            features={[
              { label: "Fino a 2 Pazienti gestibili", check: true },
              { label: "Titolare + fino a 4 caregiver invitati (tot 5)", check: true },
              { label: "Terapie attive illimitate", check: true },
              { label: "Promemoria multipli e personalizzati", check: true },
              { label: "Foto farmaco/confezione", check: true },
              { label: "Storico e Diario illimitato", check: true },
              { label: "Statistiche aderenza & Parametri vitali", check: true },
              { label: "Storico movimenti & Previsione scorte", check: true },
              { label: "Report PDF (7/30/90 giorni)", check: true },
              { label: "Ruoli e Permessi caregiver", check: true },
              { label: "Export Dati GDPR", check: true },
              { label: "Audit log", check: false },
            ]}
          />

          {/* MAX PLAN */}
          <PlanCard
            planKey="max"
            isCurrent={subscriptionPlan === "max"}
            isAnnual={isAnnual}
            updating={updating}
            onSelect={() => handleSwitchPlan("max")}
            features={[
              { label: "Fino a 10 Pazienti gestibili", check: true },
              { label: "Titolare + fino a 9 caregiver (tot 10 per paziente)", check: true },
              { label: "Terapie attive illimitate", check: true },
              { label: "Promemoria multipli e personalizzati", check: true },
              { label: "Foto farmaco/confezione", check: true },
              { label: "Storico e Diario illimitato", check: true },
              { label: "Statistiche aderenza & Parametri vitali", check: true },
              { label: "Storico movimenti & Previsione scorte", check: true },
              { label: "Report PDF singoli + Aggregato multi-paziente", check: true },
              { label: "Ruoli e Permessi granulari (es. sola lettura)", check: true },
              { label: "Audit log completo attività del gruppo", check: true },
              { label: "Supporto prioritario & Export GDPR", check: true },
            ]}
          />
        </div>

        {/* GDPR Notice Banner */}
        <div className="rounded-2xl border border-border/60 bg-card p-6 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600">
            <ShieldCheck className="size-6" />
          </div>
          <div>
            <h4 className="font-bold text-base text-foreground">Diritto alla Privacy e Portabilità dei Dati (GDPR)</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              L'esportazione completa dei dati personali (art. 20 GDPR) e la cancellazione dell'account (art. 17 GDPR) sono sempre disponibili gratuitamente su tutti i piani. Nessun dato medico viene mai condiviso a fini commerciali.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function PlanCard({
  planKey,
  isCurrent,
  isAnnual,
  highlighted = false,
  updating,
  onSelect,
  features,
}: {
  planKey: SubscriptionPlan;
  isCurrent: boolean;
  isAnnual: boolean;
  highlighted?: boolean;
  updating: boolean;
  onSelect: () => void;
  features: { label: string; check: boolean }[];
}) {
  const plan = PLAN_LIMITS[planKey];
  const price = isAnnual ? plan.priceYear / 12 : plan.priceMonth;

  return (
    <div
      className={`relative flex flex-col justify-between rounded-3xl p-6 transition-all ${
        highlighted
          ? "bg-card border-2 border-primary shadow-xl ring-4 ring-primary/10"
          : "bg-card border border-border/60 shadow-sm hover:shadow-md"
      }`}
    >
      {highlighted && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-xs font-bold text-primary-foreground shadow-sm">
          Più Popolare
        </div>
      )}

      <div>
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-extrabold text-foreground">{plan.name}</h3>
          {isCurrent && (
            <Badge className="bg-primary/10 text-primary border-primary/20 font-bold">
              In Uso
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1 min-h-[32px]">{plan.badge}</p>

        {/* Pricing */}
        <div className="mt-4 mb-6">
          {plan.priceMonth === 0 ? (
            <div className="text-3xl font-black text-foreground">0 €</div>
          ) : (
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black text-foreground">
                {formatPrice(price)}
              </span>
              <span className="text-xs text-muted-foreground font-medium">/mese</span>
              {isAnnual && (
                <span className="text-[10px] text-muted-foreground block">
                  (fatturati {formatPrice(plan.priceYear)}/anno)
                </span>
              )}
            </div>
          )}
        </div>

        {/* Feature List */}
        <div className="space-y-2.5 border-t border-border/40 pt-4">
          {features.map((item, idx) => (
            <div key={idx} className="flex items-start gap-2.5 text-xs">
              {item.check ? (
                <Check className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <X className="size-4 text-muted-foreground/40 shrink-0 mt-0.5" />
              )}
              <span className={item.check ? "text-foreground font-medium" : "text-muted-foreground/60 line-through"}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* CTA Button */}
      <div className="mt-8 pt-4 border-t border-border/40">
        <Button
          onClick={onSelect}
          disabled={isCurrent || updating}
          variant={isCurrent ? "outline" : highlighted ? "default" : "secondary"}
          className={`w-full font-bold rounded-xl py-2.5 ${
            isCurrent
              ? "opacity-60 cursor-default"
              : highlighted
              ? "bg-primary text-primary-foreground shadow-md hover:bg-primary/90"
              : ""
          }`}
        >
          {isCurrent ? "Piano Corrente" : `Seleziona ${plan.name}`}
        </Button>
      </div>
    </div>
  );
}
