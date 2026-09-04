import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
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
import { PublicHeader } from "@/components/public/PublicHeader";
import { PublicFooter } from "@/components/public/PublicFooter";

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
    body: "Inviti familiari e badanti con un link o un QR code e assegni i permessi in pochi secondi.",
  },
  {
    n: "2",
    title: "Imposta le terapie",
    body: "Orari, dosaggi, finestre di assunzione e scorte disponibili, facili da consultare.",
  },
  {
    n: "3",
    title: "Coordinatevi ogni giorno",
    body: "La persona o chi assiste conferma con un tap, e l'intera famiglia resta aggiornata senza ansie.",
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
    <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-emerald-800/15 bg-emerald-50/90 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-emerald-900 shadow-xs backdrop-blur-md">
      <span className="size-2 shrink-0 rounded-full bg-emerald-600 animate-pulse" />
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
    <div className="mx-auto max-w-3xl text-center">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-5 font-display text-3xl sm:text-4xl md:text-[2.85rem] leading-tight tracking-tight text-stone-900 italic font-bold">
        {title}
      </h2>
      {body && (
        <p className="mx-auto mt-4 max-w-2xl text-base sm:text-lg leading-relaxed text-stone-600 font-normal">
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
    <div className="landing-light min-h-screen w-full max-w-full overflow-x-hidden bg-[#FAF8F5] text-left text-stone-800 selection:bg-emerald-100 selection:text-emerald-900">
      {/* Sfondi organici con forme asimmetriche fluide & texture filigrana */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden -z-0">
        {/* Forma organica fluida 1: Salvia e Menta delicata in alto a sinistra */}
        <div
          className="animate-fluid-blob absolute -top-32 -left-20 h-[520px] w-[520px] bg-gradient-to-tr from-emerald-100 via-teal-50 to-emerald-50 opacity-70 blur-3xl"
        />
        {/* Forma organica fluida 2: Sabbia calda e pesca in alto a destra */}
        <div
          className="animate-fluid-blob absolute top-16 -right-28 h-[560px] w-[560px] bg-gradient-to-bl from-amber-100 via-orange-50 to-stone-100 opacity-60 blur-3xl"
          style={{ animationDelay: "-9s" }}
        />
        {/* Forma fluida 3: Centro-basso */}
        <div
          className="animate-fluid-blob absolute top-[950px] left-1/2 h-[650px] w-[650px] -translate-x-1/2 bg-gradient-to-r from-teal-100 via-emerald-50 to-amber-50 opacity-50 blur-3xl"
          style={{ animationDelay: "-5s" }}
        />
        {/* Filigrana organica a onde sottili per dare carattere editoriale unico */}
        <svg
          className="absolute inset-0 h-full w-full opacity-[0.04]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="care-wave" width="72" height="72" patternUnits="userSpaceOnUse">
              <path
                d="M0 36 C 18 18, 36 54, 54 36 C 63 27, 68 27, 72 36"
                fill="none"
                stroke="#1B4332"
                strokeWidth="1.2"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#care-wave)" />
        </svg>
      </div>

      {/* HEADER PUBBLICO */}
      <PublicHeader currentPath="/" />

      <main className="mx-auto w-full min-w-0 max-w-6xl px-4 pb-20 sm:px-6 relative">
        {/* HERO */}
        <section className="pt-8 text-center md:pt-16">
          <Eyebrow>Coordinamento della cura in famiglia</Eyebrow>

          <h1 className="mx-auto mt-6 max-w-4xl font-display text-[2.35rem] sm:text-5xl md:text-[3.65rem] leading-[1.12] tracking-tight text-stone-900 italic font-bold">
            Tutti sanno cosa è stato fatto,{" "}
            <span className="relative inline-block text-emerald-800 not-italic font-extrabold px-1">
              <span className="italic font-normal">cosa deve essere fatto</span>
              <span className="absolute -bottom-1 left-0 w-full h-3 bg-emerald-200/50 -rotate-1 -z-10 rounded-full" />
            </span>{" "}
            e chi se ne sta occupando.
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg md:text-xl font-normal leading-relaxed text-stone-600">
            FamilyMed è lo spazio condiviso dove una famiglia coordina la cura quotidiana di una
            persona: terapie, eventi, turni e storico, sempre allineati per tutti.
          </p>

          {/* CTA Buttons */}
          <div className="mx-auto mt-8 flex w-full max-w-md flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={handleEnter}
              className="inline-flex h-13 w-full sm:w-auto items-center justify-center rounded-2xl bg-emerald-800 px-7 text-sm sm:text-base font-bold text-white shadow-md shadow-emerald-950/10 transition-all hover:bg-emerald-900 hover:shadow-lg active:scale-[0.98]"
            >
              {user ? "Entra" : "Inizia gratis"}
              <ArrowRight className="ml-2 size-4 sm:size-5 shrink-0" />
            </button>
            <a
              href="#demo"
              className="inline-flex h-13 w-full sm:w-auto items-center justify-center rounded-2xl border border-stone-300/90 bg-white/90 px-7 text-sm sm:text-base font-bold text-stone-700 shadow-xs transition-all hover:bg-white hover:border-stone-400 hover:text-stone-950"
            >
              <Play className="mr-2 size-4 sm:size-5 shrink-0 fill-current text-emerald-800" />
              Guarda la demo (30s)
            </a>
          </div>

          <p className="mt-5 text-sm font-medium text-stone-500 flex items-center justify-center gap-1.5">
            <ShieldCheck className="size-4 text-emerald-700 shrink-0" />
            <span>Nessuna carta richiesta · Dati sanitari cifrati e conformi GDPR</span>
          </p>

          {/* ELEMENTO SCULTOREO DISTINTIVO: "Live Coordination Capsule" */}
          <div className="mt-12 sm:mt-16 mx-auto max-w-3xl">
            <div className="relative rounded-[2.5rem] rounded-tr-[4.5rem] rounded-bl-[3.5rem] border border-stone-200/90 bg-white/85 p-6 sm:p-8 shadow-[0_20px_50px_-20px_rgba(27,67,50,0.12)] backdrop-blur-xl">
              {/* Badge decorativo asimmetrico */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-4">
                <div className="flex items-center gap-2">
                  <span className="relative flex size-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-emerald-600" />
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-stone-600">
                    Oggi in famiglia · Ore 09:15
                  </span>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-100">
                  Tutti allineati
                </span>
              </div>

              {/* Timeline live con pillole scultoree */}
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="flex items-start gap-3 rounded-2xl bg-stone-50/80 p-3.5 border border-stone-100">
                  <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-800 font-bold text-xs">
                    AR
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="text-xs font-bold text-stone-900">Nonna Rosa ha confermato</p>
                    <p className="text-xs text-stone-600 truncate">Cardiaspirina 100mg · Ore 08:30</p>
                    <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                      <CheckCircle2 className="size-3" /> Presa regolarmente
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-2xl bg-stone-50/80 p-3.5 border border-stone-100">
                  <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800 font-bold text-xs">
                    MC
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="text-xs font-bold text-stone-900">Marco (Figlio)</p>
                    <p className="text-xs text-stone-600 truncate">Pressione 125/80 · Ore 09:00</p>
                    <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-stone-600">
                      <Clock className="size-3 text-stone-400" /> Prossima: Pranzo 13:00
                    </span>
                  </div>
                </div>
              </div>

              {/* Dettaglio di fondo organico e rassicurante */}
              <p className="mt-4 text-center text-xs text-stone-500 font-medium italic">
                Nessun dubbio, nessuna telefonata d'ansia. Ognuno sa esattamente cosa succede.
              </p>
            </div>
          </div>
        </section>

        {/* BENTO: DEMO + STEP */}
        <section id="demo" className="mt-16 scroll-mt-24 sm:mt-24">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-12">
            {/* Demo video — card scultorea principale */}
            <div className="relative overflow-hidden rounded-[2.5rem] rounded-tl-[4rem] border border-stone-200/90 bg-gradient-to-br from-white/95 via-white/85 to-emerald-50/30 p-6 sm:p-8 md:col-span-8 shadow-sm backdrop-blur-md">
              <div className="relative z-10">
                <h3 className="font-display text-2xl sm:text-3xl text-stone-900 italic font-bold">
                  La cura, semplificata.
                </h3>
                <p className="mt-2 max-w-md text-base leading-relaxed text-stone-600 font-normal">
                  Trenta secondi per vedere come il gruppo resta allineato, dal promemoria alla
                  conferma.
                </p>
              </div>
              <div className="relative z-10 mt-6 overflow-hidden rounded-2xl border border-stone-200/80 shadow-xs [&_video]:bg-stone-950 [&>div]:w-full">
                <VideoPlayer
                  id="familymed-demo"
                  src={demoVideoUrl}
                  poster={demoPosterUrl}
                  title="Video demo di FamilyMed"
                />
              </div>
            </div>

            {/* Step 1-3 in colonna con forme organiche */}
            <div className="grid grid-cols-1 gap-4 sm:gap-5 md:col-span-4">
              {STEPS.map((s) => (
                <div
                  key={s.n}
                  className="flex flex-col justify-center rounded-3xl border border-stone-200/80 bg-white/80 p-5 sm:p-6 shadow-xs hover:border-emerald-700/30 hover:shadow-sm transition-all"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-2xl bg-emerald-100/90 font-display text-base font-bold text-emerald-900 italic shadow-xs">
                    {s.n}
                  </span>
                  <p className="mt-3 font-display text-lg sm:text-xl font-bold text-stone-900 italic">
                    {s.title}
                  </p>
                  <p className="mt-1.5 text-sm sm:text-base leading-relaxed text-stone-600">
                    {s.body}
                  </p>
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
            {PILLARS.map((f, i) => (
              <div
                key={f.title}
                className={cn(
                  "group rounded-3xl border border-stone-200/80 p-6 sm:p-7 transition-all",
                  "bg-white/80 hover:border-emerald-700/40 hover:shadow-md hover:bg-white",
                  i % 2 === 0 ? "rounded-tl-[3.5rem]" : "rounded-br-[3.5rem]",
                  f.span,
                )}
              >
                <div className="grid size-11 sm:size-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-800 border border-emerald-100 group-hover:bg-emerald-800 group-hover:text-white transition-colors">
                  <f.icon className="size-5 sm:size-6" />
                </div>
                <p className="mt-4 font-display text-xl sm:text-2xl font-bold text-stone-900 italic">
                  {f.title}
                </p>
                <p className="mt-2 text-base leading-relaxed text-stone-600 font-normal">
                  {f.body}
                </p>
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

          <ul className="mx-auto mt-10 max-w-3xl divide-y divide-stone-100 overflow-hidden rounded-[2.25rem] border border-stone-200/80 bg-white/90 shadow-sm">
            {FAQ_VIDEOS.map((v, i) => (
              <li key={v.id}>
                <Link
                  to="/guida-pubblica"
                  hash="faq-video"
                  className="group flex w-full min-w-0 items-center gap-3.5 px-4 sm:px-6 py-4.5 transition-colors hover:bg-emerald-50/50"
                >
                  <span className="shrink-0 font-display text-xl sm:text-2xl font-bold text-emerald-800 italic tabular-nums group-hover:text-emerald-950 transition-colors">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-base sm:text-lg font-bold tracking-tight text-stone-900 group-hover:text-emerald-950 transition-colors">
                      {v.title}
                    </span>
                    <span className="truncate text-sm text-stone-500 font-normal">{v.short}</span>
                  </span>
                  <span className="shrink-0 rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-semibold tabular-nums text-stone-600">
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
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-stone-300/80 bg-white px-6 text-sm font-bold text-stone-800 shadow-xs transition-all hover:bg-stone-50 hover:border-stone-400"
            >
              <Play className="mr-2 size-4 fill-current text-emerald-800" />
              Guarda tutti i video
            </Link>
          </div>
        </section>

        {/* PREZZI */}
        <section id="prezzi" className="mt-16 scroll-mt-24 sm:mt-24">
          <SectionHeading
            eyebrow="Piani trasparenti"
            title="Inizia gratis, cresci quando il gruppo si allarga"
            body="Nessun vincolo: puoi cambiare o disdire il piano in qualsiasi momento."
          />

          <div className="mt-12 grid items-start gap-5 md:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={cn(
                  "relative flex h-full flex-col rounded-[2.25rem] border p-6 sm:p-7 transition-all",
                  plan.highlight
                    ? "border-2 border-emerald-700/80 bg-gradient-to-b from-emerald-50/60 via-white to-white shadow-lg ring-1 ring-emerald-600/15 md:-mt-3 md:pb-9"
                    : "border-stone-200/90 bg-white/80 shadow-xs hover:shadow-md",
                )}
              >
                {plan.highlight && (
                  <span className="absolute -top-3.5 left-6 rounded-full bg-emerald-800 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-sm">
                    Più scelto
                  </span>
                )}

                <p className="font-display text-2xl sm:text-3xl font-bold text-stone-900 italic">
                  {plan.name}
                </p>
                <p className="mt-1.5 text-sm text-stone-500 font-medium">{plan.tagline}</p>

                <div className="mt-6 flex items-end gap-2">
                  <span className="font-display text-5xl font-bold tracking-tight text-stone-900">
                    {plan.price}
                  </span>
                  <span className="pb-1.5 text-sm text-stone-500 font-medium">{plan.period}</span>
                </div>

                <ul className="mt-7 space-y-3.5 text-base">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2.5">
                      <Check className="mt-1 size-4.5 shrink-0 text-emerald-700" />
                      <span className="leading-snug text-stone-700 font-normal">{feat}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={handleEnter}
                  className={cn(
                    "mt-8 inline-flex h-12 w-full items-center justify-center rounded-2xl text-base font-bold transition-all active:scale-[0.98]",
                    plan.highlight
                      ? "bg-emerald-800 text-white shadow-md hover:bg-emerald-900"
                      : "border border-stone-300/80 bg-white text-stone-800 hover:bg-stone-50 hover:border-stone-400 shadow-xs",
                  )}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>

          <p className="mt-8 text-center text-sm text-stone-500">
            FamilyMed non sostituisce il parere medico: segui sempre le indicazioni del medico curante.
          </p>
        </section>

        {/* CTA FINALE — card scultorea accogliente */}
        <section className="relative mt-16 sm:mt-24 overflow-hidden rounded-[3rem] rounded-tl-[4.5rem] border border-emerald-800/15 bg-gradient-to-br from-emerald-100/90 via-teal-50/70 to-amber-50/80 p-8 sm:p-14 text-center text-stone-900 shadow-md">
          {/* Forma organica in sottofondo */}
          <div className="pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-white/60 blur-2xl" />

          <p className="relative z-10 font-display text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-stone-900 italic">
            Smettete di chiedervi «l'ha presa?»
          </p>
          <p className="relative z-10 mx-auto mt-3 max-w-lg text-base sm:text-lg leading-relaxed text-stone-600">
            Bastano due minuti per creare il gruppo di cura e impostare la prima terapia.
          </p>
          <div className="relative z-10 mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleEnter}
              className="inline-flex h-13 w-full sm:w-auto items-center justify-center rounded-2xl bg-emerald-800 px-7 text-base font-bold text-white shadow-md transition-all hover:bg-emerald-900 active:scale-[0.98]"
            >
              Inizia gratis
              <ArrowRight className="ml-2 size-5 shrink-0" />
            </button>
            <Link
              to="/guida-pubblica"
              className="inline-flex h-13 w-full sm:w-auto items-center justify-center rounded-2xl border border-stone-300/80 bg-white/90 px-7 text-base font-bold text-stone-800 shadow-xs transition-all hover:bg-white hover:border-stone-400"
            >
              Guarda la guida
            </Link>
          </div>
        </section>
      </main>

      {/* FOOTER PUBBLICO */}
      <PublicFooter />
    </div>
  );
}
