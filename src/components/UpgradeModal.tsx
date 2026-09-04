import { Link } from "@tanstack/react-router";
import { Sparkles, Check, ArrowRight, ShieldCheck, Zap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Mascot } from "@/components/mascot/Mascot";
import { PLAN_LIMITS, formatPrice, type SubscriptionPlan } from "@/lib/subscription";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requiredPlan?: "pro" | "max";
  featureTitle?: string;
  featureDescription?: string;
}

export function UpgradeModal({
  open,
  onOpenChange,
  requiredPlan = "pro",
  featureTitle = "Funzionalità riservata ai piani Pro e Max",
  featureDescription = "Per sbloccare questa funzionalità e collaborare con più familiari passa a un piano Pro o Max.",
}: UpgradeModalProps) {
  const targetPlan = PLAN_LIMITS[requiredPlan];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6 overflow-hidden rounded-3xl sm:max-w-lg">
        <div className="absolute -right-12 -top-12 size-36 rounded-full bg-primary/10 blur-2xl pointer-events-none" />
        
        <DialogHeader className="space-y-3 text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary w-fit">
            <Sparkles className="size-3.5" />
            <span>FamilyMed {targetPlan.name}</span>
          </div>
          <DialogTitle className="text-xl font-bold tracking-tight">
            {featureTitle}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {featureDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          <Mascot
            mood="happy"
            size="sm"
            message={`Con il piano ${targetPlan.name} posso aiutarti a seguire più persone e più caregiver insieme.`}
          />
        </div>

        <div className="mt-4 rounded-2xl bg-secondary/50 p-4 border border-border/60 space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="font-bold text-base">Piano {targetPlan.name}</span>
            <span className="text-lg font-black text-primary">
              {formatPrice(targetPlan.priceMonth)}
              <span className="text-xs font-normal text-muted-foreground">/mese</span>
            </span>
          </div>

          <div className="space-y-2 pt-2 border-t border-border/40 text-xs font-medium text-foreground">
            <div className="flex items-center gap-2">
              <Check className="size-4 text-emerald-600 shrink-0" />
              <span>Gestione fino a {targetPlan.maxPatients} pazienti contemporaneamente</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="size-4 text-emerald-600 shrink-0" />
              <span>Coordinamento fino a {targetPlan.maxCaregiversPerPatient} persone per paziente</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="size-4 text-emerald-600 shrink-0" />
              <span>Terapie attive illimitate e foto della confezione</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="size-4 text-emerald-600 shrink-0" />
              <span>Storico illimitato, parametri vitali e report PDF</span>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-6 flex-col sm:flex-row gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto text-muted-foreground"
          >
            Più tardi
          </Button>
          <Button
            asChild
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto bg-primary text-primary-foreground font-semibold shadow-md gap-2"
          >
            <Link to={"/abbonamento" as any}>
              <span>Vedi i piani e attiva</span>
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
