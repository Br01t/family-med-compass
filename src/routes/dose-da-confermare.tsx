import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Check, Pill, XCircle } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useFamilyMed } from "@/lib/store";
import { formatTime } from "@/lib/therapy";
import { saveEventDoc } from "@/lib/supabase-service";
import type { MedicationEvent } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dose-da-confermare")({
  head: () => ({
    meta: [
      { title: "Dose da confermare — FamilyMed" },
      {
        name: "description",
        content:
          "Rivedi le dosi non assunte dai pazienti e conferma manualmente quelle prese davvero.",
      },
    ],
  }),
  component: DoseDaConfermarePage,
});

const ACK_TAG = "caregiver_ack";

function isAcknowledged(e: MedicationEvent): boolean {
  return typeof e.note === "string" && e.note.includes(ACK_TAG);
}

function DoseDaConfermarePage() {
  const { data, user, confirmDose } = useFamilyMed();
  const [patientFilter, setPatientFilter] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);

  const pending = useMemo(() => {
    return data.events
      .filter(
        (e) =>
          (e.status === "missed" || e.status === "skipped") &&
          !isAcknowledged(e) &&
          (!patientFilter || e.patientId === patientFilter),
      )
      .sort(
        (a, b) =>
          new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime(),
      );
  }, [data.events, patientFilter]);

  const handleConfirm = async (e: MedicationEvent) => {
    if (busy) return;
    setBusy(e.id);
    try {
      await confirmDose({
        therapyId: e.therapyId,
        scheduledAt: new Date(e.scheduledAt),
        confirmedBy: user?.id ?? "caregiver",
      });
      toast.success("Dose confermata", {
        description: "La scorta è stata scalata di conseguenza.",
      });
    } catch (err) {
      console.error(err);
      toast.error("Errore nella conferma");
    } finally {
      setBusy(null);
    }
  };

  const handleAcknowledge = async (e: MedicationEvent) => {
    if (busy) return;
    setBusy(e.id);
    try {
      const nowIso = new Date().toISOString();
      const updated: MedicationEvent = {
        ...e,
        note: [e.note, ACK_TAG].filter(Boolean).join(" | "),
        timeline: [
          ...e.timeline,
          {
            at: nowIso,
            kind: e.status,
            message: "Segnalata come gestita dal caregiver",
          },
        ],
      };
      if (user) {
        await saveEventDoc(updated);
      }
      toast.success("Segnata come gestita");
    } catch (err) {
      console.error(err);
      toast.error("Errore nell'aggiornamento");
    } finally {
      setBusy(null);
    }
  };

  return (
    <AppShell
      title="Dose da confermare"
      subtitle="Dosi dimenticate o saltate — chiama il paziente e aggiorna lo stato"
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {data.patients.length > 1 && (
          <select
            value={patientFilter}
            onChange={(e) => setPatientFilter(e.target.value)}
            className="rounded-full border border-border bg-card px-4 py-1.5 text-xs font-bold text-foreground"
          >
            <option value="">Tutti i pazienti</option>
            {data.patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <span className="ml-auto text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {pending.length} in sospeso
        </span>
      </div>

      {pending.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border/60 bg-card p-12 text-center">
          <Pill className="mx-auto size-10 text-muted-foreground" />
          <p className="mt-4 text-lg font-black">Tutto sotto controllo</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Nessuna dose non assunta da rivedere.
          </p>
          <div className="mt-6">
            <Button asChild variant="outline" size="sm">
              <Link to="/caregiver">Torna alla dashboard</Link>
            </Button>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {pending.map((e) => {
            const therapy = data.therapies.find((t) => t.id === e.therapyId);
            const patient = data.patients.find((p) => p.id === e.patientId);
            const scheduledDate = new Date(e.scheduledAt);
            const tone =
              e.status === "missed"
                ? "bg-destructive/10 text-destructive"
                : "bg-accent-soft text-accent";
            const label = e.status === "missed" ? "Dimenticata" : "Saltata";
            return (
              <li
                key={e.id}
                className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm"
              >
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-4">
                  <div className={cn("grid size-12 shrink-0 place-items-center rounded-xl", tone)}>
                    <AlertTriangle className="size-6" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                          tone,
                        )}
                      >
                        {label}
                      </span>
                      {patient && (
                        <span className="text-xs font-bold text-primary">
                          {patient.name}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-base font-black leading-tight">
                      {therapy?.name ?? "Farmaco"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {therapy?.dosage} · {therapy?.quantity ?? 1} unità
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Prevista{" "}
                      {scheduledDate.toLocaleDateString("it-IT", {
                        day: "numeric",
                        month: "short",
                      })}{" "}
                      alle {formatTime(scheduledDate)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted-foreground">
                    {scheduledDate.toLocaleDateString("it-IT", {
                      weekday: "short",
                    })}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleConfirm(e)}
                    disabled={busy === e.id}
                    className="gap-2"
                  >
                    <Check className="size-4" />
                    Segna come confermata
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAcknowledge(e)}
                    disabled={busy === e.id}
                    className="gap-2"
                  >
                    <XCircle className="size-4" />
                    Segnala come gestita
                  </Button>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Conferma solo dopo aver parlato con il paziente. "Confermata"
                  scala la dose dalle scorte. "Gestita" rimuove l'alert senza
                  modificare le scorte (la dose resta {label.toLowerCase()}).
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
