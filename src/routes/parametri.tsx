import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, Droplet, HeartPulse, Scale, Trash2, Plus, Wind, FileDown } from "lucide-react";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

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
import {
  downloadVitalSignsPdf,
  movingAverage,
  type VitalKind,
  type VitalRow,
} from "@/lib/vital-signs-report";

export const Route = createFileRoute("/parametri")({
  head: () => ({
    meta: [
      { title: "Parametri vitali — FamilyMed" },
      {
        name: "description",
        content:
          "Diario della salute: registra pressione, glicemia, peso e saturazione e monitora l'andamento nel tempo.",
      },
      { property: "og:title", content: "Parametri vitali — FamilyMed" },
      {
        property: "og:description",
        content: "Traccia i parametri vitali del paziente e osserva i trend a colpo d'occhio.",
      },
    ],
  }),
  component: VitalSignsPage,
});

type Kind = VitalKind;

const KINDS: Record<
  Kind,
  { label: string; unit: string; icon: typeof HeartPulse; color: string; description: string }
> = {
  blood_pressure: {
    label: "Pressione arteriosa",
    unit: "mmHg",
    icon: HeartPulse,
    color: "#ef4444",
    description: "Sistolica / Diastolica in mmHg, opzionale battito.",
  },
  glycemia: {
    label: "Glicemia",
    unit: "mg/dL",
    icon: Droplet,
    color: "#f59e0b",
    description: "Valore glicemico capillare in mg/dL.",
  },
  weight: {
    label: "Peso",
    unit: "kg",
    icon: Scale,
    color: "#0ea5e9",
    description: "Peso corporeo in chilogrammi.",
  },
  saturation: {
    label: "Saturazione (SpO₂)",
    unit: "%",
    icon: Wind,
    color: "#10b981",
    description: "Ossigenazione del sangue in percentuale.",
  },
};

type PeriodKey = "7" | "30" | "90" | "all";

const PERIOD_LABELS: Record<PeriodKey, string> = {
  "7": "Ultimi 7 giorni",
  "30": "Ultimi 30 giorni",
  "90": "Ultimi 90 giorni",
  all: "Tutto lo storico",
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function VitalSignsPage() {
  const { data, user, userProfile } = useFamilyMed();
  const isPatient = userProfile?.role === "paziente";

  const defaultPatient =
    (user && data.patients.find((p) => p.userId === user.id)) ??
    data.patients.find((p) => p.id === data.currentPatientId) ??
    data.patients[0];

  const [patientId, setPatientId] = useState<string | undefined>(defaultPatient?.id);
  useEffect(() => {
    if (!patientId && defaultPatient) setPatientId(defaultPatient.id);
  }, [defaultPatient, patientId]);

  const [kind, setKind] = useState<Kind>("blood_pressure");
  const [period, setPeriod] = useState<PeriodKey>("30");
  const [rows, setRows] = useState<VitalRow[]>([]);
  const [loading, setLoading] = useState(false);

  // form
  const [v1, setV1] = useState("");
  const [v2, setV2] = useState("");
  const [pulse, setPulse] = useState("");
  const [note, setNote] = useState("");
  const [measuredAt, setMeasuredAt] = useState<string>(() =>
    new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16),
  );
  const [saving, setSaving] = useState(false);

  const currentPatient = data.patients.find((p) => p.id === patientId);

  const fetchRows = async () => {
    if (!patientId) return;
    setLoading(true);
    const { data: res, error } = await (supabase as any)
      .from("vital_signs")
      .select("*")
      .eq("patient_id", patientId)
      .order("measured_at", { ascending: false })
      .limit(500);
    setLoading(false);
    if (error) {
      toast.error("Impossibile caricare le misurazioni", { description: error.message });
      return;
    }
    setRows(((res ?? []) as unknown) as VitalRow[]);
  };

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const resetForm = () => {
    setV1("");
    setV2("");
    setPulse("");
    setNote("");
    setMeasuredAt(
      new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16),
    );
  };

  const submit = async () => {
    if (!patientId) return;
    const primary = parseFloat(v1.replace(",", "."));
    if (!Number.isFinite(primary)) {
      toast.error("Inserisci un valore valido");
      return;
    }
    const secondary =
      kind === "blood_pressure" ? parseFloat(v2.replace(",", ".")) : undefined;
    if (kind === "blood_pressure" && !Number.isFinite(secondary as number)) {
      toast.error("Inserisci la diastolica");
      return;
    }
    const pulseNum = pulse ? parseInt(pulse, 10) : undefined;

    setSaving(true);
    const { error } = await (supabase as any).from("vital_signs").insert({
      patient_id: patientId,
      kind,
      value_primary: primary,
      value_secondary: secondary ?? null,
      pulse: Number.isFinite(pulseNum as number) ? pulseNum : null,
      unit: KINDS[kind].unit,
      measured_at: new Date(measuredAt).toISOString(),
      notes: note.trim() || null,
      created_by: user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      toast.error("Errore nel salvataggio", { description: error.message });
      return;
    }
    toast.success("Misurazione registrata");
    resetForm();
    fetchRows();
  };

  const remove = async (id: string) => {
    const { error } = await (supabase as any).from("vital_signs").delete().eq("id", id);
    if (error) {
      toast.error("Impossibile eliminare", { description: error.message });
      return;
    }
    toast.success("Misurazione eliminata");
    setRows((r) => r.filter((x) => x.id !== id));
  };

  // Range temporale in base al periodo
  const { fromDate, toDate } = useMemo(() => {
    const to = new Date();
    if (period === "all") {
      const oldest = rows.length
        ? new Date(rows[rows.length - 1].measured_at)
        : new Date(to.getFullYear(), to.getMonth() - 3, to.getDate());
      return { fromDate: startOfDay(oldest), toDate: to };
    }
    const days = parseInt(period, 10);
    const from = new Date();
    from.setDate(from.getDate() - days + 1);
    return { fromDate: startOfDay(from), toDate: to };
  }, [period, rows]);

  const inPeriod = useMemo(
    () =>
      rows.filter((r) => {
        const t = new Date(r.measured_at).getTime();
        return t >= fromDate.getTime() && t <= toDate.getTime();
      }),
    [rows, fromDate, toDate],
  );

  const filtered = useMemo(
    () => inPeriod.filter((r) => r.kind === kind),
    [inPeriod, kind],
  );

  // Aggregazione giornaliera (media del giorno) per grafico + media mobile 7gg
  const chartData = useMemo(() => {
    if (!filtered.length) return [] as Array<{
      t: string;
      v?: number;
      v2?: number;
      ma?: number | null;
      ma2?: number | null;
    }>;
    // raggruppa per giorno YYYY-MM-DD
    const byDay = new Map<string, { sum1: number; sum2: number; n1: number; n2: number }>();
    for (const r of filtered) {
      const d = new Date(r.measured_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const b = byDay.get(key) ?? { sum1: 0, sum2: 0, n1: 0, n2: 0 };
      b.sum1 += Number(r.value_primary);
      b.n1 += 1;
      if (r.value_secondary != null) {
        b.sum2 += Number(r.value_secondary);
        b.n2 += 1;
      }
      byDay.set(key, b);
    }
    const keys = [...byDay.keys()].sort();
    const values1 = keys.map((k) => {
      const b = byDay.get(k)!;
      return b.n1 ? b.sum1 / b.n1 : null;
    });
    const values2 = keys.map((k) => {
      const b = byDay.get(k)!;
      return b.n2 ? b.sum2 / b.n2 : null;
    });
    const window = period === "7" ? 3 : 7;
    const ma1 = movingAverage(values1, window);
    const ma2 = movingAverage(values2, window);
    return keys.map((k, i) => {
      const d = new Date(k);
      return {
        t: d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }),
        v: values1[i] != null ? Number(values1[i]!.toFixed(1)) : undefined,
        v2: values2[i] != null ? Number(values2[i]!.toFixed(1)) : undefined,
        ma: ma1[i] != null ? Number(ma1[i]!.toFixed(1)) : null,
        ma2: ma2[i] != null ? Number(ma2[i]!.toFixed(1)) : null,
      };
    });
  }, [filtered, period]);

  const latestByKind = useMemo(() => {
    const map: Partial<Record<Kind, VitalRow>> = {};
    for (const r of rows) {
      if (!map[r.kind]) map[r.kind] = r;
    }
    return map;
  }, [rows]);

  // Trend settimanale (variazione media ultima settimana vs precedente, filtrato per periodo)
  const trend = useMemo(() => {
    if (filtered.length < 2) return null;
    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const lastWeek: number[] = [];
    const prevWeek: number[] = [];
    for (const r of filtered) {
      const age = now - new Date(r.measured_at).getTime();
      const v = Number(r.value_primary);
      if (age <= weekMs) lastWeek.push(v);
      else if (age <= 2 * weekMs) prevWeek.push(v);
    }
    if (!lastWeek.length || !prevWeek.length) return null;
    const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
    const cur = avg(lastWeek);
    const prev = avg(prevWeek);
    const delta = cur - prev;
    const pct = (delta / prev) * 100;
    return { cur, prev, delta, pct };
  }, [filtered]);

  const exportPdf = () => {
    if (!currentPatient) return;
    if (inPeriod.length === 0) {
      toast.error("Nessuna misurazione nel periodo selezionato");
      return;
    }
    downloadVitalSignsPdf(currentPatient, rows, {
      from: fromDate,
      to: toDate,
      kinds: [kind],
    });
    toast.success("Report PDF generato");
  };

  const exportAllPdf = () => {
    if (!currentPatient) return;
    if (inPeriod.length === 0) {
      toast.error("Nessuna misurazione nel periodo selezionato");
      return;
    }
    downloadVitalSignsPdf(currentPatient, rows, {
      from: fromDate,
      to: toDate,
      kinds: ["blood_pressure", "glycemia", "weight", "saturation"],
    });
    toast.success("Report PDF generato");
  };

  const body = (
    <div className="space-y-6">
      {/* Selettore paziente (solo caregiver con più pazienti) */}
      {!isPatient && data.patients.length > 1 && (
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

      {/* Riepilogo ultimi valori */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(Object.keys(KINDS) as Kind[]).map((k) => {
          const meta = KINDS[k];
          const Icon = meta.icon;
          const last = latestByKind[k];
          const active = k === kind;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                "rounded-2xl border p-4 text-left transition hover:shadow-lift",
                active ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "bg-card",
              )}
            >
              <div className="flex items-center gap-2">
                <Icon className="size-4" style={{ color: meta.color }} />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {meta.label}
                </span>
              </div>
              <div className="mt-2 text-2xl font-black tracking-tight">
                {last
                  ? k === "blood_pressure"
                    ? `${last.value_primary}/${last.value_secondary}`
                    : `${last.value_primary}`
                  : "—"}
                <span className="ml-1 text-xs font-medium text-muted-foreground">
                  {last ? meta.unit : ""}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {last
                  ? new Date(last.measured_at).toLocaleString("it-IT", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Nessun dato"}
              </p>
            </button>
          );
        })}
      </div>

      {/* Filtri + Export */}
      <section className="rounded-2xl border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px] flex-1">
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
          <div className="min-w-[180px] flex-1">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Tipo parametro
            </Label>
            <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(KINDS) as Kind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {KINDS[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportPdf} disabled={!currentPatient}>
              <FileDown className="mr-2 size-4" />
              PDF ({KINDS[kind].label})
            </Button>
            <Button onClick={exportAllPdf} disabled={!currentPatient}>
              <FileDown className="mr-2 size-4" />
              PDF completo
            </Button>
          </div>
        </div>
        {trend && (
          <p className="mt-3 text-xs text-muted-foreground">
            Trend settimanale ({KINDS[kind].label}):{" "}
            <span
              className={cn(
                "font-semibold",
                trend.delta > 0 ? "text-orange-600" : trend.delta < 0 ? "text-emerald-600" : "",
              )}
            >
              {trend.delta > 0 ? "▲" : trend.delta < 0 ? "▼" : "→"}{" "}
              {Math.abs(trend.delta).toFixed(1)} {KINDS[kind].unit} ({trend.pct >= 0 ? "+" : ""}
              {trend.pct.toFixed(1)}%)
            </span>{" "}
            rispetto alla settimana precedente.
          </p>
        )}
      </section>

      {/* Form inserimento */}
      <section className="rounded-2xl border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Plus className="size-4 text-primary" />
          <h2 className="text-base font-bold">Nuova misurazione — {KINDS[kind].label}</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">{KINDS[kind].description}</p>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {kind === "blood_pressure" ? (
            <>
              <div>
                <Label>Sistolica (mmHg)</Label>
                <Input
                  inputMode="numeric"
                  value={v1}
                  onChange={(e) => setV1(e.target.value)}
                  placeholder="120"
                />
              </div>
              <div>
                <Label>Diastolica (mmHg)</Label>
                <Input
                  inputMode="numeric"
                  value={v2}
                  onChange={(e) => setV2(e.target.value)}
                  placeholder="80"
                />
              </div>
              <div>
                <Label>Battito (bpm) — opzionale</Label>
                <Input
                  inputMode="numeric"
                  value={pulse}
                  onChange={(e) => setPulse(e.target.value)}
                  placeholder="72"
                />
              </div>
            </>
          ) : (
            <div>
              <Label>Valore ({KINDS[kind].unit})</Label>
              <Input
                inputMode="decimal"
                value={v1}
                onChange={(e) => setV1(e.target.value)}
                placeholder={
                  kind === "glycemia" ? "110" : kind === "weight" ? "72.5" : "98"
                }
              />
            </div>
          )}

          <div>
            <Label>Data e ora</Label>
            <Input
              type="datetime-local"
              value={measuredAt}
              onChange={(e) => setMeasuredAt(e.target.value)}
            />
          </div>

          <div className="md:col-span-2">
            <Label>Note — opzionale</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Es. a digiuno, dopo camminata, ecc."
              rows={2}
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button onClick={submit} disabled={saving || !patientId}>
            {saving ? "Salvataggio…" : "Registra misurazione"}
          </Button>
        </div>
      </section>

      {/* Grafico con media mobile */}
      <section className="rounded-2xl border bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Activity className="size-4 text-primary" />
          <h2 className="text-base font-bold">
            Andamento — {PERIOD_LABELS[period].toLowerCase()}
          </h2>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Media giornaliera con media mobile a {period === "7" ? "3" : "7"} giorni per
          evidenziare il trend.
        </p>
        {chartData.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nessuna misurazione registrata per {KINDS[kind].label.toLowerCase()} nel periodo.
          </p>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="t" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={KINDS[kind].color}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name={kind === "blood_pressure" ? "Sistolica" : KINDS[kind].label}
                />
                <Line
                  type="monotone"
                  dataKey="ma"
                  stroke={KINDS[kind].color}
                  strokeDasharray="5 4"
                  strokeWidth={2}
                  dot={false}
                  name={kind === "blood_pressure" ? "Media mobile sist." : "Media mobile"}
                />
                {kind === "blood_pressure" && (
                  <>
                    <Line
                      type="monotone"
                      dataKey="v2"
                      stroke="#6366f1"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      name="Diastolica"
                    />
                    <Line
                      type="monotone"
                      dataKey="ma2"
                      stroke="#6366f1"
                      strokeDasharray="5 4"
                      strokeWidth={2}
                      dot={false}
                      name="Media mobile diast."
                    />
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Storico */}
      <section className="rounded-2xl border bg-card p-5">
        <h2 className="mb-3 text-base font-bold">
          Storico misurazioni — {PERIOD_LABELS[period].toLowerCase()}
        </h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Caricamento…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessuna misurazione nel periodo.</p>
        ) : (
          <ul className="divide-y">
            {filtered.map((r) => {
              const canDelete = r.created_by === user?.id || !isPatient;
              return (
                <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {kind === "blood_pressure"
                        ? `${r.value_primary}/${r.value_secondary} ${r.unit ?? ""}`
                        : `${r.value_primary} ${r.unit ?? ""}`}
                      {r.pulse != null && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          ♥ {r.pulse} bpm
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(r.measured_at).toLocaleString("it-IT")}
                      {r.notes ? ` · ${r.notes}` : ""}
                    </p>
                  </div>
                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(r.id)}
                      aria-label="Elimina"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );

  if (isPatient) {
    return (
      <PatientShell
        title="Parametri vitali"
        subtitle={currentPatient ? `Diario di ${currentPatient.name}` : "Diario della salute"}
      >
        {body}
      </PatientShell>
    );
  }

  return (
    <AppShell
      title="Parametri vitali"
      subtitle={
        currentPatient
          ? `Diario di ${currentPatient.name}`
          : "Registra e monitora i parametri dei pazienti"
      }
    >
      {body}
    </AppShell>
  );
}
