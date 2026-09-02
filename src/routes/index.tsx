import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  ClipboardList,
  Eye,
  History,
  PlayCircle,
  ShieldCheck,
  Users,
} from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/SiteFooter";
import { useFamilyMed } from "@/lib/store";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import demoVideoUrl from "@/assets/familymed-demo.mp4";
import demoPosterUrl from "@/assets/familymed-demo-poster.jpg";
import { VideoPlayer } from "@/components/faq/VideoPlayer";
import { FAQ_VIDEOS } from "@/data/faq-videos";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FamilyMed — Coordinare la cura, insieme alla famiglia" },
      {
        name: "description",
        content:
          "Il luogo condiviso dove la famiglia coordina la cura quotidiana: cosa è stato fatto, cosa va fatto e chi se ne sta occupando. Storico verificabile e visibilità per tutti.",
      },
      { property: "og:title", content: "FamilyMed — Family Care Coordination" },
      {
        property: "og:description",
        content:
          "Tutti sanno cosa è stato fatto, cosa deve essere fatto e chi se ne sta occupando.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

const PILLARS = [
  {
    icon: Users,
    title: "Coordinamento tra caregiver",
    body: "Figli, coniugi e badanti nello stesso spazio, con ruoli e permessi chiari: nessuna sovrapposizione, nessun buco.",
  },
  {
    icon: ClipboardList,
    title: "Responsabilità sugli eventi",
    body: "Ogni dose, ogni conferma, ogni rinvio ha un nome e un orario. Si sa sempre chi ha fatto cosa.",
  },
  {
    icon: Eye,
    title: "Visibilità condivisa",
    body: "Una sola timeline aggiornata in tempo reale: ieri, oggi, domani. Basta telefonate per controllare.",
  },
  {
    icon: History,
    title: "Storico verificabile",
    body: "Registro attività e report PDF a 7, 30 o 90 giorni da portare al medico curante.",
  },
  {
    icon: ShieldCheck,
    title: "Continuità della cura",
    body: "Terapie, scorte e parametri vitali sempre allineati, anche quando cambia chi è di turno.",
  },
  {
    icon: Check,
    title: "Tranquillità del caregiver",
    body: "Se qualcosa non viene fatto lo sai subito, con un alert e una pagina dedicata per rimettere tutto in ordine.",
  },
];

const STEPS = [
  {
    n: "1",
    title: "Crea il gruppo di cura",
    body: "Inviti familiari e badanti con un link o un QR code e assegni i permessi.",
  },
  {
    n: "2",
    title: "Imposta le terapie",
    body: "Orari, dosaggi, tempo massimo di ritardo e scorte disponibili.",
  },
  {
    n: "3",
    title: "Coordinatevi ogni giorno",
    body: "La persona conferma con un tap, il gruppo vede tutto e interviene solo se serve.",
  },
];

const PLANS = [
  {
    name: "Free",
    price: "0€",
    period: "per sempre",
    tagline: "Per iniziare a coordinarsi in due.",
    cta: "Inizia gratis",
    highlight: false,
    features: [
      "1 persona seguita",
      "Promemoria e conferma in un tap",
      "Timeline condivisa di oggi",
      "Alert dosi dimenticate",
    ],
  },
  {
    name: "Pro",
    price: "4,99€",
    period: "al mese",
    tagline: "Per la famiglia che vuole vedere tutto, sempre.",
    cta: "Prova Pro",
    highlight: true,
    features: [
      "Fino a 2 persone seguite",
      "Tutto del piano Free",
      "Parametri vitali e diario del benessere",
      "Report PDF 7 / 30 / 90 giorni",
      "Gestione scorte e avvisi esaurimento",
      "Storico completo e aderenza",
    ],
  },
  {
    name: "Max",
    price: "9,99€",
    period: "al mese",
    tagline: "Per gruppi di cura estesi e badanti.",
    cta: "Scegli Max",
    highlight: false,
    features: [
      "Persone seguite illimitate",
      "Tutto del piano Pro",
      "Ruoli e permessi avanzati",
      "Inviti con link e QR Code",
      "Registro attività (audit log)",
      "Export dati GDPR e supporto prioritario",
    ],
  },
];

function SectionHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <span className="text-[11px] font-bold uppercase tracking-widest text-primary sm:text-xs">
        {eyebrow}
      </span>
      <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl md:text-4xl">{title}</h2>
      {body && <p className="mt-3 text-sm text-muted-foreground sm:text-base">{body}</p>}
    </div>
  );
}

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
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-background text-left">
      {/* HEADER */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid size-9 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lift sm:size-10">
            <Users className="size-4.5 sm:size-5" />
          </div>
          <p className="truncate text-base font-black leading-none tracking-tight sm:text-lg">
            FamilyMed
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            to={"/prezzi" as any}
            className="hidden px-2 text-sm font-semibold text-foreground/80 transition-colors hover:text-primary sm:inline-flex"
          >
            Prezzi
          </Link>
          <Link
            to="/guida-pubblica"
            className="hidden px-2 text-sm font-semibold text-foreground/80 transition-colors hover:text-primary sm:inline-flex"
          >
            Guida
          </Link>
          <Button variant="ghost" size="sm" className="px-2.5 text-xs sm:px-3 sm:text-sm" asChild>
            <Link to={user ? "/impostazioni" : "/login"}>{user ? "Impostazioni" : "Accedi"}</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-6xl px-4 pb-16 sm:px-6">
        {/* HERO */}
        <section className="pt-4 md:pt-10">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex max-w-full items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary sm:text-xs">
              <span className="size-1.5 shrink-0 rounded-full bg-primary" />
              <span className="truncate">Family care coordination</span>
            </span>

            <h1 className="mt-5 text-[1.85rem] font-black leading-[1.12] tracking-tight sm:text-5xl md:text-[3.2rem]">
              Tutti sanno cosa è stato fatto,{" "}
              <span className="text-primary">cosa deve essere fatto</span> e chi se ne sta
              occupando.
            </h1>

            <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base md:text-lg">
              FamilyMed è lo spazio condiviso dove una famiglia coordina la cura quotidiana di una
              persona: terapie, eventi, turni e storico, sempre allineati per tutti.
            </p>

            <div className="mx-auto mt-7 flex w-full max-w-md flex-col gap-2.5 sm:flex-row sm:justify-center">
              <Button
                size="lg"
                className="h-12 w-full px-6 text-sm font-bold sm:h-13 sm:w-auto sm:text-base"
                onClick={handleEnter}
              >
                {user ? "Entra" : "Inizia gratis"}
                <ArrowRight className="ml-2 size-4 shrink-0 sm:size-5" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 w-full px-6 text-sm font-bold sm:h-13 sm:w-auto sm:text-base"
                asChild
              >
                <a href="#demo">
                  <PlayCircle className="mr-2 size-5 shrink-0" />
                  Guarda la demo (30s)
                </a>
              </Button>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Nessuna carta richiesta · Dati sanitari cifrati e conformi GDPR
            </p>
          </div>

          {/* DEMO */}
          <div id="demo" className="mt-10 scroll-mt-20 sm:mt-14">
            <VideoPlayer
              id="familymed-demo"
              className="mx-auto w-full max-w-3xl"
              src={demoVideoUrl}
              poster={demoPosterUrl}
              title="Video demo di FamilyMed"
            />
          </div>
        </section>

        {/* COME FUNZIONA */}
        <section className="mt-16 sm:mt-24">
          <SectionHeading
            eyebrow="Come funziona"
            title="Tre passaggi, poi ci pensa il gruppo"
          />
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="rounded-2xl border border-border/60 bg-card p-5 shadow-card sm:rounded-3xl sm:p-6"
              >
                <span className="grid size-9 place-items-center rounded-xl bg-primary text-sm font-black text-primary-foreground">
                  {s.n}
                </span>
                <p className="mt-4 text-base font-black tracking-tight">{s.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* PILASTRI */}
        <section className="mt-16 sm:mt-24">
          <SectionHeading
            eyebrow="Perché FamilyMed"
            title="Non un promemoria: un modo di coordinarsi"
            body="La cura di una persona non è un compito individuale. FamilyMed tiene insieme le persone che se ne occupano."
          />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PILLARS.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-border/60 bg-card p-5 shadow-card sm:rounded-3xl sm:p-6"
              >
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary sm:size-11">
                  <f.icon className="size-4.5 sm:size-5" />
                </div>
                <p className="mt-4 text-base font-black tracking-tight">{f.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* VIDEO FAQ */}
        <section id="faq" className="mt-16 scroll-mt-20 sm:mt-24">
          <SectionHeading
            eyebrow="Video FAQ"
            title="Ogni funzione spiegata in 20 secondi"
            body="Brevi tutorial per iniziare: creare una terapia, invitare un caregiver, confermare una dose e altro."
          />

          <ul className="mx-auto mt-8 max-w-3xl divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-card">
            {FAQ_VIDEOS.map((v, i) => (
              <li key={v.id}>
                <Link
                  to="/guida-pubblica"
                  hash="faq-video"
                  className="flex w-full min-w-0 items-center gap-3 px-3 py-3 transition-colors hover:bg-secondary/60 sm:px-4"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-secondary text-[11px] font-black tabular-nums text-foreground/70">
                    {i + 1}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-bold tracking-tight">{v.title}</span>
                    <span className="truncate text-xs text-muted-foreground">{v.short}</span>
                  </span>
                  <span className="shrink-0 text-[11px] font-bold tabular-nums text-muted-foreground">
                    {v.duration}s
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-6 text-center">
            <Button variant="outline" size="lg" className="h-12 px-6 font-bold" asChild>
              <Link to="/guida-pubblica" hash="faq-video">
                <PlayCircle className="mr-2 size-5" />
                Guarda tutti i video
              </Link>
            </Button>
          </div>
        </section>

        {/* PREZZI */}
        <section id="prezzi" className="mt-16 scroll-mt-20 sm:mt-24">
          <SectionHeading
            eyebrow="Prezzi"
            title="Inizia gratis, cresci quando il gruppo si allarga"
            body="Nessun vincolo: puoi cambiare o disdire il piano in qualsiasi momento."
          />

          <div className="mt-10 grid items-start gap-5 md:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={cn(
                  "relative flex h-full flex-col rounded-3xl border bg-card p-6 shadow-card",
                  plan.highlight
                    ? "border-primary/40 shadow-lift ring-1 ring-primary/20 md:-mt-3 md:pb-8"
                    : "border-border/60",
                )}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary-foreground shadow-lift">
                    Più scelto
                  </span>
                )}

                <p className="text-lg font-black tracking-tight">{plan.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{plan.tagline}</p>

                <div className="mt-5 flex items-end gap-1.5">
                  <span className="text-4xl font-black tracking-tight">{plan.price}</span>
                  <span className="pb-1 text-xs text-muted-foreground">{plan.period}</span>
                </div>

                <ul className="mt-6 space-y-2.5 text-sm">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span className="leading-snug text-foreground/85">{feat}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  className="mt-7 h-12 w-full font-bold"
                  variant={plan.highlight ? "default" : "outline"}
                  onClick={handleEnter}
                >
                  {plan.cta}
                </Button>
              </div>
            ))}
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            FamilyMed non sostituisce il parere medico: segui sempre le indicazioni del medico
            curante.
          </p>
        </section>

        {/* CTA FINALE */}
        <section className="mt-16 rounded-3xl border border-primary/20 bg-primary-soft/40 p-6 text-center sm:mt-24 sm:p-8">
          <p className="text-xl font-black tracking-tight sm:text-2xl">
            Smettete di chiedervi «l'ha presa?»
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Bastano due minuti per creare il gruppo di cura e la prima terapia.
          </p>
          <div className="mt-5 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
            <Button size="lg" className="h-12 w-full px-6 font-bold sm:w-auto" onClick={handleEnter}>
              Inizia gratis
              <ArrowRight className="ml-2 size-5" />
            </Button>
            <Button size="lg" variant="outline" className="h-12 w-full px-6 font-bold sm:w-auto" asChild>
              <Link to="/guida-pubblica">Guarda la guida</Link>
            </Button>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      {!loadingAuth && !user && <SiteFooter />}
    </div>
  );
}
