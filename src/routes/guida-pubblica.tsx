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
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-800/15 bg-emerald-50/90 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-emerald-900 mb-4">
            <HelpCircle className="size-3.5" />
            <span>Guida Completa</span>
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-stone-900 italic sm:text-5xl md:text-6xl">
            Guida all'app
          </h1>
          <p className="mt-3 max-w-2xl text-base sm:text-lg text-stone-600 leading-relaxed font-normal">
            Ecco come funziona FamilyMed — puoi consultarla anche prima di creare un profilo per capire come proteggiamo e coordiniamo la cura dei tuoi cari.
          </p>
        </div>

        <div>
          <GuidaContent />
        </div>

        {/* CTA IN FONDO ALLA GUIDA */}
        <div className="mt-16 rounded-[3rem] rounded-tl-[4rem] border border-emerald-800/15 bg-gradient-to-br from-emerald-100/90 via-teal-50/70 to-amber-50/80 p-8 sm:p-12 text-center relative overflow-hidden shadow-sm">
          <div className="pointer-events-none absolute -top-20 left-1/2 size-72 -translate-x-1/2 rounded-full bg-white/60 blur-2xl" />
          <p className="relative z-10 font-display text-2xl font-bold text-stone-900 italic sm:text-3xl">
            Pronto a iniziare?
          </p>
          <p className="relative z-10 mx-auto mt-3 max-w-md text-base text-stone-600 leading-relaxed">
            Crea un profilo gratuito per attivare promemoria, monitoraggio e alert per la tua famiglia.
          </p>
          <Button
            size="lg"
            className="relative z-10 mt-6 h-13 bg-emerald-800 px-8 font-bold text-white shadow-md hover:bg-emerald-900 rounded-2xl text-base transition-all"
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