import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Check,
  X,
  Sparkles,
  ShieldCheck,
  Users,
  Pill,
  HelpCircle,
  ArrowRight,
  ChevronDown,
  FileText,
  Activity,
  Package,
  Heart,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SiteFooter } from "@/components/SiteFooter";
import { PLAN_LIMITS, formatPrice, type SubscriptionPlan } from "@/lib/subscription";

export const Route = createFileRoute("/prezzi")({
  head: () => ({
    meta: [
      { title: "Prezzi e Piani — FamilyMed" },
      {
        name: "description",
        content:
          "Scopri i piani di abbonamento FamilyMed: Free, Pro e Max per gestire la terapia dei tuoi cari e coordinare la famiglia in totale serenità.",
      },
      { property: "og:title", content: "Prezzi e Piani — FamilyMed" },
      {
        property: "og:description",
        content:
          "Trasparenza totale. Nessun costo nascosto. Scegli il piano ideale per la tua famiglia.",
      },
    ],
  }),
  component: PublicPricingPage,
});

function PublicPricingPage() {
  const [isAnnual, setIsAnnual] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const toggleFaq = (idx: number) => {
    setOpenFaq(openFaq === idx ? null : idx);
  };

  return (
    <div className="min-h-screen bg-background w-full overflow-x-hidden text-left">
      {/* HEADER PUBBLICO */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 sm:py-6 w-full border-b border-border/40">
        <Link to="/" className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="grid size-9 sm:size-10 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lift">
            <Pill className="size-4.5 sm:size-5" />
          </div>
          <p className="text-base sm:text-lg font-black tracking-tight leading-none truncate">
            FamilyMed
          </p>
        </Link>

        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <Link
            to="/guida-pubblica"
            className="hidden sm:inline-flex text-sm font-semibold text-foreground/80 hover:text-primary transition-colors"
          >
            Guida
          </Link>
          <Button variant="ghost" size="sm" asChild className="text-xs sm:text-sm">
            <Link to="/login">Accedi</Link>
          </Button>
          <Button size="sm" asChild className="text-xs sm:text-sm font-bold shadow-sm">
            <Link to="/registrati">Inizia gratis</Link>
          </Button>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="mx-auto max-w-4xl px-4 pt-12 pb-8 text-center space-y-4">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider">
          <Sparkles className="size-4" />
          <span>Trasparenza Totale</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-foreground leading-[1.15]">
          Scegli la tranquillità per la tua famiglia
        </h1>
        <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Nessun costo nascosto, nessun vincolo. Puoi iniziare gratuitamente e passare a un piano superiore quando la famiglia ha bisogno di collaborare.
        </p>

        {/* Annual / Monthly Billing Switcher */}
        <div className="pt-6 flex justify-center items-center gap-3">
          <span className={`text-sm font-semibold ${!isAnnual ? "text-foreground" : "text-muted-foreground"}`}>
            Fatturazione Mensile
          </span>
          <button
            onClick={() => setIsAnnual(!isAnnual)}
            className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${
              isAnnual ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`inline-block size-5 transform rounded-full bg-white transition-transform ${
                isAnnual ? "translate-x-8" : "translate-x-1"
              }`}
            />
          </button>
          <div className="flex items-center gap-1.5">
            <span className={`text-sm font-semibold ${isAnnual ? "text-foreground" : "text-muted-foreground"}`}>
              Fatturazione Annuale
            </span>
            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold border-emerald-500/20 text-[10px]">
              -33% sconto
            </Badge>
          </div>
        </div>
      </section>

      {/* 3 PRICING CARDS */}
      <section className="mx-auto max-w-6xl px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          {/* FREE CARD */}
          <PricingCard
            name="Free"
            price={0}
            badge="Per sempre gratis"
            tagline="Ideale per chi gestisce da solo la terapia di un familiare."
            ctaText="Inizia gratis"
            ctaLink="/registrati"
            highlighted={false}
            features={[
              { text: "1 Paziente gestibile", highlight: false },
              { text: "1 Persona (solo titolare)", highlight: false },
              { text: "Max 3 terapie attive", highlight: false },
              { text: "1 Orario promemoria fisso", highlight: false },
              { text: "Storico diario ultimi 7 giorni", highlight: false },
              { text: "Export Dati Personali (GDPR)", highlight: true },
            ]}
          />

          {/* PRO CARD */}
          <PricingCard
            name="Pro"
            price={isAnnual ? 39.99 / 12 : 4.99}
            periodLabel={isAnnual ? "4,99 € / mese (39,99 €/anno)" : "4,99 € / mese"}
            badge="Più scelto dalle famiglie"
            tagline="Per fratelli, famiglie e badanti che vogliono coordinarsi."
            ctaText="Prova il piano Pro"
            ctaLink="/registrati"
            highlighted={true}
            features={[
              { text: "Fino a 2 Pazienti gestibili", highlight: true },
              { text: "Fino a 5 Caregiver per paziente (Titolare + 4)", highlight: true },
              { text: "Terapie attive illimitate", highlight: true },
              { text: "Promemoria multipli e scaglionati", highlight: true },
              { text: "Foto del farmaco e della confezione", highlight: true },
              { text: "Storico diario & assunzioni illimitato", highlight: true },
              { text: "Parametri vitali (Pressione, Glicemia, Peso, SpO₂)", highlight: true },
              { text: "Controllo scorte & avviso esaurimento", highlight: true },
              { text: "Report PDF per il medico (7/30/90 giorni)", highlight: true },
              { text: "Ruoli caregiver (Principale / Secondario)", highlight: true },
            ]}
          />

          {/* MAX CARD */}
          <PricingCard
            name="Max"
            price={isAnnual ? 79.99 / 12 : 9.99}
            periodLabel={isAnnual ? "9,99 € / mese (79,99 €/anno)" : "9,99 € / mese"}
            badge="Per famiglie estese e gruppi di cura"
            tagline="Per chi gestisce più anziani o necessita di permessi avanzati."
            ctaText="Attiva il piano Max"
            ctaLink="/registrati"
            highlighted={false}
            features={[
              { text: "Fino a 10 Pazienti contemporaneamente", highlight: true },
              { text: "Fino a 10 Caregiver per paziente (Titolare + 9)", highlight: true },
              { text: "Tutto del piano Pro incluso", highlight: true },
              { text: "Report PDF aggregato multi-paziente", highlight: true },
              { text: "Ruoli e permessi granulari (es. sola lettura)", highlight: true },
              { text: "Audit Log (Registro completo attività)", highlight: true },
              { text: "Supporto prioritario via email", highlight: true },
            ]}
          />
        </div>
      </section>

      {/* DETAILED COMPARISON TABLE */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
            Confronto dettagliato delle funzionalità
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Confronta i piani nel dettaglio per trovare la soluzione perfetta per te.
          </p>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-border/60 bg-card shadow-sm">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-border/60 bg-secondary/40">
                <th className="p-4 sm:p-5 font-bold text-base text-foreground min-w-[220px]">
                  Funzionalità & Limiti
                </th>
                <th className="p-4 sm:p-5 font-bold text-center text-foreground w-[160px]">
                  Free (0€)
                </th>
                <th className="p-4 sm:p-5 font-bold text-center text-primary bg-primary/5 w-[180px]">
                  Pro (4,99€/m)
                </th>
                <th className="p-4 sm:p-5 font-bold text-center text-foreground w-[180px]">
                  Max (9,99€/m)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {/* Category: Capacità */}
              <TableCategoryHeader title="Capacità & Condivisione" />
              <TableRow label="Pazienti gestibili" free="1" pro="Fino a 2" max="Fino a 10" />
              <TableRow label="Caregiver per paziente" free="1 (solo titolare)" pro="Fino a 5 (Titolare + 4)" max="Fino a 10 (Titolare + 9)" />
              <TableRow label="Terapie attive per paziente" free="Max 3" pro="Illimitate" max="Illimitate" />

              {/* Category: Funzionalità Cliniche */}
              <TableCategoryHeader title="Gestione Terapia & Salute" />
              <TableRow label="Promemoria d'assunzione" free="1 orario fisso" pro="Multipli & personalizzabili" max="Multipli & personalizzabili" />
              <TableRow label="Foto confezione e farmaco" free={false} pro={true} max={true} />
              <TableRow label="Diario del benessere & Note" free="Ultimi 7 giorni" pro="Illimitato" max="Illimitato" />
              <TableRow label="Parametri vitali (pressione, glicemia, peso)" free={false} pro={true} max={true} />
              <TableRow label="Monitoraggio scorte pillole" free="Contatore base" pro="Storico + Previsione" max="Storico + Previsione" />

              {/* Category: Report & Gruppo */}
              <TableCategoryHeader title="Report, Ruoli & Sicurezza" />
              <TableRow label="Report PDF per il medico" free={false} pro="7 / 30 / 90 giorni" max="Singoli + Aggregato multi-paziente" />
              <TableRow label="Ruoli & Permessi caregiver" free={false} pro="Principale / Secondario" max="Granulari (es. Sola lettura)" />
              <TableRow label="Audit Log (Registro attività)" free={false} pro={false} max={true} />
              <TableRow label="Export Dati Personali (GDPR)" free={true} pro={true} max={true} />
              <TableRow label="Supporto clienti" free="Email standard" pro="Email standard" max="Email prioritaria" />
            </tbody>
          </table>
        </div>
      </section>

      {/* GDPR & GUARANTEE CARD */}
      <section className="mx-auto max-w-4xl px-4 py-8">
        <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-6">
          <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="size-8" />
          </div>
          <div className="space-y-2 text-center sm:text-left">
            <h3 className="text-xl font-bold text-foreground tracking-tight">
              Privacy e Dati Sanitari Protetti al 100% (GDPR)
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              La salute dei tuoi cari è preziosa. I dati inseriti su FamilyMed sono protetti da crittografia di livello bancario e non verranno mai venduti a terzi. Il tuo diritto di esportare o eliminare tutti i dati personali è garantito gratuitamente su tutti i piani.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ ACCORDION SECTION */}
      <section className="mx-auto max-w-3xl px-4 py-12">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
            Domande frequenti sui piani
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Risposte chiare alle domande più comuni sul funzionamento dei piani.
          </p>
        </div>

        <div className="space-y-3">
          {FAQS.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div
                key={idx}
                className="rounded-2xl border border-border/60 bg-card overflow-hidden transition-all"
              >
                <button
                  onClick={() => toggleFaq(idx)}
                  className="w-full p-4 sm:p-5 flex items-center justify-between text-left font-bold text-sm sm:text-base text-foreground hover:bg-secondary/40 transition-colors"
                >
                  <span>{faq.q}</span>
                  <ChevronDown className={`size-5 text-muted-foreground transition-transform ${isOpen ? "rotate-180 text-primary" : ""}`} />
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 sm:px-5 sm:pb-5 text-xs sm:text-sm text-muted-foreground leading-relaxed border-t border-border/40 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* FINAL CTA BANNER */}
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="rounded-3xl bg-primary text-primary-foreground p-8 sm:p-12 text-center space-y-6 shadow-xl relative overflow-hidden">
          <div className="relative z-10 max-w-2xl mx-auto space-y-4">
            <h2 className="text-2xl sm:text-4xl font-black tracking-tight">
              Inizia subito a prenderti cura dei tuoi cari
            </h2>
            <p className="text-primary-foreground/80 text-sm sm:text-base">
              Crea il tuo account gratuito in 30 secondi. Puoi passare a un piano superiore quando lo desideri.
            </p>
            <div className="pt-2 flex justify-center">
              <Button
                size="lg"
                asChild
                className="bg-white text-primary hover:bg-white/90 font-bold rounded-xl px-8 py-3 text-base shadow-md"
              >
                <Link to="/registrati">
                  <span>Crea Account Gratuito</span>
                  <ArrowRight className="ml-2 size-5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function PricingCard({
  name,
  price,
  periodLabel,
  badge,
  tagline,
  ctaText,
  ctaLink,
  highlighted,
  features,
}: {
  name: string;
  price: number;
  periodLabel?: string;
  badge: string;
  tagline: string;
  ctaText: string;
  ctaLink: string;
  highlighted: boolean;
  features: { text: string; highlight: boolean }[];
}) {
  return (
    <div
      className={`relative flex flex-col justify-between rounded-3xl p-6 sm:p-7 transition-all ${
        highlighted
          ? "bg-card border-2 border-primary shadow-xl ring-4 ring-primary/10"
          : "bg-card border border-border/60 shadow-sm"
      }`}
    >
      {highlighted && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-xs font-bold text-primary-foreground shadow-sm">
          Più Popolare
        </div>
      )}

      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-black text-foreground">{name}</h3>
          <span className="text-[10px] uppercase font-bold tracking-widest px-2.5 py-1 rounded-full bg-primary/10 text-primary">
            {badge}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-2 min-h-[32px]">{tagline}</p>

        <div className="mt-5 mb-6">
          {price === 0 ? (
            <div className="text-4xl font-black text-foreground">0 €</div>
          ) : (
            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-black text-foreground">
                  {formatPrice(price)}
                </span>
                <span className="text-xs text-muted-foreground font-medium">/mese</span>
              </div>
              {periodLabel && (
                <p className="text-[11px] text-muted-foreground mt-1">{periodLabel}</p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2.5 border-t border-border/40 pt-5">
          {features.map((f, i) => (
            <div key={i} className="flex items-start gap-2.5 text-xs">
              <Check className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <span className={f.highlight ? "font-semibold text-foreground" : "text-muted-foreground"}>
                {f.text}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 pt-4 border-t border-border/40">
        <Button
          asChild
          className={`w-full font-bold rounded-xl py-3 ${
            highlighted
              ? "bg-primary text-primary-foreground shadow-md hover:bg-primary/90"
              : "bg-secondary text-foreground hover:bg-secondary/80"
          }`}
        >
          <Link to={ctaLink as any}>{ctaText}</Link>
        </Button>
      </div>
    </div>
  );
}

function TableCategoryHeader({ title }: { title: string }) {
  return (
    <tr className="bg-secondary/30">
      <td colSpan={4} className="p-3 px-4 font-bold text-xs uppercase tracking-widest text-primary">
        {title}
      </td>
    </tr>
  );
}

function TableRow({
  label,
  free,
  pro,
  max,
}: {
  label: string;
  free: boolean | string;
  pro: boolean | string;
  max: boolean | string;
}) {
  return (
    <tr className="hover:bg-muted/20 transition-colors">
      <td className="p-4 font-medium text-foreground text-xs sm:text-sm">{label}</td>
      <td className="p-4 text-center">{renderCell(free)}</td>
      <td className="p-4 text-center bg-primary/5">{renderCell(pro)}</td>
      <td className="p-4 text-center">{renderCell(max)}</td>
    </tr>
  );
}

function renderCell(val: boolean | string) {
  if (typeof val === "boolean") {
    return val ? (
      <Check className="size-5 text-emerald-600 dark:text-emerald-400 mx-auto" />
    ) : (
      <X className="size-5 text-muted-foreground/30 mx-auto" />
    );
  }
  return <span className="font-semibold text-xs sm:text-sm text-foreground">{val}</span>;
}

const FAQS = [
  {
    q: "Posso utilizzare FamilyMed gratuitamente?",
    a: "Assolutamente sì. Il piano Free è gratuito per sempre e consente ad una persona di gestire 1 paziente con un massimo di 3 terapie attive, senza limiti di tempo.",
  },
  {
    q: "Come posso coinvolgere i miei fratelli o la badante?",
    a: "Con i piani Pro e Max puoi generare un codice invito o un QR Code sicuro dall'app e condividerlo via WhatsApp. Chi riceve il codice entrerà immediatamente nel gruppo di cura del paziente.",
  },
  {
    q: "Come posso cambiare o disdire il piano?",
    a: "Puoi aggiornare o disdire il tuo abbonamento in qualsiasi momento dalle Impostazioni dell'app in 1 solo tap, senza penali né vincoli.",
  },
  {
    q: "Cosa succede ai dati del paziente se disdico l'abbonamento?",
    a: "I tuoi dati non vengono mai cancellati dopo una disdetta. Accederai semplicemente nei limiti del piano Free e potrai esportarli o riattivare il piano in qualsiasi momento.",
  },
  {
    q: "I dati sanitari del mio familiare sono al sicuro?",
    a: "Sì. FamilyMed applica rigidi standard di sicurezza ai sensi del GDPR europeo (Reg. UE 2016/679). I dati sono crittografati e non verranno mai ceduti o venduti a terzi.",
  },
];
