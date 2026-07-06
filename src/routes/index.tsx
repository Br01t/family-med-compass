import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, HeartPulse, Pill, ShieldCheck, Users } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useFamilyMed } from "@/lib/store";
import { useEffect } from "react";

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

  const {
    data,
    user,
    userProfile,
    loadingAuth,
    setRole,
    setCurrentPatient,
  } = useFamilyMed();

  const patient =
    data.patients.find((p) => p.id === data.currentPatientId) ??
    data.patients[0];

  // 🔐 Redirect automatico se già loggato
  useEffect(() => {
    if (loadingAuth) return;

    if (user && userProfile) {
      navigate({
        to:
          userProfile.role === "paziente"
            ? "/paziente"
            : "/caregiver",
        replace: true,
      });
    }
  }, [user, userProfile, loadingAuth, navigate]);

  const handleEnterAsPatient = () => {
    if (!user) {
      navigate({ to: "/login" });
      return;
    }

    setRole("paziente");
    setCurrentPatient(patient.id);
    navigate({ to: "/paziente" });
  };

  const handleEnterAsCaregiver = () => {
    if (!user) {
      navigate({ to: "/login" });
      return;
    }

    setRole("caregiver");
    navigate({ to: "/caregiver" });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* HEADER */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lift">
            <Pill className="size-5" />
          </div>
          <div>
            <p className="text-lg font-black tracking-tight leading-none">
              FamilyMed
            </p>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Demo · dati fittizi
            </p>
          </div>
        </div>

        {!user ? (
          <Button variant="ghost" size="sm" asChild>
            <Link to="/login">Accedi</Link>
          </Button>
        ) : (
          <Button variant="ghost" size="sm" asChild>
            <Link to="/impostazioni">Impostazioni</Link>
          </Button>
        )}
      </header>

      {/* HERO */}
      <section className="mx-auto max-w-6xl px-6 pb-12 pt-8 md:pt-16">
        <div className="grid gap-10 md:grid-cols-2 md:items-center">
          <div className="fm-reveal">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary">
              <span className="size-1.5 rounded-full bg-primary" />
              Nuova Progressive Web App
            </span>

            <h1 className="mt-5 text-4xl font-black leading-[1.05] tracking-tight md:text-6xl">
              Le medicine <br />
              <span className="text-primary">non si dimenticano</span> <br />
              in famiglia.
            </h1>

            <p className="mt-5 max-w-md text-base text-muted-foreground md:text-lg">
              Per il paziente: un pulsante grande "Ho preso la medicina".
              Per i familiari: monitoraggio in tempo reale, alert, scorte e storico.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button
                size="lg"
                className="h-14 px-6 text-base font-bold"
                onClick={handleEnterAsPatient}
              >
                <Link to="/login">Accedi</Link>
                <ArrowRight className="ml-2 size-5" />
              </Button>

              <Button
                size="lg"
                variant="outline"
                className="h-14 px-6 text-base font-bold"
                onClick={handleEnterAsCaregiver}
              >
                Vista Caregiver
              </Button>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              L'app ricorda la tua scelta. Puoi cambiarla in qualsiasi momento.
            </p>
          </div>

          {/* MOCK UI */}
          <div className="relative fm-reveal [animation-delay:120ms]">
            <div className="absolute -left-8 -top-6 hidden size-40 rounded-full bg-primary-soft blur-3xl md:block" />
            <div className="absolute -bottom-10 -right-4 hidden size-52 rounded-full bg-accent-soft blur-3xl md:block" />

            <div className="relative mx-auto max-w-sm rounded-[28px] bg-card p-8 shadow-lift ring-1 ring-border">
              <p className="text-lg text-muted-foreground">Buongiorno,</p>
              <p className="text-4xl font-black tracking-tight">Mario</p>

              <div className="mt-6 rounded-2xl border border-border/60 bg-surface-muted p-5">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  Prossimo farmaco
                </p>
                <p className="mt-1 text-5xl font-black tracking-tight text-primary">
                  16:00
                </p>
              </div>

              <div className="mt-5 rounded-2xl border-l-8 border-accent bg-card p-5 shadow-card">
                <p className="text-lg font-black">Cardioaspirina</p>
                <p className="text-sm text-muted-foreground">
                  100mg · 1 compressa
                </p>
                <div className="mt-4 grid h-14 place-items-center rounded-xl bg-primary text-base font-bold text-primary-foreground shadow-lift">
                  Ho preso la medicina
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* FEATURES */}
        <div className="mt-20 grid gap-4 md:grid-cols-3">
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
              body: "Push, email, WhatsApp e alert automatici quando le pillole finiscono.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-3xl border border-border/60 bg-card p-6 shadow-card"
            >
              <div className="grid size-11 place-items-center rounded-xl bg-primary-soft text-primary">
                <f.icon className="size-5" />
              </div>
              <p className="mt-4 text-lg font-black tracking-tight">
                {f.title}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border/60 py-6">
        <p className="text-center text-xs text-muted-foreground">
          © FamilyMed · MVP demo. I dati sono locali al tuo browser.
        </p>
      </footer>
    </div>
  );
}