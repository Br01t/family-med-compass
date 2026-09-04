import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Check,
  X,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/subscription";
import { PublicPageShell } from "@/components/public/PublicPageShell";

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
    <PublicPageShell currentPath="/prezzi">
      {/* HERO SECTION */}
      <section className="mx-auto max-w-4xl pt-8 pb-8 text-center space-y-4 md:pt-12">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-800/15 bg-emerald-50/90 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-emerald-900">
          <Sparkles className="size-3.5" />
          <span>Trasparenza Totale</span>
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-white italic sm:text-5xl md:text-[3.3rem] leading-[1.12]">
          Scegli la tranquillità per la tua famiglia
        </h1>
        <p className="mx-auto max-w-2xl text-base sm:text-lg text-stone-600 leading-relaxed font-normal">
          Nessun costo nascosto, nessun vincolo. Puoi iniziare gratuitamente e passare a un piano superiore quando la famiglia ha bisogno di collaborare.
        </p>

        {/* Annual / Monthly Billing Switcher */}
        <div className="pt-6 flex justify-center items-center gap-3">
          <span className={`text-sm sm:text-base font-semibold transition-colors ${!isAnnual ? "text-stone-900" : "text-stone-500"}`}>
            Fatturazione Mensile
          </span>
          <button
            type="button"
            onClick={() => setIsAnnual(!isAnnual)}
            className={`relative inline-flex h-8 w-15 items-center rounded-full border border-stone-300/80 transition-colors p-1 ${
              isAnnual ? "bg-ocean-300" : "bg-stone-50/90"
            }`}
          >
            <span
              className={`inline-block size-6 transform rounded-full transition-transform shadow-md ${
                isAnnual ? "translate-x-7 bg-emerald-900" : "translate-x-0 bg-white"
              }`}
            />
          </button>
          <div className="flex items-center gap-2">
            <span className={`text-sm sm:text-base font-semibold transition-colors ${isAnnual ? "text-stone-900" : "text-stone-500"}`}>
              Fatturazione Annuale
            </span>
            <Badge className="bg-emerald-800/10 text-emerald-800 font-bold border-emerald-800/15 text-xs px-2.5 py-0.5">
              -33% sconto
            </Badge>
          </div>
        </div>
      </section>

      {/* 3 PRICING CARDS */}
      <section className="mx-auto max-w-6xl py-8">
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
            periodLabel={isAnnual ? "3,33 € / mese (39,99 €/anno)" : "4,99 € / mese"}
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
            periodLabel={isAnnual ? "6,66 € / mese (79,99 €/anno)" : "9,99 € / mese"}
            badge="Per famiglie estese e gruppi di cura"
            tagline="Per chi gestisce più anziani o necessita di permessi avanzati."
            ctaText="Attiva il piano Max"
            ctaLink="/registrati"
            highlighted={false}
            features={[
              { text: "Fino a 10 Pazienti contemporaneamente", highlight: true },
              { text: "Fino a 10 Caregiver per paziente (Titolare + 9)", highlight: true },
              { text: "Tutte le funzioni del piano Pro incluse", highlight: true },
              { text: "Registro attività completo (Audit Log)", highlight: true },
              { text: "Gestione avanzata delle deleghe e badanti", highlight: true },
              { text: "Report clinico aggregato per medico o struttura", highlight: true },
              { text: "Assistenza via email prioritaria entro 12 ore", highlight: true },
            ]}
          />
        </div>
      </section>

      {/* COMPARISON TABLE */}
      <section className="mx-auto max-w-6xl py-12">
        <div className="text-center mb-8">
          <h2 className="font-display text-2xl sm:text-4xl font-bold text-stone-900 italic tracking-tight">
            Confronto dettagliato delle funzionalità
          </h2>
          <p className="text-base text-stone-600 mt-2 max-w-xl mx-auto">
            Ogni dettaglio pensato per garantire la massima aderenza alle cure e la serenità della tua famiglia.
          </p>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-stone-200/80 bg-white/80 shadow-sm">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-stone-200/80 bg-stone-50/90">
                <th className="p-4 sm:p-5 font-bold text-base text-white min-w-[220px]">
                  Funzionalità & Limiti
                </th>
                <th className="p-4 sm:p-5 font-bold text-center text-white w-[160px]">
                  Free (0€)
                </th>
                <th className="p-4 sm:p-5 font-bold text-center text-emerald-800 bg-emerald-800/10 w-[180px]">
                  Pro (4,99€/m)
                </th>
                <th className="p-4 sm:p-5 font-bold text-center text-white w-[180px]">
                  Max (9,99€/m)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
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
      <section className="mx-auto max-w-4xl py-6">
        <div className="rounded-3xl border border-ocean-300/30 bg-white/80 p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-6 backdrop-blur-sm">
          <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-emerald-800/10 text-emerald-800">
            <ShieldCheck className="size-8" />
          </div>
          <div className="space-y-2 text-center sm:text-left">
            <h3 className="font-display text-xl font-bold text-stone-900 italic tracking-tight">
              Privacy e Dati Sanitari Protetti al 100% (GDPR)
            </h3>
            <p className="text-base text-stone-600 leading-relaxed font-normal">
              La salute dei tuoi cari è preziosa. I dati inseriti su FamilyMed sono protetti da crittografia end-to-end e non verranno mai venduti o condivisi con terzi. Il diritto di esportare o cancellare tutti i dati personali è garantito gratuitamente su tutti i piani.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ ACCORDION SECTION */}
      <section className="mx-auto max-w-3xl py-12">
        <div className="text-center mb-8">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-stone-900 italic tracking-tight">
            Domande frequenti sui piani
          </h2>
          <p className="text-base text-stone-600 mt-2">
            Risposte chiare alle domande più comuni sul funzionamento dei piani.
          </p>
        </div>

        <div className="space-y-3">
          {FAQS.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div
                key={idx}
                className="rounded-2xl border border-stone-200/80 bg-white/80 overflow-hidden transition-all"
              >
                <button
                  type="button"
                  onClick={() => toggleFaq(idx)}
                  className="w-full p-4 sm:p-5 flex items-center justify-between text-left font-bold text-base sm:text-lg text-white hover:bg-emerald-50/50 transition-colors"
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    className={`size-5 text-emerald-800 transition-transform ${
                      isOpen ? "rotate-180 text-white" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 sm:px-5 sm:pb-5 text-base text-stone-600 leading-relaxed border-t border-stone-200/60 pt-3 font-normal">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* FINAL CTA BANNER */}
      <section className="mx-auto max-w-6xl pb-12">
        <div className="rounded-3xl border border-stone-200/80 bg-gradient-to-br from-emerald-100/90 via-teal-50/70 to-amber-50/80 p-8 sm:p-12 text-center space-y-6 shadow-sm relative overflow-hidden">
          <div className="pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-emerald-800/10 blur-3xl" />
          <div className="relative z-10 max-w-2xl mx-auto space-y-4">
            <h2 className="font-display text-2xl sm:text-4xl font-bold text-stone-900 italic tracking-tight">
              Inizia subito a prenderti cura dei tuoi cari
            </h2>
            <p className="text-base sm:text-lg text-stone-600 leading-relaxed">
              Crea il tuo account gratuito in 30 secondi. Puoi passare a un piano superiore quando lo desideri.
            </p>
            <div className="pt-2 flex justify-center">
              <Button
                size="lg"
                asChild
                className="bg-emerald-800 text-white hover:bg-emerald-900 font-extrabold rounded-2xl px-8 py-3.5 text-base shadow-sm transition-all"
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
    </PublicPageShell>
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
      className={`relative flex flex-col justify-between rounded-3xl p-6 sm:p-7 transition-all backdrop-blur-sm ${
        highlighted
          ? "bg-gradient-to-b from-emerald-50/80 to-white border-2 border-emerald-700/80 shadow-sm ring-1 ring-emerald-700/15 md:-mt-3 md:pb-9"
          : "bg-white/80 border border-stone-200/80 shadow-sm"
      }`}
    >
      {highlighted && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-emerald-800 px-4 py-1 text-xs font-extrabold uppercase tracking-widest text-white shadow-sm">
          Più Popolare
        </div>
      )}

      <div>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-2xl sm:text-3xl font-bold text-stone-900 italic">{name}</h3>
          <span className="text-[10px] sm:text-xs uppercase font-bold tracking-wider px-3 py-1 rounded-full bg-emerald-800/10 text-emerald-800 border border-ocean-300/30">
            {badge}
          </span>
        </div>
        <p className="text-sm text-ocean-200 font-medium mt-2 min-h-[32px]">{tagline}</p>

        <div className="mt-5 mb-6">
          {price === 0 ? (
            <div className="font-display text-4xl sm:text-5xl font-bold text-stone-900">0 €</div>
          ) : (
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-4xl sm:text-5xl font-bold text-stone-900">
                  {formatPrice(price)}
                </span>
                <span className="text-sm text-ocean-200 font-medium">/mese</span>
              </div>
              {periodLabel && (
                <p className="text-xs sm:text-sm text-ocean-200 mt-1 font-medium">{periodLabel}</p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-3 border-t border-stone-200/80 pt-5">
          {features.map((f, i) => (
            <div key={i} className="flex items-start gap-2.5 text-sm sm:text-base">
              <Check className="size-4.5 text-emerald-800 shrink-0 mt-0.5" />
              <span className={f.highlight ? "font-semibold text-white" : "text-stone-600"}>
                {f.text}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 pt-4 border-t border-stone-200/80">
        <Button
          asChild
          className={`w-full font-extrabold rounded-2xl py-3.5 text-base transition-all ${
            highlighted
              ? "bg-emerald-800 text-white shadow-sm hover:bg-emerald-900"
              : "border border-stone-300/80 text-white hover:border-emerald-700/50 hover:bg-stone-50/80"
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
    <tr className="bg-stone-50/90">
      <td colSpan={4} className="p-3.5 px-4 font-bold text-xs uppercase tracking-widest text-ocean-300">
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
    <tr className="hover:bg-stone-50/80 transition-colors">
      <td className="p-4 font-medium text-white text-sm sm:text-base">{label}</td>
      <td className="p-4 text-center">{renderCell(free)}</td>
      <td className="p-4 text-center bg-ocean-300/5">{renderCell(pro)}</td>
      <td className="p-4 text-center">{renderCell(max)}</td>
    </tr>
  );
}

function renderCell(val: boolean | string) {
  if (typeof val === "boolean") {
    return val ? (
      <Check className="size-5 text-emerald-800 mx-auto" />
    ) : (
      <X className="size-5 text-ocean-600/50 mx-auto" />
    );
  }
  return <span className="font-semibold text-sm sm:text-base text-white">{val}</span>;
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
