import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  BellRing,
  Check,
  FileText,
  HeartPulse,
  Pill,
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
import { VideoWithTranscript } from "@/components/faq/VideoWithTranscript";
import { FAQ_VIDEOS } from "@/data/faq-videos";
import { DEMO_TRANSCRIPT } from "@/data/demo-video";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FamilyMed — La tranquillità di sapere che prendono le medicine" },
      {
        name: "description",
        content:
          "Promemoria in un tap per chi assume la terapia, monitoraggio in tempo reale per la famiglia. Alert sulle dosi dimenticate, scorte e report per il medico.",
      },
      { property: "og:title", content: "FamilyMed — Terapia condivisa in famiglia" },
      {
        property: "og:description",
        content:
          "La tranquillità di sapere che i tuoi cari prendono le medicine giuste, al momento giusto.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

const PLANS = [
  {
    name: "Free",
    price: "0€",
    period: "per sempre",
    tagline: "Per iniziare con una persona da seguire.",
    cta: "Inizia gratis",
    highlight: false,
    features: [
      "1 paziente seguito",
      "Promemoria e sveglia sonora",
      "Conferma dose in un tap",
      "Timeline di oggi",
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
      "Fino a 2 pazienti",
      "Tutto del piano Free",
      "Parametri vitali (pressione, glicemia, peso, saturazione)",
      "Report PDF 7 / 30 / 90 giorni",
      "Gestione scorte e avvisi esaurimento",
      "Storico completo e statistiche di aderenza",
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
      "Pazienti illimitati",
      "Tutto del piano Pro",
      "Gruppo di cura con ruoli e permessi",
      "Inviti con link e QR Code",
      "Registro attività (audit log)",
      "Export dati GDPR e priorità supporto",
    ],
  },
];

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
          <a
            href="#prezzi"
            className="hidden sm:inline-flex text-sm font-semibold text-foreground/80 hover:text-primary transition-colors px-2"
          >
            Prezzi
          </a>
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

      {/* HERO */}
      <section className="mx-auto max-w-6xl px-4 pb-12 pt-6 sm:px-6 md:pt-16 block w-full min-w-0">
        <div className="grid gap-10 md:grid-cols-2 md:items-center w-full">
          <div className="fm-reveal w-full block">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-[10px] sm:text-xs font-bold uppercase tracking-widest text-primary max-w-full truncate">
              <span className="size-1.5 shrink-0 rounded-full bg-primary" />
              <span className="truncate">Per chi si prende cura di qualcuno 💙</span>
            </span>

            <h1 className="mt-4 text-3xl font-black leading-[1.1] tracking-tight sm:text-5xl md:text-[3.4rem] text-left block">
              La tranquillità di sapere che i tuoi cari prendono{" "}
              <span className="text-primary">le medicine giuste, al momento giusto.</span>
            </h1>

            <p className="mt-5 max-w-md text-sm sm:text-base md:text-lg text-muted-foreground leading-relaxed">
              Basta telefonate per controllare. Il paziente conferma con un tap, tu vedi tutto in
              tempo reale — e se una dose salta, lo sai subito.
            </p>

            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:items-center w-full">
              <Button
                size="lg"
                className="h-12 sm:h-14 px-5 sm:px-6 text-sm sm:text-base font-bold w-full sm:w-auto"
                onClick={handleEnter}
              >
                {user ? "Entra" : "Inizia gratis"}
                <ArrowRight className="ml-2 size-4 sm:size-5 shrink-0" />
              </Button>

              <Button
                size="lg"
                variant="outline"
                className="h-12 sm:h-14 px-5 sm:px-6 text-sm sm:text-base font-bold w-full sm:w-auto"
                asChild
              >
                <a href="#demo" className="truncate">
                  <PlayCircle className="mr-2 size-5 shrink-0" />
                  Guarda la demo (30s)
                </a>
              </Button>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Nessuna carta richiesta · Dati sanitari cifrati e conformi GDPR
            </p>
          </div>

          {/* MOCK UI */}
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

        {/* VIDEO DEMO */}
        <div id="demo" className="mt-20 sm:mt-28 scroll-mt-20">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-bold uppercase tracking-widest text-accent">Demo · 30 secondi</span>
            <h2 className="mt-3 text-2xl sm:text-4xl font-black tracking-tight">
              Come funziona, in mezzo minuto
            </h2>
            <p className="mt-3 text-sm sm:text-base text-muted-foreground">
              La vista paziente, la dashboard della famiglia, gli alert sulle dosi dimenticate e i
              report per il medico.
            </p>
          </div>

          <VideoWithTranscript
            id="familymed-demo"
            className="mt-8 mx-auto w-full max-w-4xl"
            src={demoVideoUrl}
            poster={demoPosterUrl}
            title="Video demo di FamilyMed"
            transcript={DEMO_TRANSCRIPT}
          />

        </div>

        {/* VIDEO FAQ */}
        <div id="faq" className="mt-20 sm:mt-28 scroll-mt-20">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-bold uppercase tracking-widest text-primary">Video FAQ</span>
            <h2 className="mt-3 text-2xl sm:text-4xl font-black tracking-tight">
              Ogni funzione spiegata in 20 secondi
            </h2>
            <p className="mt-3 text-sm sm:text-base text-muted-foreground">
              Sei mini-video con sottotitoli e trascrizione: creare una terapia, invitare un
              caregiver, confermare una dose, parametri vitali, report PDF e scorte.
            </p>
          </div>

          <div className="mt-8 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {FAQ_VIDEOS.map((v) => (
              <Link
                key={v.id}
                to="/guida-pubblica"
                hash="faq-video"
                className="group flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card text-left shadow-card transition-shadow hover:shadow-lift"
              >
                <img
                  src={v.poster}
                  alt={`Anteprima del video tutorial: ${v.title}`}
                  loading="lazy"
                  className="block aspect-video w-full object-cover"
                />
                <span className="flex min-w-0 flex-1 flex-col p-4">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {v.category} · {v.duration}s
                  </span>
                  <span className="mt-1.5 text-sm font-black tracking-tight">{v.title}</span>
                  <span className="mt-1 text-xs leading-relaxed text-muted-foreground">{v.short}</span>
                </span>
              </Link>
            ))}
          </div>

          <div className="mt-6 text-center">
            <Button variant="outline" size="lg" className="h-12 px-6 font-bold" asChild>
              <Link to="/guida-pubblica" hash="faq-video">
                <PlayCircle className="mr-2 size-5" />
                Guarda tutti i video FAQ
              </Link>
            </Button>
          </div>
        </div>

        {/* FEATURES */}
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
              icon: BellRing,
              title: "Dosi dimenticate",
              body: "Se la dose non arriva entro il tempo previsto diventa dimenticata: notifica e alert in dashboard.",
            },
            {
              icon: ShieldCheck,
              title: "Notifiche & scorte",
              body: "Avvisi automatici quando le pillole stanno finendo, con sincronizzazione Calendar.",
            },
            {
              icon: FileText,
              title: "Report per il medico",
              body: "Storico aderenza e parametri vitali esportabili in PDF a 7, 30 o 90 giorni.",
            },
            {
              icon: Users,
              title: "Gruppo di cura",
              body: "Familiari e badanti insieme, con ruoli, permessi e registro attività trasparente.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-2xl sm:rounded-3xl border border-border/60 bg-card p-5 sm:p-6 shadow-card block text-left"
            >
              <div className="grid size-10 sm:size-11 place-items-center rounded-xl bg-primary-soft text-primary shrink-0">
                <f.icon className="size-4.5 sm:size-5" />
              </div>
              <p className="mt-4 text-base sm:text-lg font-black tracking-tight">{f.title}</p>
              <p className="mt-1 text-xs sm:text-sm text-muted-foreground leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>

        {/* PREZZI */}
        <div id="prezzi" className="mt-20 sm:mt-28 scroll-mt-20">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-bold uppercase tracking-widest text-primary">Prezzi</span>
            <h2 className="mt-3 text-2xl sm:text-4xl font-black tracking-tight">
              Inizia gratis, cresci quando serve
            </h2>
            <p className="mt-3 text-sm sm:text-base text-muted-foreground">
              Nessun vincolo: puoi cambiare o disdire il piano in qualsiasi momento.
            </p>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-3 items-start">
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
                      <span className="text-foreground/85 leading-snug">{feat}</span>
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
            FamilyMed non sostituisce il parere medico: segui sempre le indicazioni del medico curante.
          </p>
        </div>

        {/* CTA FINALE */}
        <div className="mt-16 sm:mt-24 rounded-3xl border border-primary/20 bg-primary-soft/40 p-8 text-center">
          <p className="text-xl sm:text-2xl font-black tracking-tight">
            Smetti di chiedere «hai preso la pillola?»
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Bastano due minuti per impostare la prima terapia.
          </p>
          <div className="mt-5 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
            <Button size="lg" className="h-12 px-6 font-bold w-full sm:w-auto" onClick={handleEnter}>
              Inizia gratis
              <ArrowRight className="ml-2 size-5" />
            </Button>
            <Button size="lg" variant="outline" className="h-12 px-6 font-bold w-full sm:w-auto" asChild>
              <Link to="/guida-pubblica">Guarda la guida</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      {!loadingAuth && !user && <SiteFooter />}
    </div>
  );
}
