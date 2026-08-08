import { Link } from "@tanstack/react-router";
import { Sliders, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DisabledFeatureBanner({ featureName }: { featureName: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-border/60 bg-card p-8 text-center shadow-card">
      <div className="grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary shadow-sm">
        <Sliders className="size-6" />
      </div>
      <h2 className="mt-4 text-xl font-black tracking-tight">
        Modulo "{featureName}" disattivato
      </h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Hai disattivato questa funzionalità nelle impostazioni dell'app. Puoi riattivarla in qualsiasi momento per accedere a questa sezione.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link to="/impostazioni">
          <Button className="rounded-xl">
            <Sliders className="mr-2 size-4" />
            Vai alle Impostazioni
          </Button>
        </Link>
        <Link to="/caregiver">
          <Button variant="outline" className="rounded-xl">
            <ArrowLeft className="mr-2 size-4" />
            Torna alla Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
