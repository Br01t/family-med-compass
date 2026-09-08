import { useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { useFamilyMed } from "@/lib/store";
import { canAccessFeature } from "@/lib/subscription";
import { UpgradeModal } from "@/components/UpgradeModal";
import { cn } from "@/lib/utils";

/**
 * Miniatura foto terapia (farmaco/confezione).
 *
 * Il caricamento E la visualizzazione delle foto sono una funzionalità
 * Pro/Max: se il piano della famiglia non la include, non renderizziamo mai
 * l'immagine reale — anche se `src` è presente nei dati (es. caricata prima
 * di un downgrade) — e mostriamo invece un invito ad aggiornare il piano.
 */
export function TherapyPhoto({
  src,
  alt,
  className,
  fallbackIcon,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackIcon?: ReactNode;
}) {
  const { subscriptionPlan } = useFamilyMed();
  const [open, setOpen] = useState(false);
  const hasAccess = canAccessFeature(subscriptionPlan, "medicationPhoto");

  if (!hasAccess) {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "grid shrink-0 place-items-center rounded-2xl border border-dashed border-border bg-surface-muted text-muted-foreground transition hover:border-primary/50 hover:text-primary",
            className,
          )}
          aria-label="Foto disponibile con piano Pro o Max"
          title="Foto disponibile con piano Pro o Max"
        >
          <Lock className="size-5" />
        </button>
        <UpgradeModal
          open={open}
          onOpenChange={setOpen}
          requiredPlan="pro"
          featureTitle="Foto dei farmaci"
          featureDescription="Carica e visualizza le foto del farmaco e della confezione passando a un piano Pro o Max."
        />
      </>
    );
  }

  if (src) {
    return <img src={src} alt={alt} className={className} />;
  }

  return fallbackIcon ? <>{fallbackIcon}</> : null;
}