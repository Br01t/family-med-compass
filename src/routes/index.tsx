import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  ClipboardList,
  Eye,
  History,
  Play,
  ShieldCheck,
  Users,
} from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
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
    span: "md:col-span-7",
  },
  {
    icon: ClipboardList,
    title: "Responsabilità sugli eventi",
    body: "Ogni dose, ogni conferma, ogni rinvio ha un nome e un orario. Si sa sempre chi ha fatto cosa.",
    span: "md:col-span-5",
  },
  {
    icon: Eye,
    title: "Visibilità condivisa",
    body: "Una sola timeline aggiornata in tempo reale: ieri, oggi, domani. Basta telefonate per controllare.",
    span: "md:col-span-5",
  },
  {
    icon: History,
    title: "Storico verificabile",
    body: "Registro attività e report PDF a 7, 30 o 90 giorni da portare al medico curante.",
    span: "md:col-span-7",
  },
  {
    icon: ShieldCheck,
    title: "Continuità della cura",
    body: "Terapie, scorte e parametri vitali sempre allineati, anche quando cambia chi è di turno.",
    span: "md:col-span-6",
  },
  {
    icon: Check,
    title: "Tranquillità del caregiver",
    body: "Se qualcosa non viene fatto lo sai subito, con un alert e una pagina dedicata per rimettere tutto in ordine.",
    span: "md:col-span-6",
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

function Eyebrow({ children }: { children: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-ocean-300/30 bg-ocean-800/40 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-ocean-300 sm:text-xs">
      <span className="size-1.5 shrink-0 rounded-full bg-ocean-300" />
      <span className="truncate">{children}</span>
    </span>
  );
}

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
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-5 font-display text-3xl leading-tight tracking-tight text-white italic sm:text-4xl md:text-[2.6rem]">
        {title}
      </h2>
      {body && (
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-ocean-300/70 sm:text-base">
          {body}
        </p>
      )}
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
    <div className="landing-ocean min-h-screen w-full max-w-full overflow-x-hidden bg-ocean-950 text-left text-white">
      {/* HEADER */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-6 sm:py-7">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid size-9 shrink-0 place-items-center rounded-2xl bg-ocean-300 text-ocean-950 shadow-ocean sm:size-10">
            <Users className="size-4.5 sm:size-5" />
          </div>
          <p className="truncate font-display text-lg leading-none tracking-tight text-white italic sm:text-xl">
            FamilyMed
          </p>
        </div>

        <nav className="flex shrink-0 items-center gap-1 sm:gap-2">
          <Link
            to={"/prezzi" as any}
            className="hidden rounded-full px-3 py-2 text-sm font-semibold text-white/70 transition-colors hover:text-ocean-300 sm:inline-flex"
          >
            Prezzi
          </Link>
          <Link
            to="/guida-pubblica"
            className="hidden rounded-full px-3 py-2 text-sm font-semibold text-white/70 transition-colors hover:text-ocean-300 sm:inline-flex"
          >
            Guida
          </Link>
          <Link
            to={user ? "/impostazioni" : "/login"}
            className="rounded-full border border-ocean-600/40 px-4 py-2 text-xs font-bold text-white transition-colors hover:border-ocean-300/60 hover:text-ocean-300 sm:text-sm"
          >
            {user ? "Impostazioni" : "Accedi"}
          </Link>
        </nav>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-6xl px-4 pb-20 sm:px-6">
        {/* HERO */}
        <section className="pt-6 text-center md:pt-14">
          <Eyebrow>Family care coordination</Eyebrow>

          <h1 className="mx-auto mt-6 max-w-3xl font-display text-[2rem] leading-[1.15] tracking-tight text-white italic sm:text-5xl md:text-[3.4rem]">
            Tutti sanno cosa è stato fatto,{" "}
            <span className="text-ocean-300">cosa deve essere fatto</span> e chi se ne sta
            occupando.
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-sm leading-relaxed text-ocean-300/80 sm:text-base md:text-lg">
            FamilyMed è lo spazio condiviso dove una famiglia coordina la cura quotidiana di una
            persona: terapie, eventi, turni e storico, sempre allineati per tutti.
          </p>

          <div className="mx-auto mt-8 flex w-full max-w-md flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={handleEnter}
              className="inline-flex h-13 w-full items-center justify-center rounded-2xl bg-ocean-300 px-7 text-sm font-extrabold text-ocean-950 shadow-ocean transition-all hover:bg-ocean-600 hover:text-white active:scale-[0.98] sm:w-auto sm:text-base"
            >
              {user ? "Entra" : "Inizia gratis"}
              <ArrowRight className="ml-2 size-4 shrink-0 sm:size-5" />
            </button>
            <a
              href="#demo"
              className="inline-flex h-13 w-full items-center justify-center rounded-2xl border border-ocean-600/40 px-7 text-sm font-bold text-white transition-colors hover:border-ocean-300/60 hover:bg-ocean-800/40 sm:w-auto sm:text-base"
            >
              <Play className="mr-2 size-4 shrink-0 fill-current sm:size-5" />
              Guarda la demo (30s)
            </a>
          </div>

          <p className="mt-5 text-xs text-white/40">
            Nessuna carta richiesta · Dati sanitari cifrati e conformi GDPR
          </p>
        </section>

        {/* BENTO: DEMO + STEP */}
        <section id="demo" className="mt-12 scroll-mt-24 sm:mt-16">
          <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-12">
            {/* Demo video — tile principale */}
            <div className="relative overflow-hidden rounded-3xl border border-ocean-600/25 bg-gradient-to-br from-ocean-800 to-ocean-950 p-5 sm:p-8 md:col-span-8">
              <div className="pointer-events-none absolute -right-20 -bottom-20 size-64 rounded-full bg-ocean-300/10 blur-3xl" />
              <div className="relative z-10">
                <h3 className="font-display text-2xl text-white italic sm:text-3xl">
                  La cura, semplificata.
                </h3>
                <p className="mt-2 max-w-sm text-sm text-ocean-300/80">
                  Trenta secondi per vedere come il gruppo resta allineato, dal promemoria alla
                  conferma.
                </p>
              </div>
              <div className="relative z-10 mt-6 overflow-hidden rounded-2xl border border-ocean-600/30 [&_video]:bg-ocean-950 [&>div]:w-full">
                <VideoPlayer
                  id="familymed-demo"
                  src={demoVideoUrl}
                  poster={demoPosterUrl}
                  title="Video demo di FamilyMed"
                />
              </div>
            </div>

            {/* Step 1-3 in colonna */}
            <div className="grid grid-cols-1 gap-4 sm:gap-5 md:col-span-4">
              {STEPS.map((s) => (
                <div
                  key={s.n}
                  className="flex flex-col justify-center rounded-3xl border border-ocean-600/25 bg-ocean-800/40 p-5 backdrop-blur-sm sm:p-6"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-ocean-300/15 font-display text-base text-ocean-300 italic">
                    {s.n}
                  </span>
                  <p className="mt-3 font-display text-lg text-white italic">{s.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-white/50">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PILASTRI — bento asimmetrico */}
        <section className="mt-16 sm:mt-24">
          <SectionHeading
            eyebrow="Perché FamilyMed"
            title="Non un promemoria: un modo di coordinarsi"
            body="La cura di una persona non è un compito individuale. FamilyMed tiene insieme le persone che se ne occupano."
          />
          <div className="mt-10 grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-12">
            {PILLARS.map((f) => (
              <div
                key={f.title}
                className={cn(
                  "group rounded-3xl border border-ocean-600/20 p-6 transition-colors sm:p-7",
                  "bg-ocean-800/30 hover:border-ocean-300/40 hover:bg-ocean-800/50",
                  f.span,
                )}
              >
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-ocean-300/15 text-ocean-300 sm:size-11">
                  <f.icon className="size-4.5 sm:size-5" />
                </div>
                <p className="mt-4 font-display text-xl text-white italic">{f.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-white/50">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* VIDEO FAQ — elenco editoriale numerato */}
        <section id="faq" className="mt-16 scroll-mt-24 sm:mt-24">
          <SectionHeading
            eyebrow="Video FAQ"
            title="Ogni funzione spiegata in 20 secondi"
            body="Brevi tutorial per iniziare: creare una terapia, invitare un caregiver, confermare una dose e altro."
          />

          <ul className="mx-auto mt-10 max-w-3xl divide-y divide-ocean-600/20 overflow-hidden rounded-3xl border border-ocean-600/25 bg-ocean-800/30">
            {FAQ_VIDEOS.map((v, i) => (
              <li key={v.id}>
                <Link
                  to="/guida-pubblica"
                  hash="faq-video"
                  className="group flex w-full min-w-0 items-center gap-3 px-4 py-4 transition-colors hover:bg-ocean-800/60 sm:gap-4 sm:px-6"
                >
                  <span className="shrink-0 font-display text-lg text-ocean-300/60 italic tabular-nums transition-colors group-hover:text-ocean-300 sm:text-xl">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-bold tracking-tight text-white sm:text-base">
                      {v.title}
                    </span>
                    <span className="truncate text-xs text-white/40 sm:text-sm">{v.short}</span>
                  </span>
                  <span className="shrink-0 rounded-full border border-ocean-600/30 px-2.5 py-1 text-[10px] font-bold tabular-nums text-ocean-300/80">
                    {v.duration}s
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-8 text-center">
            <Link
              to="/guida-pubblica"
              hash="faq-video"
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-ocean-600/40 px-6 text-sm font-bold text-white transition-colors hover:border-ocean-300/60 hover:bg-ocean-800/40"
            >
              <Play className="mr-2 size-4 fill-current" />
              Guarda tutti i video
            </Link>
          </div>
        </section>

        {/* PREZZI */}
        <section id="prezzi" className="mt-16 scroll-mt-24 sm:mt-24">
          <SectionHeading
            eyebrow="Prezzi"
            title="Inizia gratis, cresci quando il gruppo si allarga"
            body="Nessun vincolo: puoi cambiare o disdire il piano in qualsiasi momento."
          />

          <div className="mt-12 grid items-start gap-5 md:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={cn(
                  "relative flex h-full flex-col rounded-3xl border p-6 sm:p-7",
                  plan.highlight
                    ? "border-ocean-300/50 bg-gradient-to-b from-ocean-800 to-ocean-900 shadow-ocean md:-mt-3 md:pb-9"
                    : "border-ocean-600/20 bg-ocean-800/30",
                )}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-6 rounded-full bg-ocean-300 px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-ocean-950 shadow-ocean">
                    Più scelto
                  </span>
                )}

                <p className="font-display text-2xl text-white italic">{plan.name}</p>
                <p className="mt-1.5 text-xs text-white/40">{plan.tagline}</p>

                <div className="mt-6 flex items-end gap-1.5">
                  <span className="font-display text-5xl tracking-tight text-white">
                    {plan.price}
                  </span>
                  <span className="pb-1.5 text-xs text-white/40">{plan.period}</span>
                </div>

                <ul className="mt-7 space-y-3 text-sm">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 size-4 shrink-0 text-ocean-300" />
                      <span className="leading-snug text-white/70">{feat}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={handleEnter}
                  className={cn(
                    "mt-8 inline-flex h-12 w-full items-center justify-center rounded-2xl text-sm font-extrabold transition-all active:scale-[0.98]",
                    plan.highlight
                      ? "bg-ocean-300 text-ocean-950 shadow-ocean hover:bg-ocean-600 hover:text-white"
                      : "border border-ocean-600/40 text-white hover:border-ocean-300/60 hover:bg-ocean-800/50",
                  )}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>

          <p className="mt-8 text-center text-xs text-white/30">
            FamilyMed non sostituisce il parere medico: segui sempre le indicazioni del medico
            curante.
          </p>
        </section>

        {/* CTA FINALE */}
        <section className="relative mt-16 overflow-hidden rounded-3xl border border-ocean-600/25 bg-gradient-to-br from-ocean-800 to-ocean-950 p-8 text-center sm:mt-24 sm:p-12">
          <div className="pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-ocean-300/10 blur-3xl" />
          <p className="relative z-10 font-display text-2xl tracking-tight text-white italic sm:text-3xl">
            Smettete di chiedervi «l'ha presa?»
          </p>
          <p className="relative z-10 mx-auto mt-3 max-w-md text-sm text-ocean-300/80">
            Bastano due minuti per creare il gruppo di cura e la prima terapia.
          </p>
          <div className="relative z-10 mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleEnter}
              className="inline-flex h-13 w-full items-center justify-center rounded-2xl bg-ocean-300 px-7 text-sm font-extrabold text-ocean-950 shadow-ocean transition-all hover:bg-ocean-600 hover:text-white active:scale-[0.98] sm:w-auto sm:text-base"
            >
              Inizia gratis
              <ArrowRight className="ml-2 size-4 shrink-0 sm:size-5" />
            </button>
            <Link
              to="/guida-pubblica"
              className="inline-flex h-13 w-full items-center justify-center rounded-2xl border border-ocean-600/40 px-7 text-sm font-bold text-white transition-colors hover:border-ocean-300/60 hover:bg-ocean-800/40 sm:w-auto sm:text-base"
            >
              Guarda la guida
            </Link>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      {!loadingAuth && !user && (
        <footer className="border-t border-ocean-600/20">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
            <div className="flex items-center gap-2.5">
              <div className="grid size-7 place-items-center rounded-xl bg-ocean-300/15 text-ocean-300">
                <Users className="size-3.5" />
              </div>
              <p className="font-display text-sm text-white italic">FamilyMed</p>
            </div>
            <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-white/40">
              <Link to="/privacy" className="transition-colors hover:text-ocean-300">
                Privacy
              </Link>
              <Link to="/termini" className="transition-colors hover:text-ocean-300">
                Termini
              </Link>
              <Link to="/cookie" className="transition-colors hover:text-ocean-300">
                Cookie
              </Link>
              <Link to="/guida-pubblica" className="transition-colors hover:text-ocean-300">
                Guida
              </Link>
            </nav>
          </div>
        </footer>
      )}
    </div>
  );
}
