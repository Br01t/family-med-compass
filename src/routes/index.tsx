import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Activity,
  Check,
  CheckCircle2,
  Clock,
  ClipboardList,
  Eye,
  HeartHandshake,
  History,
  Home,
  Lock,
  Package,
  Pill,
  Play,
  Quote,
  Server,
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

function Eyebrow({ children, animated = false }: { children: string; animated?: boolean }) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-emerald-800/15 bg-emerald-50/90 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-emerald-900 shadow-xs">
      <span className={cn("size-2 shrink-0 rounded-full bg-emerald-600", animated && "animate-pulse")} />
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
      <h2 className="mt-5 font-display text-3xl sm:text-4xl md:text-[2.85rem] leading-tight tracking-tight text-stone-900 font-bold">
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
    <div className="landing-light relative min-h-screen w-full max-w-full overflow-x-hidden bg-[#FAF8F5] text-left text-stone-800 selection:bg-emerald-100 selection:text-emerald-900">
      {/* Sfondi organici con forme asimmetriche fluide */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden -z-0">
        {/* Forma organica fluida 1: Salvia e Menta in alto a sinistra */}
        <div
          className="animate-fluid-blob absolute -top-28 -left-24 h-[460px] w-[460px] rounded-full bg-emerald-200/70 blur-2xl"
        />
        {/* Forma organica fluida 2: Sabbia calda e pesca in alto a destra */}
        <div
          className="animate-fluid-blob absolute top-10 -right-24 h-[480px] w-[480px] rounded-full bg-amber-200/60 blur-2xl"
          style={{ animationDelay: "-9s" }}
        />
        {/* Forma fluida 3: Centro-basso */}
        <div
          className="animate-fluid-blob absolute top-[950px] left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-teal-200/50 blur-2xl"
          style={{ animationDelay: "-5s" }}
        />
      </div>

      {/* HEADER PUBBLICO */}
      <PublicHeader currentPath="/" />

      <main className="mx-auto w-full min-w-0 max-w-6xl px-4 pb-20 sm:px-6 relative">
        {/* HERO */}
        <section className="pt-8 text-center md:pt-16">
          <Eyebrow animated>Coordinamento della cura in famiglia</Eyebrow>

          <h1 className="mx-auto mt-6 max-w-4xl font-display text-[2.35rem] sm:text-5xl md:text-[3.65rem] leading-[1.12] tracking-tight text-stone-900 font-bold">
            Tutti sanno cosa è stato fatto,{" "}
            <span className="relative inline-block text-emerald-800 font-extrabold px-1">
              <span className="italic font-semibold">cosa deve essere fatto</span>
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

          <p className="mt-5 text-sm font-medium text-stone-600 flex items-center justify-center gap-1.5">
            <ShieldCheck className="size-4 text-emerald-700 shrink-0" />
            <span>Nessuna carta richiesta · Dati sanitari cifrati e conformi GDPR</span>
          </p>

          {/* MOCKUP REALE: telefono con l'interfaccia dell'app */}
          <div className="mt-12 sm:mt-16 mx-auto flex justify-center">
            <div className="relative aspect-[9/19.5] w-[260px] sm:w-[290px] rounded-[3rem] border-[10px] border-stone-900 bg-stone-900 shadow-2xl shadow-stone-900/25">
              {/* Notch */}
              <div className="absolute top-0 left-1/2 z-20 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-stone-900" />
              {/* Schermo */}
              <div className="flex h-full flex-col overflow-hidden rounded-[2.25rem] bg-[#FAF8F5]">
                {/* Status bar */}
                <div className="flex shrink-0 items-center justify-between px-6 pt-3.5 pb-1 text-[10px] font-bold text-stone-500">
                  <span>9:15</span>
                  <span className="flex items-center gap-1">
                    <span className="text-[9px]">●●●●</span>
                  </span>
                </div>

                <div className="flex flex-1 flex-col px-4 pb-4 pt-3 text-left">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                      Terapie di oggi · Nonna Rosa
                    </span>
                    <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-800 border border-emerald-100">
                      <span className="size-1.5 rounded-full bg-emerald-600" />
                      Allineati
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {/* Dose già confermata */}
                    <div className="flex items-start gap-2.5 rounded-2xl bg-white p-3 border border-stone-100 shadow-xs">
                      <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
                        <CheckCircle2 className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold text-stone-900">Cardioaspirina 100mg</p>
                          <span className="shrink-0 text-[10px] font-bold text-stone-400">08:00</span>
                        </div>
                        <p className="text-[11px] text-stone-500">1 compressa a colazione</p>
                        <span className="mt-1 inline-block text-[10px] font-bold text-emerald-700">
                          Confermata da Marco (figlio) · 08:05
                        </span>
                      </div>
                    </div>

                    {/* Dose imminente */}
                    <div className="flex items-start gap-2.5 rounded-2xl bg-amber-50/70 p-3 border border-amber-200">
                      <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-white text-amber-700 border border-amber-200">
                        <Clock className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold text-stone-900">Metformina 500mg</p>
                          <span className="shrink-0 text-[10px] font-bold text-amber-700">13:00</span>
                        </div>
                        <p className="text-[11px] text-stone-500">1 compressa dopo pranzo</p>
                        <span className="mt-1 inline-block text-[10px] font-bold text-amber-700">
                          Promemoria tra 20 minuti
                        </span>
                      </div>
                    </div>

                    {/* Dose successiva, in attesa */}
                    <div className="flex items-start gap-2.5 rounded-2xl bg-white p-3 border border-stone-100">
                      <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-400">
                        <Clock className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold text-stone-500">Ramipril 5mg</p>
                          <span className="shrink-0 text-[10px] font-bold text-stone-400">20:00</span>
                        </div>
                        <p className="text-[11px] text-stone-400">1 compressa a cena</p>
                      </div>
                    </div>
                  </div>

                  {/* Riquadri statistici: aderenza e scorte, a riempimento e a mostrare altre funzioni */}
                  <div className="mt-3 space-y-2.5">
                    <div className="rounded-2xl bg-white p-3 border border-stone-100">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-stone-500">
                          Aderenza ultimi 7 giorni
                        </span>
                        <span className="text-xs font-extrabold text-emerald-700">96%</span>
                      </div>
                      <div className="mt-2.5 flex h-9 items-end gap-1.5">
                        {[62, 80, 55, 90, 100, 85, 96].map((h, i) => (
                          <div
                            key={i}
                            className="flex-1 rounded-t-sm bg-emerald-500/85"
                            style={{ height: `${h}%` }}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-white p-3 border border-stone-100">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-stone-800">Scorta Cardioaspirina</span>
                        <span className="text-[10px] font-bold text-stone-500">12 giorni residui</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100">
                        <div className="h-full w-[62%] rounded-full bg-emerald-600" />
                      </div>
                    </div>
                  </div>

                  {/* Barra di navigazione: sezioni reali dell'app */}
                  <div className="mt-auto flex items-center justify-between border-t border-stone-200/80 pt-2.5">
                    {[
                      { icon: Home, label: "Oggi" },
                      { icon: Pill, label: "Terapie" },
                      { icon: Activity, label: "Parametri" },
                      { icon: Package, label: "Scorte" },
                      { icon: History, label: "Storico" },
                    ].map((tab, i) => (
                      <div
                        key={tab.label}
                        className={cn(
                          "flex flex-1 flex-col items-center gap-1 text-[8px] font-bold leading-none",
                          i === 0 ? "text-emerald-800" : "text-stone-400",
                        )}
                      >
                        <tab.icon className="size-4" />
                        {tab.label}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Home indicator */}
                <div className="flex shrink-0 justify-center pb-2.5 pt-1">
                  <div className="h-1 w-24 rounded-full bg-stone-300" />
                </div>
              </div>
            </div>
          </div>

          <p className="mx-auto mt-5 max-w-md text-center text-xs text-stone-500 font-medium">
            Nessun dubbio, nessuna telefonata d'ansia: ognuno sa esattamente cosa succede.
          </p>

          {/* TRUST BAR: sicurezza e conformità */}
          <div className="mx-auto mt-10 flex max-w-3xl flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {[
              { icon: ShieldCheck, label: "Conforme GDPR" },
              { icon: Lock, label: "Dati cifrati end-to-end" },
              { icon: Server, label: "Server in Unione Europea" },
              { icon: HeartHandshake, label: "Progettato con caregiver e farmacisti" },
            ].map((t) => (
              <span key={t.label} className="inline-flex items-center gap-2 text-sm font-semibold text-stone-600">
                <t.icon className="size-4 text-emerald-700 shrink-0" />
                {t.label}
              </span>
            ))}
          </div>
        </section>

        {/* TESTIMONIANZA */}
        <section className="mt-16 sm:mt-20">
          <div className="mx-auto max-w-2xl rounded-[2rem] border border-stone-200/80 bg-white/80 p-6 sm:p-8 text-center shadow-xs">
            <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-800 border border-emerald-100">
              <Quote className="size-5" />
            </div>
            <p className="mt-4 text-lg sm:text-xl leading-relaxed text-stone-800 font-medium">
              "Prima ci chiamavamo tre volte al giorno per capire chi avesse dato la terapia alla
              mamma. Ora apriamo l'app e lo sappiamo subito, tutti quanti."
            </p>
            <p className="mt-4 text-sm font-semibold text-stone-500">
              Famiglia caregiver · utilizzatrice della versione beta
            </p>
          </div>
        </section>

        {/* BENTO: DEMO + STEP */}
        <section id="demo" className="mt-16 scroll-mt-24 sm:mt-24">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-12">
            {/* Demo video — card scultorea principale */}
            <div className="relative overflow-hidden rounded-[2.5rem] rounded-tl-[4rem] border border-stone-200/90 bg-gradient-to-br from-white/95 via-white/85 to-emerald-50/30 p-6 sm:p-8 md:col-span-8 shadow-sm backdrop-blur-md">
              <div className="relative z-10">
                <h3 className="font-display text-2xl sm:text-3xl text-stone-900 font-bold">
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
                  <span className="grid size-9 shrink-0 place-items-center rounded-2xl bg-emerald-100/90 font-display text-base font-bold text-emerald-900 shadow-xs">
                    {s.n}
                  </span>
                  <p className="mt-3 font-display text-lg sm:text-xl font-bold text-stone-900">
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
                <p className="mt-4 font-display text-xl sm:text-2xl font-bold text-stone-900">
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
                    <span className="truncate text-sm text-stone-600 font-normal">{v.short}</span>
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

                <p className="font-display text-2xl sm:text-3xl font-bold text-stone-900">
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

          <p className="mt-8 text-center text-sm text-stone-600">
            FamilyMed non sostituisce il parere medico: segui sempre le indicazioni del medico curante.
          </p>
        </section>

        {/* CTA FINALE — card scultorea accogliente */}
        <section className="relative mt-16 sm:mt-24 overflow-hidden rounded-[3rem] rounded-tl-[4.5rem] border border-emerald-800/15 bg-gradient-to-br from-emerald-100/90 via-teal-50/70 to-amber-50/80 p-8 sm:p-14 text-center text-stone-900 shadow-md">
          {/* Forma organica in sottofondo */}
          <div className="pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-white/60 blur-2xl" />

          <p className="relative z-10 font-display text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-stone-900">
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