import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Pill, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GuidaContent } from "@/components/guida/GuidaContent";

export const Route = createFileRoute("/guida-pubblica")({
  head: () => ({
    meta: [
      { title: "Guida — FamilyMed" },
      {
        name: "description",
        content: "Scopri come funziona FamilyMed, ancora prima di creare un profilo.",
      },
    ],
  }),
  component: GuidaPubblicaPage,
});

function GuidaPubblicaPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lift">
            <Pill className="size-5" />
          </div>
          <div>
            <p className="text-lg font-black tracking-tight leading-none">FamilyMed</p>
          </div>
        </Link>

        <Button variant="ghost" size="sm" asChild>
          <Link to="/">
            <ArrowLeft className="mr-2 size-4" />
            Torna alla home
          </Link>
        </Button>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-16">
        <div className="mb-8 fm-reveal">
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">Guida all'app</h1>
          <p className="mt-2 text-muted-foreground">
            Ecco come funziona FamilyMed — puoi consultarla anche prima di creare un profilo.
          </p>
        </div>

        <GuidaContent />

        <div className="mt-12 rounded-3xl border border-primary/20 bg-primary-soft/40 p-6 text-center">
          <p className="font-black text-lg">Pronto a iniziare?</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea un profilo per attivare promemoria, monitoraggio e alert per la tua famiglia.
          </p>
          <Button size="lg" className="mt-4 h-12 px-6 font-bold" asChild>
            <Link to="/login">Accedi
                <ArrowRight className="ml-2 size-5" />
            </Link>
          </Button>
        </div>
      </main>

      <footer className="border-t border-border/60 py-6">
        <p className="text-center text-xs text-muted-foreground">
          © FamilyMed · Uso interno esclusivo. Non distribuire.
        </p>
      </footer>
    </div>
  );
}