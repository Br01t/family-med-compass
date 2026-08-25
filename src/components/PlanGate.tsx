import { useState, type ReactNode } from "react";
import { Lock, Sparkles, ShieldAlert } from "lucide-react";
import { useFamilyMed } from "@/lib/store";
import { canAccessFeature, type PlanLimits, type SubscriptionPlan } from "@/lib/subscription";
import { Button } from "@/components/ui/button";
import { UpgradeModal } from "@/components/UpgradeModal";

interface PlanGateProps {
  feature: keyof Omit<
    PlanLimits,
    | "name"
    | "badge"
    | "priceMonth"
    | "priceYear"
    | "maxPatients"
    | "maxCaregiversPerPatient"
    | "maxActiveTherapiesPerPatient"
    | "historyDaysLimit"
  >;
  requiredPlan?: "pro" | "max";
  title?: string;
  description?: string;
  children: ReactNode;
}

export function PlanGate({
  feature,
  requiredPlan = "pro",
  title = "Funzionalità Pro",
  description = "Passa a Pro o Max per accedere a questa sezione e sbloccare tutte le funzionalità avanzate.",
  children,
}: PlanGateProps) {
  const { subscriptionPlan } = useFamilyMed();
  const [modalOpen, setModalOpen] = useState(false);

  const hasAccess = canAccessFeature(subscriptionPlan, feature);

  if (hasAccess) {
    return <>{children}</>;
  }

  return (
    <div className="relative rounded-3xl border border-border/60 bg-card p-6 shadow-sm overflow-hidden text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4">
        <Lock className="size-7" />
      </div>

      <h3 className="text-xl font-bold tracking-tight text-foreground">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">{description}</p>

      <div className="mt-6 flex justify-center">
        <Button
          onClick={() => setModalOpen(true)}
          className="gap-2 bg-primary font-semibold text-primary-foreground shadow-md hover:bg-primary/90 rounded-xl px-6 py-2.5"
        >
          <Sparkles className="size-4" />
          <span>Sblocca con Pro / Max</span>
        </Button>
      </div>

      <UpgradeModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        requiredPlan={requiredPlan}
        featureTitle={title}
        featureDescription={description}
      />
    </div>
  );
}
