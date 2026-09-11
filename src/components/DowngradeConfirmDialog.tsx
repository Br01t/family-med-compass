import { useState, useMemo } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  Clock,
  Info,
  Loader2,
  ShieldAlert,
  Trash2,
  Users,
  Pill,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PLAN_LIMITS, type SubscriptionPlan } from "@/lib/subscription";
import type {
  DowngradeImpact,
  DowngradePatient,
  DowngradeTherapy,
  DowngradeCaregiver,
} from "@/lib/supabase-service";

/* =====================================================
   TIPI
===================================================== */

interface Props {
  impact: DowngradeImpact;
  targetPlan: SubscriptionPlan;
  loading: boolean;
  onConfirm: (
    keepPatientIds: string[],
    keepTherapyIds: Record<string, string[]>,
    keepCaregiverIds: Record<string, string[]>
  ) => void;
  onCancel: () => void;
}

type Step = "select" | "confirm";

/* =====================================================
   MAIN COMPONENT
===================================================== */

export function DowngradeConfirmDialog({
  impact,
  targetPlan,
  loading,
  onConfirm,
  onCancel,
}: Props) {
  const [step, setStep] = useState<Step>("select");

  // --- Selezione pazienti da MANTENERE ---
  const patientLimit = impact.patient_limit;
  const [selectedPatientIds, setSelectedPatientIds] = useState<string[]>(() => {
    return (impact.patients ?? []).slice(0, patientLimit).map((p) => p.id);
  });

  // --- Selezione terapie da mantenere (per paziente mantenuto) ---
  const therapyLimit = impact.therapy_limit; // -1 = nessun limite
  const [selectedTherapyIds, setSelectedTherapyIds] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {};
    for (const [pid, therapies] of Object.entries(impact.therapies_per_patient ?? {})) {
      if (!therapies) continue;
      const active = therapies.filter((t) => t.active);
      const inactive = therapies.filter((t) => !t.active);
      const allSorted = [...active, ...inactive];
      init[pid] = therapyLimit >= 0
        ? allSorted.slice(0, therapyLimit).map((t) => t.id)
        : allSorted.map((t) => t.id);
    }
    return init;
  });

  // --- Selezione caregiver da mantenere (per paziente mantenuto, quando limit > 0 es. Max -> Pro) ---
  const caregiverExtraLimit = impact.caregiver_extra_limit; // 0 in Free, 4 in Pro, 9 in Max
  const [selectedCaregiverIds, setSelectedCaregiverIds] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {};
    for (const [pid, caregivers] of Object.entries(impact.caregivers_per_patient ?? {})) {
      if (!caregivers) continue;
      init[pid] = caregiverExtraLimit > 0
        ? caregivers.slice(0, caregiverExtraLimit).map((c) => c.id)
        : [];
    }
    return init;
  });

  const planName = PLAN_LIMITS[targetPlan]?.name ?? targetPlan;
  const currentPlanName = PLAN_LIMITS[impact.current_plan as SubscriptionPlan]?.name ?? impact.current_plan;

  /* -- Conteggi per il riepilogo -- */
  const suspendedPatients = useMemo(() => {
    return (impact.patients ?? []).filter((p) => !selectedPatientIds.includes(p.id));
  }, [impact.patients, selectedPatientIds]);

  const suspendedTherapiesCount = useMemo(() => {
    let count = 0;
    for (const pid of selectedPatientIds) {
      const all = impact.therapies_per_patient?.[pid] ?? [];
      const kept = selectedTherapyIds[pid] ?? [];
      count += all.filter((t) => !kept.includes(t.id)).length;
    }
    return count;
  }, [impact.therapies_per_patient, selectedPatientIds, selectedTherapyIds]);

  const suspendedCaregivers = useMemo(() => {
    const list: { patientName: string; caregiverName: string }[] = [];
    for (const pid of selectedPatientIds) {
      const all = impact.caregivers_per_patient?.[pid] ?? [];
      const pName = impact.patients?.find((p) => p.id === pid)?.name ?? "Paziente";
      const kept = caregiverExtraLimit > 0 ? (selectedCaregiverIds[pid] ?? []) : [];
      const suspended = all.filter((c) => !kept.includes(c.id));
      for (const c of suspended) {
        list.push({ patientName: pName, caregiverName: c.name });
      }
    }
    return list;
  }, [impact.caregivers_per_patient, selectedPatientIds, caregiverExtraLimit, selectedCaregiverIds, impact.patients]);

  const canProceed =
    selectedPatientIds.length > 0 &&
    selectedPatientIds.length <= patientLimit &&
    (therapyLimit < 0 || selectedPatientIds.every(
      (pid) => (selectedTherapyIds[pid]?.length ?? 0) <= therapyLimit
    )) &&
    (caregiverExtraLimit === 0 || selectedPatientIds.every(
      (pid) => (selectedCaregiverIds[pid]?.length ?? 0) <= caregiverExtraLimit
    ));

  const handleConfirm = () => {
    onConfirm(selectedPatientIds, selectedTherapyIds, selectedCaregiverIds);
  };

  /* =====================================================
     STEP 1: SELEZIONE
  ===================================================== */
  if (step === "select") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-card w-full max-w-xl rounded-3xl shadow-2xl border border-border/60 flex flex-col max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="px-6 py-5 border-b border-border/40 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-2xl bg-amber-500/10 text-amber-600">
                <ShieldAlert className="size-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-0.5">
                  Downgrade Piano
                </p>
                <h2 className="font-extrabold text-lg text-foreground leading-tight">
                  Passaggio da <span className="text-primary">{currentPlanName}</span> a{" "}
                  <span className="text-amber-600">{planName}</span>
                </h2>
              </div>
            </div>
          </div>

          {/* Body scrollabile */}
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
            {/* Selezione pazienti */}
            <PatientSelector
              patients={impact.patients ?? []}
              patientLimit={patientLimit}
              selected={selectedPatientIds}
              onToggle={(id) => {
                setSelectedPatientIds((prev) => {
                  if (prev.includes(id)) return prev.filter((x) => x !== id);
                  if (prev.length >= patientLimit) {
                    return [...prev.slice(1), id];
                  }
                  return [...prev, id];
                });
              }}
            />

            {/* Selezione terapie per i pazienti mantenuti */}
            {therapyLimit >= 0 && selectedPatientIds.map((pid) => {
              const therapies = impact.therapies_per_patient?.[pid];
              if (!therapies || therapies.length === 0) return null;
              const patient = impact.patients?.find((p) => p.id === pid);
              return (
                <TherapySelector
                  key={pid}
                  patientName={patient?.name ?? pid}
                  therapies={therapies}
                  therapyLimit={therapyLimit}
                  selected={selectedTherapyIds[pid] ?? []}
                  onToggle={(tid) => {
                    setSelectedTherapyIds((prev) => {
                      const cur = prev[pid] ?? [];
                      if (cur.includes(tid)) return { ...prev, [pid]: cur.filter((x) => x !== tid) };
                      if (cur.length >= therapyLimit) return { ...prev, [pid]: [...cur.slice(1), tid] };
                      return { ...prev, [pid]: [...cur, tid] };
                    });
                  }}
                />
              );
            })}

            {/* Selezione caregiver (se caregiverExtraLimit > 0, es. Max -> Pro) */}
            {caregiverExtraLimit > 0 && selectedPatientIds.map((pid) => {
              const caregivers = impact.caregivers_per_patient?.[pid];
              if (!caregivers || caregivers.length <= caregiverExtraLimit) return null;
              const patient = impact.patients?.find((p) => p.id === pid);
              return (
                <CaregiverSelector
                  key={pid}
                  patientName={patient?.name ?? pid}
                  caregivers={caregivers}
                  caregiverLimit={caregiverExtraLimit}
                  selected={selectedCaregiverIds[pid] ?? []}
                  onToggle={(cid) => {
                    setSelectedCaregiverIds((prev) => {
                      const cur = prev[pid] ?? [];
                      if (cur.includes(cid)) return { ...prev, [pid]: cur.filter((x) => x !== cid) };
                      if (cur.length >= caregiverExtraLimit) return { ...prev, [pid]: [...cur.slice(1), cid] };
                      return { ...prev, [pid]: [...cur, cid] };
                    });
                  }}
                />
              );
            })}

            {/* Avviso caregiver per piano Free */}
            {caregiverExtraLimit === 0 && suspendedCaregivers.length > 0 && (
              <div className="rounded-2xl bg-amber-500/8 border border-amber-500/20 p-4 space-y-2">
                <div className="flex gap-2.5 items-center text-amber-800 dark:text-amber-300 font-bold text-xs">
                  <Users className="size-4 text-amber-600 shrink-0" />
                  <span>{suspendedCaregivers.length} Caregiver perderanno l'accesso (limite Free: solo titolare)</span>
                </div>
                <p className="text-xs text-muted-foreground pl-6">
                  {suspendedCaregivers.map((c) => c.caregiverName).join(", ")}. Potranno rientrare se riattivi il piano entro 30 giorni.
                </p>
              </div>
            )}

            {/* Info 30 giorni */}
            <div className="rounded-2xl bg-blue-500/8 border border-blue-500/20 p-4 flex gap-3">
              <Clock className="size-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
                I dati in eccesso restano conservati per <strong>30 giorni</strong> (1 mese).
                Se riattivi il piano {currentPlanName} entro 30 giorni li ritroverai intatti.
                Trascorsi i 30 giorni verranno eliminati definitivamente dal sistema.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-border/40 flex gap-3 flex-shrink-0">
            <Button variant="outline" onClick={onCancel} className="flex-1 rounded-xl" disabled={loading}>
              Annulla
            </Button>
            <Button
              onClick={() => setStep("confirm")}
              disabled={!canProceed || loading}
              className="flex-1 rounded-xl bg-amber-600 text-white hover:bg-amber-700 font-bold"
            >
              Continua
              <ChevronRight className="size-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* =====================================================
     STEP 2: CONFERMA FINALE
  ===================================================== */
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card w-full max-w-md rounded-3xl shadow-2xl border border-border/60">
        {/* Header */}
        <div className="px-6 py-5 border-b border-border/40">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-red-500/10 text-red-600">
              <AlertTriangle className="size-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-0.5">
                Conferma Downgrade
              </p>
              <h2 className="font-extrabold text-lg text-foreground leading-tight">
                Riepilogo modifiche
              </h2>
            </div>
          </div>
        </div>

        {/* Riepilogo */}
        <div className="px-6 py-5 space-y-3">
          <SummaryRow
            icon={<User className="size-4" />}
            label="Pazienti mantenuti"
            value={`${selectedPatientIds.length} / ${impact.patients?.length ?? 0}`}
            ok
          />
          {suspendedPatients.length > 0 && (
            <SummaryRow
              icon={<Trash2 className="size-4" />}
              label="Pazienti sospesi"
              value={suspendedPatients.map((p) => p.name).join(", ")}
              warn
            />
          )}
          {suspendedTherapiesCount > 0 && (
            <SummaryRow
              icon={<Pill className="size-4" />}
              label="Terapie sospese"
              value={`${suspendedTherapiesCount}`}
              warn
            />
          )}
          {suspendedCaregivers.length > 0 && (
            <SummaryRow
              icon={<Users className="size-4" />}
              label="Caregiver sospesi"
              value={`${suspendedCaregivers.length}`}
              warn
            />
          )}

          <div className="rounded-2xl bg-muted/60 border border-border/40 p-3 mt-4 flex gap-2">
            <Info className="size-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              I dati sospesi sono conservati per <strong className="text-foreground">30 giorni</strong>.
              Nessun dato medico viene eliminato ora. Puoi tornare al piano {currentPlanName} in qualsiasi momento entro 30 giorni per ripristinarli automaticamente.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border/40 flex gap-3">
          <Button
            variant="outline"
            onClick={() => setStep("select")}
            className="flex-1 rounded-xl"
            disabled={loading}
          >
            Indietro
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 rounded-xl bg-red-600 text-white hover:bg-red-700 font-bold"
          >
            {loading ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Elaborazione…
              </>
            ) : (
              <>
                Conferma Downgrade
                <ArrowRight className="size-4 ml-1" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* =====================================================
   SUB-COMPONENTS
===================================================== */

function PatientSelector({
  patients,
  patientLimit,
  selected,
  onToggle,
}: {
  patients: DowngradePatient[];
  patientLimit: number;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const totalOver = patients.length - patientLimit;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-bold text-foreground flex items-center gap-2">
          <User className="size-4 text-primary" />
          Pazienti da mantenere
        </p>
        <Badge variant="secondary" className="text-xs">
          max {patientLimit}
        </Badge>
      </div>

      {totalOver > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400 mb-3">
          Hai {patients.length} pazienti. Seleziona fino a {patientLimit} {patientLimit === 1 ? "paziente" : "pazienti"} da mantenere attivo.
        </p>
      )}

      <div className="space-y-2">
        {patients.map((p) => {
          const isSelected = selected.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onToggle(p.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-all ${
                isSelected
                  ? "border-primary bg-primary/8 text-foreground"
                  : "border-border/40 bg-muted/30 text-muted-foreground hover:bg-muted/60"
              }`}
            >
              <div
                className={`size-4 rounded-full border-2 flex-shrink-0 transition-colors ${
                  isSelected ? "border-primary bg-primary" : "border-muted-foreground/40"
                }`}
              />
              <span className="font-semibold text-sm flex-1">{p.name}</span>
              {!isSelected && <span className="text-xs text-amber-600 font-medium">verrà sospeso</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TherapySelector({
  patientName,
  therapies,
  therapyLimit,
  selected,
  onToggle,
}: {
  patientName: string;
  therapies: DowngradeTherapy[];
  therapyLimit: number;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (therapies.length <= therapyLimit) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-bold text-foreground flex items-center gap-2">
          <Pill className="size-4 text-primary" />
          Terapie di {patientName}
        </p>
        <Badge variant="secondary" className="text-xs">
          max {therapyLimit}
        </Badge>
      </div>
      <p className="text-xs text-amber-700 dark:text-amber-400 mb-3">
        Hai {therapies.length} terapie (limite {therapyLimit}). Scegli quali mantenere attive.
      </p>

      <div className="space-y-1.5">
        {therapies.map((t) => {
          const isSelected = selected.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onToggle(t.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                isSelected
                  ? "border-primary bg-primary/8 text-foreground"
                  : "border-border/40 bg-muted/30 text-muted-foreground hover:bg-muted/60"
              }`}
            >
              <div
                className={`size-3.5 rounded border-2 flex-shrink-0 transition-colors ${
                  isSelected ? "border-primary bg-primary" : "border-muted-foreground/40"
                }`}
              />
              <span className="text-sm flex-1">{t.name}</span>
              {!t.active && <Badge variant="outline" className="text-[10px]">Inattiva</Badge>}
              {!isSelected && <span className="text-xs text-amber-600 font-medium">sospesa</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CaregiverSelector({
  patientName,
  caregivers,
  caregiverLimit,
  selected,
  onToggle,
}: {
  patientName: string;
  caregivers: DowngradeCaregiver[];
  caregiverLimit: number;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (caregivers.length <= caregiverLimit) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-bold text-foreground flex items-center gap-2">
          <Users className="size-4 text-primary" />
          Caregiver di {patientName}
        </p>
        <Badge variant="secondary" className="text-xs">
          max {caregiverLimit}
        </Badge>
      </div>
      <p className="text-xs text-amber-700 dark:text-amber-400 mb-3">
        Hai {caregivers.length} caregiver per questo paziente (limite {caregiverLimit}). Scegli chi mantenere.
      </p>

      <div className="space-y-1.5">
        {caregivers.map((c) => {
          const isSelected = selected.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onToggle(c.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                isSelected
                  ? "border-primary bg-primary/8 text-foreground"
                  : "border-border/40 bg-muted/30 text-muted-foreground hover:bg-muted/60"
              }`}
            >
              <div
                className={`size-3.5 rounded border-2 flex-shrink-0 transition-colors ${
                  isSelected ? "border-primary bg-primary" : "border-muted-foreground/40"
                }`}
              />
              <span className="text-sm flex-1">{c.name}</span>
              {!isSelected && <span className="text-xs text-amber-600 font-medium">sospeso</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SummaryRow({
  icon,
  label,
  value,
  ok,
  warn,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  ok?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 rounded-xl ${
        warn ? "bg-amber-500/8 border border-amber-500/20" : "bg-muted/40"
      }`}
    >
      <span className={warn ? "text-amber-600" : "text-muted-foreground"}>{icon}</span>
      <span className="text-sm font-medium text-foreground flex-1">{label}</span>
      <span className={`text-sm font-bold ${warn ? "text-amber-700 dark:text-amber-400" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}
