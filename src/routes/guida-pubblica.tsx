import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GuidaContent } from "@/components/guida/GuidaContent";
import { PublicPageShell } from "@/components/public/PublicPageShell";

export const Route = createFileRoute("/guida-pubblica")({
  head: () => ({
    meta: [
      { title: "Guida — FamilyMed" },
      {
        name: "description",
        content:
          "Scopri come funziona FamilyMed, come collegare la tua famiglia in sicurezza e come proteggiamo i tuoi dati sanitari — ancora prima di creare un profilo.",
      },
    ],
  }),
  component: GuidaPubblicaPage,
});

function GuidaPubblicaPage() {
  return (
    <PublicPageShell currentPath="/guida-pubblica">
      <div className="pb-12 pt-6 sm:pt-8">
        <div className="mb-10 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 rounded-full border border-ocean-300/40 bg-ocean-800/60 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-ocean-300 mb-4">
            <HelpCircle className="size-3.5" />
            <span>Guida Completa</span>
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white italic sm:text-5xl md:text-6xl">
            Guida all'app
          </h1>
          <p className="mt-3 max-w-2xl text-base sm:text-lg text-ocean-100 leading-relaxed font-normal">
            Ecco come funziona FamilyMed — puoi consultarla anche prima di creare un profilo per capire come proteggiamo e coordiniamo la cura dei tuoi cari.
          </p>
        </div>

        <div className="[&_.bg-card]:bg-ocean-800/45 [&_.bg-card]:border-ocean-600/30 [&_.bg-card]:backdrop-blur-sm [&_.shadow-card]:shadow-ocean">
          <GuidaContent />
        </div>

        {/* CTA IN FONDO ALLA GUIDA */}
        <div className="mt-16 rounded-3xl border border-ocean-600/30 bg-gradient-to-br from-ocean-800 to-ocean-950 p-8 sm:p-12 text-center shadow-ocean relative overflow-hidden">
          <div className="pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-ocean-300/10 blur-3xl" />
          <p className="relative z-10 font-display text-2xl font-bold text-white italic sm:text-3xl">
            Pronto a iniziare?
          </p>
          <p className="relative z-10 mx-auto mt-3 max-w-md text-base text-ocean-100 leading-relaxed">
            Crea un profilo gratuito per attivare promemoria, monitoraggio e alert per la tua famiglia.
          </p>
          <Button
            size="lg"
            className="relative z-10 mt-6 h-13 bg-ocean-300 px-8 font-extrabold text-ocean-950 shadow-ocean hover:bg-ocean-200 rounded-2xl text-base transition-all"
            asChild
          >
            <Link to="/registrati">
              Inizia gratis
              <ArrowRight className="ml-2 size-5" />
            </Link>
          </Button>
        </div>
      </div>
    </PublicPageShell>
  );
}