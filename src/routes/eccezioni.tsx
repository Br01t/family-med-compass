import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  Beaker,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Hospital,
  Info,
  ListChecks,
  Package,
  Pill,
  ShieldAlert,
  TriangleAlert,
  Wrench,
  ZapOff,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { SecondaryCaregiverNotice } from "@/components/SecondaryCaregiverNotice";
import { Button } from "@/components/ui/button";
import { useFamilyMed } from "@/lib/store";
import { adjustStockManually } from "@/lib/supabase-service";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/eccezioni")({
  head: () => ({
    meta: [
      { title: "Eccezioni & Imprevisti — FamilyMed" },
      {
        name: "description",
        content:
          "Gestisci situazioni fuori routine: farmaci persi, dosi doppie, sospensioni temporanee e cambi di prescrizione.",
      },
    ],
  }),
  component: ExceptionsPage,
});

/* ─── Guide ────────────────────────────────────────────────────────────── */

type GuideStep = { text: string; link?: { label: string; to: string } };
type Guide = {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  color: string;
  bgGradient: string;
  steps: GuideStep[];
  note?: string;
};

const GUIDES: Guide[] = [
  {
    id: "sospensione-temporanea",
    title: "Sospensione temporanea della terapia",
    subtitle: "Es. 5 giorni prima di un intervento chirurgico",
    icon: ZapOff,
    color: "text-orange-500",
    bgGradient: "from-orange-500/10 to-amber-500/5",
    steps: [
      { text: "Vai alla pagina Terapie", link: { label: "Apri Terapie →", to: "/terapie" } },
      { text: "Seleziona la terapia da sospendere" },
      { text: "Premi il pulsante 'Sospendi' (la terapia viene messa in pausa: niente promemoria, niente dosi nel calendario)" },
      { text: "Quando il periodo è finito, torna su Terapie e premi 'Riattiva'" },
    ],
    note: "Le dosi sospese non vengono conteggiate come dimenticate nell'aderenza.",
  },
  {
    id: "cambio-dosaggio",
    title: "Cambio dosaggio prescritto dal medico",
    subtitle: "Il medico ha modificato quantità o orari della terapia",
    icon: Beaker,
    color: "text-blue-500",
    bgGradient: "from-blue-500/10 to-cyan-500/5",
    steps: [
      { text: "Vai alla pagina Terapie", link: { label: "Apri Terapie →", to: "/terapie" } },
      { text: "Seleziona la terapia e scegli 'Modifica'" },
      { text: "Aggiorna la quantità per dose (campo Quantità) o gli orari di somministrazione" },
      { text: "Salva le modifiche: il calendario si aggiorna automaticamente dal giorno successivo" },
    ],
    note: "Se il medico ha cambiato il farmaco completamente, crea una nuova terapia e disattiva quella vecchia.",
  },
  {
    id: "interruzione-definitiva",
    title: "Interruzione definitiva della terapia",
    subtitle: "Il medico ha deciso di interrompere il farmaco",
    icon: TriangleAlert,
    color: "text-red-500",
    bgGradient: "from-red-500/10 to-rose-500/5",
    steps: [
      { text: "Vai alla pagina Terapie", link: { label: "Apri Terapie →", to: "/terapie" } },
      { text: "Seleziona la terapia e scegli 'Disattiva'" },
      { text: "La terapia viene archiviata: nessun promemoria futuro, ma lo storico rimane consultabile" },
    ],
    note: "Se si tratta di una sospensione temporanea, usa invece il pulsante 'Sospendi'.",
  },
  {
    id: "farmaco-esaurito",
    title: "Farmaco esaurito prima del previsto",
    subtitle: "La confezione è finita in anticipo e ne serve una nuova",
    icon: Package,
    color: "text-amber-500",
    bgGradient: "from-amber-500/10 to-yellow-500/5",
    steps: [
      { text: "Acquista o ritira la nuova confezione in farmacia" },
      { text: "Vai alla pagina Scorte", link: { label: "Apri Scorte →", to: "/scorte" } },
      { text: "Premi '+1 confezione' sulla terapia corrispondente: le scorte si aggiornano automaticamente" },
    ],
    note: "Se il farmaco è stato esaurito anche dalla scorta digitale (per cause impreviste), usa la sezione 'Scala scorte' qui sopra.",
  },
  {
    id: "paziente-ricoverato",
    title: "Paziente ricoverato in ospedale",
    subtitle: "Tutte le terapie vanno sospese per il periodo di degenza",
    icon: Hospital,
    color: "text-blue-600",
    bgGradient: "from-blue-600/10 to-indigo-500/5",
    steps: [
      { text: "Vai alla pagina Terapie", link: { label: "Apri Terapie →", to: "/terapie" } },
      { text: "Per ogni terapia attiva, premi 'Sospendi' — in ospedale la somministrazione è gestita dai medici" },
      { text: "Usa la sezione 'Scala scorte' (qui sopra) per le dosi somministrate dall'ospedale, se vuoi mantenere il conteggio aggiornato" },
      { text: "Alla dimissione, vai su Terapie e riattiva tutte le terapie una per una" },
    ],
    note: "Le dosi sospese non impattano negativamente il punteggio di aderenza.",
  },
  {
    id: "farmaco-equivalente",
    title: "Sostituzione temporanea con farmaco equivalente",
    subtitle: "Il medico prescrive un generico sostitutivo per un periodo",
    icon: Pill,
    color: "text-purple-500",
    bgGradient: "from-purple-500/10 to-violet-500/5",
    steps: [
      { text: "Sospendi temporaneamente la terapia originale (vedi sezione 'Sospensione' sopra)" },
      {
        text: "Crea una nuova terapia con il farmaco sostitutivo (stesso dosaggio, stessi orari)",
        link: { label: "Apri Terapie →", to: "/terapie" },
      },
      { text: "Quando la sostituzione è terminata: disattiva la terapia sostitutiva e riattiva l'originale" },
    ],
    note: "Tenere le due terapie separate permette di avere lo storico completo sia del farmaco originale sia del sostitutivo.",
  },
];

/* ─── Componente accordeon guide ──────────────────────────────────────── */

function GuideCard({ guide }: { guide: Guide }) {
  const [open, setOpen] = useState(false);
  const Icon = guide.icon;

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/60 overflow-hidden transition-all duration-200",
        open && "shadow-md",
      )}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full flex items-start gap-4 px-5 py-4 text-left transition-colors",
          `bg-gradient-to-r ${guide.bgGradient}`,
          "hover:brightness-95 dark:hover:brightness-110",
        )}
        aria-expanded={open}
      >
        <div className={cn("mt-0.5 flex-shrink-0 rounded-xl p-2 bg-background/70", guide.color)}>
          <Icon className="size-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground">{guide.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{guide.subtitle}</p>
        </div>
        <div className={cn("mt-1 flex-shrink-0 transition-transform duration-200", open && "rotate-90")}>
          <ChevronRight className="size-4 text-muted-foreground" />
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 pt-3 space-y-3 bg-background/60 border-t border-border/40">
          <ol className="space-y-3">
            {guide.steps.map((step, i) => (
              <li key={i} className="flex gap-3 items-start">
                <span className="flex-shrink-0 mt-0.5 size-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <div className="flex-1 text-sm text-foreground leading-relaxed">
                  {step.text}
                  {step.link && (
                    <Link
                      to={step.link.to}
                      className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                    >
                      {step.link.label} <ArrowRight className="size-3" />
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {guide.note && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-xl px-3 py-2 border border-border/40">
              💡 {guide.note}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Pagina principale ────────────────────────────────────────────────── */

function ExceptionsPage() {
  const { data, updateTherapy, isPrimaryCaregiverOf, isSecondaryCaregiverOf } = useFamilyMed();

  const patients = data.patients;
  const [selectedPatientId, setSelectedPatientId] = useState(patients[0]?.id ?? "");
  const [selectedTherapyId, setSelectedTherapyId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [lastSuccess, setLastSuccess] = useState<{
    therapyName: string;
    delta: number;
    newValue: number;
  } | null>(null);

  const patient = patients.find((p) => p.id === selectedPatientId);
  const canManage = patient ? isPrimaryCaregiverOf(patient.id) : false;
  const hasSecondaryRole = patients.some((p) => isSecondaryCaregiverOf(p.id));

  const activeTherapies = useMemo(
    () => data.therapies.filter((t) => t.patientId === selectedPatientId && t.active),
    [data.therapies, selectedPatientId],
  );

  const selectedTherapy = activeTherapies.find((t) => t.id === selectedTherapyId);

  const handlePatientChange = (patientId: string) => {
    setSelectedPatientId(patientId);
    setSelectedTherapyId("");
    setLastSuccess(null);
  };

  const handleAdjust = async () => {
    if (!selectedTherapy || quantity <= 0) {
      toast.error("Seleziona una terapia e una quantità valida");
      return;
    }
    setLoading(true);
    setLastSuccess(null);
    try {
      const { newPillsRemaining } = await adjustStockManually(
        selectedTherapyId,
        quantity,
        "manual_loss",
      );
      // Sincronizza lo stato locale nel store
      await updateTherapy(selectedTherapyId, { pillsRemaining: newPillsRemaining });
      setLastSuccess({
        therapyName: selectedTherapy.name,
        delta: quantity,
        newValue: newPillsRemaining,
      });
      toast.success("Scorte aggiornate", {
        description: `${selectedTherapy.name}: −${quantity} dose${quantity > 1 ? "i" : "e"} → residue: ${newPillsRemaining}`,
      });
      setQuantity(1);
    } catch (err: any) {
      const msg =
        err?.message?.toLowerCase().includes("row-level") || err?.code === "42501"
          ? "Non hai i permessi per modificare le scorte di questo paziente."
          : "Si è verificato un errore. Riprova.";
      toast.error("Errore aggiornamento scorte", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell
      title="Eccezioni & Imprevisti"
      subtitle="Gestisci situazioni fuori routine: scorte, sospensioni, cambi terapia"
    >
      <div className="space-y-10">

        {/* ── Banner intro ──────────────────────────────────────────────── */}
        <div className="flex items-start gap-4 rounded-2xl border border-border/60 bg-gradient-to-r from-primary/5 to-accent/5 px-5 py-4">
          <ShieldAlert className="mt-0.5 size-6 flex-shrink-0 text-primary" />
          <div>
            <p className="font-semibold text-sm text-foreground">Gestione situazioni impreviste</p>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              Questa pagina serve per due cose diverse: <strong className="text-foreground">scalare le scorte a mano</strong>{" "}
              quando delle dosi vanno perse fuori dalla routine normale (sezione qui sotto), oppure{" "}
              <strong className="text-foreground">seguire una guida passo-passo</strong> per sospensioni, cambi
              dosaggio, ricoveri e sostituzioni di farmaco (sezione più in basso).
            </p>
          </div>
        </div>

        {/* ── Avviso caregiver secondario ───────────────────────────────── */}
        {hasSecondaryRole && <SecondaryCaregiverNotice context="scorte" />}

        {/* ════════════════════════════════════════════════════════════════
            SEZIONE 1 — SCALA SCORTE MANUALMENTE
        ════════════════════════════════════════════════════════════════ */}
        <section aria-labelledby="adjust-heading" className="space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-warning/15">
              <Wrench className="size-5 text-warning" />
            </div>
            <div>
              <h2 id="adjust-heading" className="text-base font-bold tracking-tight text-foreground">
                Scala scorte manualmente
              </h2>
              <p className="text-xs text-muted-foreground">Riduci le scorte per cause non legate a una presa regolare</p>
            </div>
          </div>

          {/* Spiegazione: come e perché usare questa funzione */}
          <div className="rounded-2xl border border-border/60 bg-muted/30 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Info className="size-4 text-primary flex-shrink-0" />
              <p className="text-sm font-semibold text-foreground">Perché usarla</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Usa questa funzione ogni volta che la quantità reale di farmaco disponibile è diversa da quella
              registrata nell'app, per una causa <strong className="text-foreground">non legata a una presa regolare</strong>:
              una compressa o fiala rotta o caduta, una dose doppia presa per errore, un farmaco scaduto o
              deteriorato da eliminare, una degenza in ospedale dove le dosi vengono gestite dal personale sanitario,
              o qualsiasi altra perdita imprevista.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <ListChecks className="size-4 text-primary flex-shrink-0" />
              <p className="text-sm font-semibold text-foreground">Come funziona</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Seleziona il paziente, la terapia interessata e la quantità di dosi/compresse da togliere dalla
              scorta, poi premi <strong className="text-foreground">"Scala scorte"</strong>. Le dosi indicate vengono{" "}
              <strong className="text-foreground">sottratte subito dalla scorta residua</strong> della terapia, esattamente
              come se fossero state consumate — ma{" "}
              <strong className="text-foreground">senza registrare una presa</strong>: il calendario, i promemoria e
              il punteggio di aderenza del paziente non vengono toccati. Se le scorte scendono sotto la soglia
              minima, riceverai comunque l'allerta automatica come di consueto.
            </p>
          </div>

          <div className="rounded-2xl border border-border/60 bg-surface/60 p-5 space-y-5">

            {/* Selettore paziente */}
            {patients.length > 1 && (
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Paziente
                </label>
                <div className="flex flex-wrap gap-2">
                  {patients.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handlePatientChange(p.id)}
                      className={cn(
                        "rounded-xl px-3 py-1.5 text-sm font-medium border transition-all",
                        selectedPatientId === p.id
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border text-foreground hover:border-primary/40",
                      )}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Selettore terapia */}
            <div className="space-y-2">
              <label
                htmlFor="therapy-select"
                className="text-xs font-semibold uppercase tracking-widest text-muted-foreground"
              >
                Farmaco / Terapia
              </label>
              {activeTherapies.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  Nessuna terapia attiva per questo paziente.
                </p>
              ) : (
                <div className="relative">
                  <select
                    id="therapy-select"
                    value={selectedTherapyId}
                    onChange={(e) => {
                      setSelectedTherapyId(e.target.value);
                      setLastSuccess(null);
                    }}
                    className="w-full appearance-none rounded-xl border border-border bg-background px-4 py-3 pr-10 text-sm text-foreground shadow-sm transition focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">— Seleziona un farmaco —</option>
                    {activeTherapies.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                        {t.dosage ? ` — ${t.dosage}` : ""}
                        {" "}(scorte: {t.pillsRemaining})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              )}
            </div>

            {/* Quantità */}
            <div className="space-y-2">
              <label
                htmlFor="quantity-input"
                className="text-xs font-semibold uppercase tracking-widest text-muted-foreground"
              >
                Quantità da scalare (dosi/compresse)
              </label>
              <div className="flex items-center gap-3">
                <button
                  id="qty-decrease"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="flex size-10 items-center justify-center rounded-xl border border-border bg-background text-lg font-bold text-foreground hover:bg-muted transition-colors"
                  aria-label="Riduci quantità"
                >
                  −
                </button>
                <input
                  id="quantity-input"
                  type="number"
                  min={1}
                  max={selectedTherapy?.pillsRemaining ?? 999}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-20 rounded-xl border border-border bg-background px-3 py-2 text-center text-lg font-bold text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  id="qty-increase"
                  onClick={() =>
                    setQuantity((q) =>
                      Math.min(q + 1, selectedTherapy?.pillsRemaining ?? 999),
                    )
                  }
                  className="flex size-10 items-center justify-center rounded-xl border border-border bg-background text-lg font-bold text-foreground hover:bg-muted transition-colors"
                  aria-label="Aumenta quantità"
                >
                  +
                </button>
                {selectedTherapy && (
                  <span className="text-xs text-muted-foreground">
                    di {selectedTherapy.pillsRemaining} disponibili
                  </span>
                )}
              </div>
            </div>

            {/* Preview operazione */}
            {selectedTherapy && (
              <div className="flex items-center gap-3 rounded-xl bg-muted/40 px-4 py-3 text-sm border border-border/50">
                <AlertTriangle className="size-4 flex-shrink-0 text-warning" />
                <span className="text-foreground">
                  <strong>{selectedTherapy.name}</strong>:{" "}
                  {selectedTherapy.pillsRemaining} → {Math.max(0, selectedTherapy.pillsRemaining - quantity)} dosi residue
                  {selectedTherapy.pillsRemaining - quantity < 0 && (
                    <span className="ml-1 text-xs text-destructive font-semibold">(scorte azzerabili, il minimo è 0)</span>
                  )}
                </span>
              </div>
            )}

            {/* Feedback successo */}
            {lastSuccess && (
              <div className="flex items-center gap-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-4 py-3">
                <CheckCircle2 className="size-5 flex-shrink-0 text-emerald-600" />
                <p className="text-sm text-emerald-700 dark:text-emerald-300">
                  <strong>{lastSuccess.therapyName}</strong>: −{lastSuccess.delta} dosi registrate.
                  Scorte residue: <strong>{lastSuccess.newValue}</strong>
                </p>
              </div>
            )}

            {/* CTA */}
            {!canManage && patient ? (
              <p className="text-xs text-muted-foreground italic">
                Solo il caregiver primario di <strong>{patient.name}</strong> può modificare le scorte.
              </p>
            ) : (
              <Button
                id="btn-adjust-stock"
                onClick={handleAdjust}
                disabled={loading || !selectedTherapyId || quantity <= 0 || !canManage}
                className="w-full gap-2 rounded-xl"
                size="lg"
              >
                <Wrench className={cn("size-4", loading && "animate-spin")} />
                {loading ? "Aggiornamento in corso…" : "Scala scorte"}
              </Button>
            )}
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════
            SEZIONE 2 — GUIDE PRATICHE
        ════════════════════════════════════════════════════════════════ */}
        <section aria-labelledby="guides-heading" className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10">
              <Clock className="size-5 text-primary" />
            </div>
            <div>
              <h2 id="guides-heading" className="text-base font-bold tracking-tight text-foreground">
                Come gestire le altre eccezioni
              </h2>
              <p className="text-xs text-muted-foreground">
                Sospensioni, cambi dosaggio, ricoveri e farmaci equivalenti — guide passo-passo
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {GUIDES.map((guide) => (
              <GuideCard key={guide.id} guide={guide} />
            ))}
          </div>
        </section>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-border/40 bg-muted/20 px-5 py-4 text-center">
          <p className="text-xs text-muted-foreground">
            Per modifiche strutturali alle terapie usa{" "}
            <Link to="/terapie" className="font-semibold text-primary hover:underline">
              Terapie
            </Link>
            . Per aggiornare le scorte usa{" "}
            <Link to="/scorte" className="font-semibold text-primary hover:underline">
              Scorte
            </Link>
            .
          </p>
        </div>
      </div>
    </AppShell>
  );
}