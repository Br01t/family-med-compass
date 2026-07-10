import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, HeartPulse, Pill, ShieldCheck, Users } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useFamilyMed } from "@/lib/store";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FamilyMed — Terapia condivisa in famiglia" },
      {
        name: "description",
        content:
          "Promemoria in un tap per l'anziano, monitoraggio in tempo reale per la famiglia. Meno ansia, più cura.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const navigate = useNavigate();
  const { data, user, userProfile, loadingAuth, setRole, setCurrentPatient } = useFamilyMed();

  const patient = data.patients.find((p) => p.id === data.currentPatientId) ?? data.patients[0];

  // 🔐 Redirect automatico se già loggato
  useEffect(() => {
    if (loadingAuth) return;

    if (user && userProfile) {
      navigate({
        to: userProfile.role === "paziente" ? "/paziente" : "/caregiver",
        replace: true,
      });
    }
  }, [user, userProfile, loadingAuth, navigate]);

  const handleEnter = () => {
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (userProfile?.role === "paziente") {
      setRole("paziente");
      setCurrentPatient(patient.id);
      navigate({ to: "/paziente" });
    } else {
      setRole("caregiver");
      navigate({ to: "/caregiver" });
    }
  };

  return (
    <div className="min-h-screen bg-background w-full max-w-full overflow-x-hidden block text-left">
      {/* HEADER */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 sm:py-6 w-full">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="grid size-9 sm:size-10 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lift">
            <Pill className="size-4.5 sm:size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-base sm:text-lg font-black tracking-tight leading-none truncate">FamilyMed</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!user ? (
            <Button variant="ghost" size="sm" className="text-xs sm:text-sm px-2.5 sm:px-3" asChild>
              <Link to="/login">Accedi</Link>
            </Button>
          ) : (
            <Button variant="ghost" size="sm" className="text-xs sm:text-sm px-2.5 sm:px-3" asChild>
              <Link to="/impostazioni">Impostazioni</Link>
            </Button>
          )}
        </div>
      </header>

      {/* HERO & CONTENT */}
      <section className="mx-auto max-w-6xl px-4 pb-12 pt-6 sm:px-6 md:pt-16 block w-full min-w-0">
        <div className="grid gap-10 md:grid-cols-2 md:items-center w-full">
          
          {/* Testo Hero */}
          <div className="fm-reveal w-full block">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-[10px] sm:text-xs font-bold uppercase tracking-widest text-primary max-w-full truncate">
              <span className="size-1.5 shrink-0 rounded-full bg-primary" />
              <span className="truncate">Un piccolo aiuto per chi vuoi bene 💙</span>
            </span>

            <h1 className="mt-4 text-3xl font-black leading-[1.1] tracking-tight sm:text-5xl md:text-6xl text-left block">
              Le medicine <br className="hidden sm:block" />
              <span className="text-primary">non si dimenticano</span> <br />
              in famiglia.
            </h1>

            <p className="mt-4 max-w-md text-sm sm:text-base md:text-lg text-muted-foreground leading-relaxed">
              Per il paziente: un pulsante grande "Ho preso la medicina". Per i familiari:
              monitoraggio in tempo reale, alert, scorte e storico.
            </p>

            {/* Pulsanti reattivi */}
            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:items-center w-full">
              <Button
                size="lg"
                className="h-12 sm:h-14 px-5 sm:px-6 text-sm sm:text-base font-bold w-full sm:w-auto"
                onClick={handleEnter}
              >
                {user ? "Entra" : "Accedi"}
                <ArrowRight className="ml-2 size-4 sm:size-5 shrink-0" />
              </Button>

              <Button
                size="lg"
                variant="outline"
                className="h-12 sm:h-14 px-5 sm:px-6 text-sm sm:text-base font-bold w-full sm:w-auto"
                asChild
              >
                <Link to="/guida-pubblica" className="truncate">
                  Guarda come funziona
                </Link>
              </Button>
            </div>
          </div>

          {/* MOCK UI - Blindata per schermi microscopici */}
          <div className="relative fm-reveal [animation-delay:120ms] w-full flex justify-center">
            <div className="absolute -left-8 -top-6 hidden size-40 rounded-full bg-primary-soft blur-3xl md:block" />
            <div className="absolute -bottom-10 -right-4 hidden size-52 rounded-full bg-accent-soft blur-3xl md:block" />

            <div className="relative w-full max-w-[340px] rounded-[24px] sm:rounded-[28px] bg-card p-5 sm:p-8 shadow-lift ring-1 ring-border text-left">
              <p className="text-base sm:text-lg text-muted-foreground leading-none">Buongiorno,</p>
              <p className="text-3xl sm:text-4xl font-black tracking-tight mt-0.5">Mario</p>

              <div className="mt-5 rounded-xl sm:rounded-2xl border border-border/60 bg-surface-muted p-4 sm:p-5">
                <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  Prossimo farmaco
                </p>
                <p className="mt-0.5 text-4xl sm:text-5xl font-black tracking-tight text-primary">16:00</p>
              </div>

              <div className="mt-4 rounded-xl sm:rounded-2xl border-l-[6px] sm:border-l-8 border-accent bg-card p-4 sm:p-5 shadow-card space-y-3">
                <div>
                  <p className="text-base sm:text-lg font-black tracking-tight truncate">Cardioaspirina</p>
                  <p className="text-xs text-muted-foreground">100mg · 1 compressa</p>
                </div>
                <div className="h-12 sm:h-14 flex items-center justify-center rounded-xl bg-primary text-sm sm:text-base font-bold text-primary-foreground shadow-lift select-none px-2 text-center">
                  Ho preso la medicina
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* FEATURES - Gestione responsiva a griglia fluida (1 col su mobile, 2 col su tablet, 3 su desktop) */}
        <div className="mt-16 sm:mt-24 grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 w-full">
          {[
            {
              icon: HeartPulse,
              title: "Vista Paziente",
              body: "Pulsanti grandi, testo grande, un solo click per confermare.",
            },
            {
              icon: Users,
              title: "Vista Caregiver",
              body: "Monitor live multi-paziente, timeline eventi, aderenza, alert.",
            },
            {
              icon: ShieldCheck,
              title: "Notifiche & scorte",
              body: "Alert automatici per le azioni del paziente e quando le pillole finiscono, sincronizzazione Calendar.",
              className: "sm:col-span-2 md:col-span-1" // Su tablet si allarga per estetica
            },
          ].map((f) => (
            <div
              key={f.title}
              className={cn("rounded-2xl sm:rounded-3xl border border-border/60 bg-card p-5 sm:p-6 shadow-card block text-left", f.className)}
            >
              <div className="grid size-10 sm:size-11 place-items-center rounded-xl bg-primary-soft text-primary shrink-0">
                <f.icon className="size-4.5 sm:size-5" />
              </div>
              <p className="mt-4 text-base sm:text-lg font-black tracking-tight">{f.title}</p>
              <p className="mt-1 text-xs sm:text-sm text-muted-foreground leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border/60 py-6 px-4 w-full">
        <p className="text-center text-[10px] sm:text-xs text-muted-foreground leading-tight">
          © FamilyMed · Uso interno esclusivo. Non distribuire.
        </p>
      </footer>
    </div>
  );
}