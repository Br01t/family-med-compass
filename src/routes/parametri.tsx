import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, Droplet, HeartPulse, Scale, Trash2, Plus, Wind } from "lucide-react";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
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

type Kind = "blood_pressure" | "glycemia" | "weight" | "saturation";

type VitalRow = {
  id: string;
  patient_id: string;
  kind: Kind;
  value_primary: number;
  value_secondary: number | null;
  pulse: number | null;
  unit: string | null;
  measured_at: string;
  notes: string | null;
  created_by: string | null;
};

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
    const { data: res, error } = await supabase
      .from("vital_signs")
      .select("*")
      .eq("patient_id", patientId)
      .order("measured_at", { ascending: false })
      .limit(200);
    setLoading(false);
    if (error) {
      toast.error("Impossibile caricare le misurazioni", { description: error.message });
      return;
    }
    setRows((res ?? []) as VitalRow[]);
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
    const { error } = await supabase.from("vital_signs").insert({
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
    const { error } = await supabase.from("vital_signs").delete().eq("id", id);
    if (error) {
      toast.error("Impossibile eliminare", { description: error.message });
      return;
    }
    toast.success("Misurazione eliminata");
    setRows((r) => r.filter((x) => x.id !== id));
  };

  const filtered = useMemo(() => rows.filter((r) => r.kind === kind), [rows, kind]);

  const chartData = useMemo(
    () =>
      [...filtered]
        .reverse()
        .slice(-30)
        .map((r) => ({
          t: new Date(r.measured_at).toLocaleDateString("it-IT", {
            day: "2-digit",
            month: "2-digit",
          }),
          v: Number(r.value_primary),
          v2: r.value_secondary != null ? Number(r.value_secondary) : undefined,
        })),
    [filtered],
  );

  const latestByKind = useMemo(() => {
    const map: Partial<Record<Kind, VitalRow>> = {};
    for (const r of rows) {
      if (!map[r.kind]) map[r.kind] = r;
    }
    return map;
  }, [rows]);

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

      {/* Grafico */}
      <section className="rounded-2xl border bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Activity className="size-4 text-primary" />
          <h2 className="text-base font-bold">Andamento — ultimi 30 valori</h2>
        </div>
        {chartData.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nessuna misurazione registrata per {KINDS[kind].label.toLowerCase()}.
          </p>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="t" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={KINDS[kind].color}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name={kind === "blood_pressure" ? "Sistolica" : KINDS[kind].label}
                />
                {kind === "blood_pressure" && (
                  <Line
                    type="monotone"
                    dataKey="v2"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    name="Diastolica"
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Storico */}
      <section className="rounded-2xl border bg-card p-5">
        <h2 className="mb-3 text-base font-bold">Storico misurazioni</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Caricamento…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessuna misurazione.</p>
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
