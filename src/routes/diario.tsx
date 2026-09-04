import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { NotebookPen, Plus, Trash2, Pill, AlertTriangle, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { PatientShell } from "@/components/PatientShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useFamilyMed } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useFeatureToggles } from "@/lib/feature-toggles";
import { DisabledFeatureBanner } from "@/components/DisabledFeatureBanner";
import { getPlanLimits } from "@/lib/subscription";

export const Route = createFileRoute("/diario")({
  head: () => ({
    meta: [
      { title: "Diario del benessere e note sintomi — FamilyMed" },
      {
        name: "description",
        content:
          "Annota umore, sintomi ed episodi saltuari del paziente e correlali alle terapie per individuare possibili effetti collaterali.",
      },
      { property: "og:title", content: "Diario del benessere — FamilyMed" },
      {
        property: "og:description",
        content:
          "Note libere, emoji e sintomi correlati alle dose assunte: capisci se un farmaco sta dando effetti collaterali.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WellnessDiaryPage,
});

type NoteRow = {
  id: string;
  patient_id: string;
  occurred_at: string;
  mood: number | null;
  symptoms: string[] | null;
  severity: string | null;
  note: string | null;
  therapy_id: string | null;
  event_id: string | null;
  created_by: string | null;
};

type CorrelationRow = {
  therapy_id: string;
  therapy_name: string;
  doses_taken: number;
  notes_after: number;
  top_symptoms: string[] | null;
};

const NOTE_COLUMNS =
  "id,patient_id,occurred_at,mood,symptoms,severity,note,therapy_id,event_id,created_by";

const MOODS: { value: number; emoji: string; label: string }[] = [
  { value: 1, emoji: "😖", label: "Molto male" },
  { value: 2, emoji: "🙁", label: "Male" },
  { value: 3, emoji: "😐", label: "Così così" },
  { value: 4, emoji: "🙂", label: "Bene" },
  { value: 5, emoji: "😄", label: "Molto bene" },
];

const SYMPTOMS: { slug: string; label: string; emoji: string }[] = [
  { slug: "nausea", label: "Nausea", emoji: "🤢" },
  { slug: "vomito", label: "Vomito", emoji: "🤮" },
  { slug: "confusione", label: "Confusione", emoji: "🌀" },
  { slug: "sonnolenza", label: "Sonnolenza", emoji: "😴" },
  { slug: "insonnia", label: "Insonnia", emoji: "🌙" },
  { slug: "dolore", label: "Dolore", emoji: "⚡" },
  { slug: "vertigini", label: "Vertigini", emoji: "💫" },
  { slug: "agitazione", label: "Agitazione", emoji: "😣" },
  { slug: "inappetenza", label: "Inappetenza", emoji: "🍽️" },
  { slug: "diarrea", label: "Diarrea", emoji: "🚽" },
  { slug: "eruzione", label: "Eruzione cutanea", emoji: "🩹" },
  { slug: "affanno", label: "Affanno", emoji: "🌬️" },
];

const SYMPTOM_LABEL = new Map(SYMPTOMS.map((s) => [s.slug, s]));

const SEVERITIES = ["lieve", "moderata", "severa"] as const;

type PeriodKey = "7" | "30" | "90";
const PERIOD_LABELS: Record<PeriodKey, string> = {
  "7": "Ultimi 7 giorni",
  "30": "Ultimi 30 giorni",
  "90": "Ultimi 90 giorni",
};

// Cache per sessione: il diario non ha canale realtime, evitiamo query
// ripetute quando si torna sulla pagina (egress al minimo).
const NOTES_CACHE = new Map<string, { rows: NoteRow[]; fetchedAt: number }>();
const CACHE_TTL_MS = 2 * 60 * 1000;

function localInputNow() {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function WellnessDiaryPage() {
  const { data, user, userProfile } = useFamilyMed();
  const { toggles } = useFeatureToggles();
  const isPatient = userProfile?.role === "paziente";

  if (!isPatient && !toggles.diario) {
    return (
      <AppShell title="Diario del benessere" subtitle="Note libere e sintomi del paziente">
        <DisabledFeatureBanner featureName="Diario benessere" />
      </AppShell>
    );
  }

  const defaultPatient =
    (user && data.patients.find((p) => p.userId === user.id)) ??
    data.patients.find((p) => p.id === data.currentPatientId) ??
    data.patients[0];

  const [patientId, setPatientId] = useState<string | undefined>(defaultPatient?.id);
  useEffect(() => {
    if (!patientId && defaultPatient) setPatientId(defaultPatient.id);
  }, [defaultPatient, patientId]);

  const [rows, setRows] = useState<NoteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<PeriodKey>("30");
  const [correlation, setCorrelation] = useState<CorrelationRow[] | null>(null);
  const [loadingCorr, setLoadingCorr] = useState(false);

  // form
  const [mood, setMood] = useState<number | null>(null);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [severity, setSeverity] = useState<string>("none");
  const [therapyId, setTherapyId] = useState<string>("none");
  const [note, setNote] = useState("");
  const [occurredAt, setOccurredAt] = useState<string>(localInputNow);
  const [saving, setSaving] = useState(false);

  const currentPatient = data.patients.find((p) => p.id === patientId);
  const patientTherapies = useMemo(
    () => data.therapies.filter((t) => t.patientId === patientId),
    [data.therapies, patientId],
  );

  const fetchRows = async (opts?: { force?: boolean }) => {
    if (!patientId) return;
    const cached = NOTES_CACHE.get(patientId);
    if (!opts?.force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      setRows(cached.rows);
      return;
    }
    setLoading(true);
    let q = (supabase as any)
      .from("wellness_notes")
      .select(NOTE_COLUMNS)
      .eq("patient_id", patientId)
      .order("occurred_at", { ascending: false });

    if (limits.historyDaysLimit !== Infinity) {
      const since = new Date(Date.now() - limits.historyDaysLimit * 86400 * 1000).toISOString();
      q = q.gte("occurred_at", since);
    } else {
      q = q.limit(300);
    }

    const { data: res, error } = await q;
    setLoading(false);
    if (error) {
      toast.error("Impossibile caricare il diario", { description: error.message });
      return;
    }
    const next = (res ?? []) as NoteRow[];
    NOTES_CACHE.set(patientId, { rows: next, fetchedAt: Date.now() });
    setRows(next);
  };

  useEffect(() => {
    setCorrelation(null);
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const loadCorrelation = async () => {
    if (!patientId) return;
    setLoadingCorr(true);
    const { data: res, error } = await (supabase as any).rpc("wellness_symptom_correlation", {
      _patient_id: patientId,
      _days: parseInt(period, 10),
      _window_hours: 6,
    });
    setLoadingCorr(false);
    if (error) {
      toast.error("Correlazione non disponibile", { description: error.message });
      return;
    }
    setCorrelation((res ?? []) as CorrelationRow[]);
  };

  const toggleSymptom = (slug: string) =>
    setSymptoms((s) => (s.includes(slug) ? s.filter((x) => x !== slug) : [...s, slug]));

  const resetForm = () => {
    setMood(null);
    setSymptoms([]);
    setSeverity("none");
    setTherapyId("none");
    setNote("");
    setOccurredAt(localInputNow());
  };

  const submit = async () => {
    if (!patientId) return;
    if (mood == null && symptoms.length === 0 && !note.trim()) {
      toast.error("Aggiungi almeno umore, un sintomo o una nota");
      return;
    }
    setSaving(true);
    const { data: inserted, error } = await (supabase as any)
      .from("wellness_notes")
      .insert({
        patient_id: patientId,
        occurred_at: new Date(occurredAt).toISOString(),
        mood,
        symptoms,
        severity: severity === "none" ? null : severity,
        note: note.trim() || null,
        therapy_id: therapyId === "none" ? null : therapyId,
        created_by: user?.id ?? null,
      })
      .select(NOTE_COLUMNS)
      .single();
    setSaving(false);
    if (error) {
      toast.error("Errore nel salvataggio", { description: error.message });
      return;
    }
    toast.success("Nota registrata nel diario");
    resetForm();
    setRows((r) => {
      const next = [inserted as NoteRow, ...r].sort(
        (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
      );
      NOTES_CACHE.set(patientId, { rows: next, fetchedAt: Date.now() });
      return next;
    });
  };

  const remove = async (id: string) => {
    const { error } = await (supabase as any).from("wellness_notes").delete().eq("id", id);
    if (error) {
      toast.error("Impossibile eliminare", { description: error.message });
      return;
    }
    setRows((r) => {
      const next = r.filter((x) => x.id !== id);
      if (patientId) NOTES_CACHE.set(patientId, { rows: next, fetchedAt: Date.now() });
      return next;
    });
    toast.success("Nota eliminata");
  };

  const { subscriptionPlan } = useFamilyMed();
  const limits = getPlanLimits(subscriptionPlan);

  const fromTime = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - parseInt(period, 10) + 1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, [period]);

  const visible = useMemo(() => {
    let minTime = fromTime;
    if (limits.historyDaysLimit !== Infinity) {
      const maxHistoryStart = Date.now() - limits.historyDaysLimit * 86400 * 1000;
      minTime = Math.max(minTime, maxHistoryStart);
    }
    return rows.filter((r) => new Date(r.occurred_at).getTime() >= minTime);
  }, [rows, fromTime, limits.historyDaysLimit]);

  // Dosi assunte nelle 6 ore precedenti alla nota (dati già in memoria).
  const dosesBefore = (iso: string) => {
    const t = new Date(iso).getTime();
    return data.events
      .filter((e) => {
        if (e.patientId !== patientId || e.status !== "taken") return false;
        const at = new Date(e.confirmedAt ?? e.scheduledAt).getTime();
        return at <= t && t - at <= 6 * 60 * 60 * 1000;
      })
      .map((e) => ({
        at: e.confirmedAt ?? e.scheduledAt,
        name: data.therapies.find((th) => th.id === e.therapyId)?.name ?? "Terapia",
      }))
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 4);
  };

  const body = (
    <div className="space-y-6">
      {subscriptionPlan === "free" && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary shrink-0" />
            <span>Stai visualizzando gli ultimi 7 giorni (Piano Free). Passa a Pro o Max per vedere oltre 7 giorni.</span>
          </div>
          <Button size="sm" asChild className="rounded-xl shrink-0 font-bold">
            <Link to={"/abbonamento" as any}>Passa a Pro o Max</Link>
          </Button>
        </div>
      )}

      {!isPatient && data.patients.length > 0 && (
        <div className="rounded-2xl border bg-card p-4">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Paziente
          </Label>
          <Select value={patientId} onValueChange={setPatientId}>
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="Seleziona paziente" />
            </SelectTrigger>
            <SelectContent>
              {data.patients.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Nuova nota */}
      <section className="rounded-2xl border bg-card p-4 space-y-4">
        <div className="flex items-center gap-2">
          <NotebookPen className="size-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Nuova nota
          </h2>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Come stava?</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {MOODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMood(mood === m.value ? null : m.value)}
                className={cn(
                  "flex min-w-[68px] flex-col items-center rounded-xl border px-3 py-2 transition hover:shadow-lift",
                  mood === m.value ? "border-primary bg-primary/5 ring-2 ring-primary/30" : "bg-background",
                )}
                aria-pressed={mood === m.value}
              >
                <span className="text-xl" aria-hidden>
                  {m.emoji}
                </span>
                <span className="mt-1 text-[11px] text-muted-foreground">{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Sintomi rilevati</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {SYMPTOMS.map((s) => (
              <button
                key={s.slug}
                type="button"
                onClick={() => toggleSymptom(s.slug)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                  symptoms.includes(s.slug)
                    ? "border-primary bg-primary/10 text-primary"
                    : "bg-background text-muted-foreground hover:bg-muted",
                )}
                aria-pressed={symptoms.includes(s.slug)}
              >
                <span aria-hidden>{s.emoji}</span> {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label className="text-xs text-muted-foreground">Quando</Label>
            <Input
              type="datetime-local"
              className="mt-2"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Gravità percepita</Label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Non indicata" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Non indicata</SelectItem>
                {SEVERITIES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Collega a una terapia</Label>
            <Select value={therapyId} onValueChange={setTherapyId}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Nessuna" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nessuna</SelectItem>
                {patientTherapies.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Nota libera</Label>
          <Textarea
            className="mt-2"
            rows={3}
            placeholder="Es. Stamattina il nonno era particolarmente confuso. Nausea dopo la pillola delle 14:00."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <Button onClick={submit} disabled={!patientId || saving} className="w-full sm:w-auto">
          <Plus className="mr-2 size-4" />
          {saving ? "Salvo…" : "Aggiungi al diario"}
        </Button>
      </section>

      {/* Filtri + correlazione */}
      <section className="rounded-2xl border bg-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 sm:max-w-[220px]">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Periodo
            </Label>
            <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PERIOD_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => fetchRows({ force: true })}
              disabled={!patientId || loading}
            >
              <RefreshCw className="mr-2 size-4" />
              {loading ? "Aggiorno…" : "Aggiorna"}
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={loadCorrelation}
              disabled={!patientId || loadingCorr}
            >
              <AlertTriangle className="mr-2 size-4" />
              {loadingCorr ? "Calcolo…" : "Analizza effetti collaterali"}
            </Button>
          </div>
        </div>

        {correlation && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2">Terapia</th>
                  <th className="py-2">Dosi assunte</th>
                  <th className="py-2">Note entro 6h</th>
                  <th className="py-2">Sintomi ricorrenti</th>
                </tr>
              </thead>
              <tbody>
                {correlation.map((c) => (
                  <tr key={c.therapy_id} className="border-t">
                    <td className="py-2 font-medium">{c.therapy_name}</td>
                    <td className="py-2">{c.doses_taken}</td>
                    <td className="py-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-semibold",
                          c.notes_after > 0
                            ? "bg-destructive/10 text-destructive"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {c.notes_after}
                      </span>
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {(c.top_symptoms ?? []).length
                        ? (c.top_symptoms ?? [])
                            .map((s) => SYMPTOM_LABEL.get(s)?.label ?? s)
                            .join(", ")
                        : "—"}
                    </td>
                  </tr>
                ))}
                {correlation.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-3 text-muted-foreground">
                      Nessuna terapia da analizzare in questo periodo.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Le note registrate entro 6 ore da una dose assunta sono considerate
              potenzialmente correlate. È un indizio, non una diagnosi: parlane con il medico.
            </p>
          </div>
        )}
      </section>

      {/* Timeline note */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Diario ({visible.length})
        </h2>
        {visible.length === 0 && (
          <p className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
            Nessuna nota nel periodo selezionato.
          </p>
        )}
        {visible.map((n) => {
          const moodMeta = MOODS.find((m) => m.value === n.mood);
          const linked = n.therapy_id
            ? data.therapies.find((t) => t.id === n.therapy_id)?.name
            : undefined;
          const doses = dosesBefore(n.occurred_at);
          return (
            <article key={n.id} className="rounded-2xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl" aria-hidden>
                    {moodMeta?.emoji ?? "📝"}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">
                      {new Date(n.occurred_at).toLocaleString("it-IT", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {moodMeta ? moodMeta.label : "Nota"}
                      {n.severity ? ` · gravità ${n.severity}` : ""}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => remove(n.id)} aria-label="Elimina nota">
                  <Trash2 className="size-4" />
                </Button>
              </div>

              {(n.symptoms ?? []).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {(n.symptoms ?? []).map((s) => (
                    <span
                      key={s}
                      className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium"
                    >
                      {SYMPTOM_LABEL.get(s)?.emoji ?? "•"} {SYMPTOM_LABEL.get(s)?.label ?? s}
                    </span>
                  ))}
                </div>
              )}

              {n.note && <p className="mt-3 whitespace-pre-wrap text-sm">{n.note}</p>}

              {(linked || doses.length > 0) && (
                <div className="mt-3 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
                  {linked && (
                    <p className="flex items-center gap-1.5 font-medium text-foreground">
                      <Pill className="size-3.5" /> Collegata a {linked}
                    </p>
                  )}
                  {doses.length > 0 && (
                    <p className="mt-1">
                      Dosi assunte nelle 6h precedenti:{" "}
                      {doses
                        .map(
                          (d) =>
                            `${d.name} (${new Date(d.at).toLocaleTimeString("it-IT", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })})`,
                        )
                        .join(", ")}
                    </p>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );

  if (isPatient) {
    return (
      <PatientShell
        title="Diario del benessere"
        subtitle="Annota come ti senti e i sintomi che noti"
      >
        {body}
      </PatientShell>
    );
  }

  return (
    <AppShell
      title="Diario del benessere e note sintomi"
      subtitle={
        currentPatient
          ? `Umore, sintomi ed episodi di ${currentPatient.name}`
          : "Annota episodi e sintomi e correlali alle terapie"
      }
    >
      {body}
    </AppShell>
  );
}
