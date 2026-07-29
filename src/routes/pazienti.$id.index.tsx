import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CalendarPlus, ChevronLeft, ChevronRight, Loader2, RotateCcw, TriangleAlert, Users } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFamilyMed } from "@/lib/store";
import {
  formatTime,
  getAdherenceForPatient,
  getDosesForPatientOnDate,
  statusDot,
  statusLabel,
  statusTone,
} from "@/lib/therapy";
import { downloadIcs, therapyToIcs } from "@/lib/ics";
import { logPatientView, resetPatientHistory } from "@/lib/supabase-service";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MedicalProfileCard } from "@/components/MedicalProfileCard";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";


export const Route = createFileRoute("/pazienti/$id/")({
  head: ({ params }) => ({ meta: [{ title: `Paziente ${params.id} — FamilyMed` }] }),
  component: PatientDetail,
  notFoundComponent: () => (
    <AppShell title="Paziente non trovato">
      <Button asChild>
        <Link to="/pazienti">Torna ai pazienti</Link>
      </Button>
    </AppShell>
  ),
});

function PatientDetail() {
  const { id } = Route.useParams();
  const { data, user } = useFamilyMed();
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetConfirmName, setResetConfirmName] = useState("");
  const [resetting, setResetting] = useState(false);
  const resetInputRef = useRef<HTMLInputElement>(null);

  // Determina se l'utente corrente è il caregiver primario di questo paziente
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  void tick;

  // GDPR audit log: registra l'apertura della scheda paziente da parte di questo caregiver.
  useEffect(() => {
    if (id) void logPatientView(id);
  }, [id]);
  const patient = data.patients.find((p) => p.id === id);
  const isPrimary =
    !!user &&
    !!patient &&
    (patient.ownerUserId === user.id ||
      (!patient.ownerUserId && patient.primaryCaregiverId === user.id));

  if (!patient) {
    return (
      <AppShell title="Paziente non trovato">
        <Button asChild>
          <Link to="/pazienti">Torna ai pazienti</Link>
        </Button>
      </AppShell>
    );
  }

  const now = new Date();
  const doses = getDosesForPatientOnDate(data, patient.id, now, now);
  const adherence = getAdherenceForPatient(data, patient.id);
  const therapies = data.therapies.filter((t) => t.patientId === patient.id);
  // const caregivers = data.caregivers.filter((c) => patient.caregiverIds.includes(c.id));
  const todayEvents = data.events
    .filter((e) => e.patientId === patient.id)
    .flatMap((e) =>
      e.timeline
        .filter((t) => new Date(t.at).toDateString() === now.toDateString())
        .map((t) => ({ ...t, therapyId: e.therapyId })),
    )
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <AppShell
      title={patient.name}
      subtitle={`${patient.birthYear ? now.getFullYear() - patient.birthYear : "?"} anni · Aderenza ${adherence}%`}
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link to="/pazienti">
            <ChevronLeft className="mr-1 size-4" /> Tutti
          </Link>
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-12">
        <section className="space-y-4 lg:col-span-8">
          <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
            <h3 className="text-lg font-black tracking-tight">Terapie di oggi</h3>
            <ul className="mt-4 space-y-3">
              {doses.length === 0 && (
                <li className="text-sm text-muted-foreground">
                  Nessuna terapia programmata oggi.
                </li>
              )}
              {doses.map((d) => (
                <li
                  key={d.id}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 rounded-2xl border border-border/60 p-4"
                >
                  <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary-soft font-mono text-sm font-black text-primary">
                    {formatTime(d.scheduledAt)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-black">{d.therapy.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.therapy.dosage} · {d.therapy.quantity}x
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest",
                      statusTone[d.status],
                    )}
                  >
                    {statusLabel[d.status]}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
            <h3 className="text-lg font-black tracking-tight">Timeline di oggi</h3>
            <div className="relative mt-6 space-y-5 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-border">
              {todayEvents.length === 0 && (
                <p className="text-sm text-muted-foreground">Nessun evento oggi.</p>
              )}
              {todayEvents.map((t, i) => {
                const therapy = data.therapies.find((th) => th.id === t.therapyId);
                return (
                  <div key={i} className="relative pl-10">
                    <div className="absolute left-0 top-1.5 grid size-6 place-items-center rounded-full bg-background ring-2 ring-border">
                      <div className={cn("size-2 rounded-full", statusDot.due)} />
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                      <p className="truncate text-sm font-semibold">{t.message}</p>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {formatTime(new Date(t.at))}
                      </span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {therapy?.name}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-12">
          <Link
            to="/pazienti/$id/famiglia"
            params={{ id: patient.id }}
            className="group mx-auto block max-w-3xl rounded-3xl border border-border/60 bg-card p-6 shadow-card transition-colors hover:border-primary/60"
          >
            <div className="flex items-center gap-4">
              <div className="grid size-12 place-items-center rounded-xl bg-primary-soft text-primary">
                <Users className="size-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-black tracking-tight">Gruppo di cura</h3>
                <p className="text-sm text-muted-foreground">
                  Membri, ruoli, inviti e registro attività di {patient.name}.
                </p>
              </div>
              <ChevronRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </div>
          </Link>
        </div>

          {/* Scheda Medica di Emergenza — sotto il Gruppo di cura */}
          <div className="lg:col-span-12">
            <MedicalProfileCard patientId={patient.id} isPrimary={isPrimary} />
          </div>
        </section>

        <aside className="space-y-4 lg:col-span-4">
          <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-black tracking-tight">Piano terapeutico</h3>
              <Button variant="outline" size="sm" asChild>
                <Link to="/terapie">Gestisci terapie</Link>
              </Button>
            </div>
            <ul className="mt-3 space-y-2">
              {therapies.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-col gap-2 rounded-xl border border-border/50 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{t.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.times.join(", ")} · {t.dosage}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                        t.active && !t.suspended
                          ? "bg-success/15 text-success"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {t.suspended ? "Sospesa" : t.active ? "Attiva" : "Off"}
                    </span>
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => {
                            const ics = therapyToIcs(t, patient, "caregiver");
                            downloadIcs(`${t.name.replace(/\s+/g, "_")}.ics`, ics);
                            toast.success("Evento calendario esportato", {
                              description: "Apri il file per aggiungerlo al calendario.",
                            });
                          }}
                        >
                          <CalendarPlus className="mr-1.5 size-3.5" />
                          Aggiungi al calendario
                        </Button>
                      </TooltipTrigger>

                      <TooltipContent className="max-w-xs text-center">
                        <p className="font-semibold">
                          Sincronizza la terapia con il calendario
                        </p>
                        <p className="mt-1 text-xs">
                          Verrà scaricato un file calendario. Aprendolo verrà creato
                          automaticamente l'evento all'orario previsto con un promemoria
                          predefinito 30 minuti prima.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      {/* ================================================================
          ZONA PERICOLOSA — visibile solo al caregiver primario
      ================================================================ */}
      {isPrimary && (
        <section
          id="danger-zone"
          className="mt-8 rounded-3xl border-2 border-destructive/30 bg-destructive/5 p-6"
        >
          <div className="flex items-start gap-4">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-destructive/15 text-destructive">
              <TriangleAlert className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-black tracking-tight text-destructive">
                Zona Pericolosa
              </h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Azioni irreversibili. Usa solo se sei certo di quello che stai facendo.
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-destructive/20 bg-card p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-bold">Azzera storico di {patient.name}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Elimina definitivamente tutte le dosi registrate, le notifiche e i
                  movimenti di scorta. Reimposta le scorte al valore iniziale configurato.
                  <br />
                  <span className="font-medium text-foreground">
                    Vengono conservati: anagrafica, terapie, caregiver e scheda medica.
                  </span>
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  setResetConfirmName("");
                  setShowResetDialog(true);
                  setTimeout(() => resetInputRef.current?.focus(), 80);
                }}
                id="open-reset-dialog-btn"
              >
                <RotateCcw className="mr-1.5 size-3.5" />
                Azzera storico
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* ================================================================
          DIALOG DI CONFERMA RESET
      ================================================================ */}
      <AlertDialog open={showResetDialog} onOpenChange={(open) => { if (!resetting) setShowResetDialog(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <TriangleAlert className="size-5 shrink-0" />
              Azzerare lo storico di {patient.name}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  Questa operazione è <strong>irreversibile</strong>. Verranno eliminati permanentemente:
                </p>
                <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
                  <li>Tutto lo storico dosi (prese, saltate, ritardate, snoozate)</li>
                  <li>Tutte le notifiche e gli alert</li>
                  <li>Tutti i movimenti di scorta farmaci</li>
                  <li>Le scorte verranno reimpostate al valore iniziale</li>
                </ul>
                <p className="font-medium text-foreground">
                  Verranno <span className="text-success font-bold">conservati</span>: anagrafica, terapie, caregiver e scheda medica di emergenza.
                </p>
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                  <label
                    htmlFor="reset-confirm-input"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-destructive"
                  >
                    Digita «{patient.name}» per confermare
                  </label>
                  <Input
                    ref={resetInputRef}
                    id="reset-confirm-input"
                    placeholder={patient.name}
                    value={resetConfirmName}
                    onChange={(e) => setResetConfirmName(e.target.value)}
                    disabled={resetting}
                    className="border-destructive/40 focus-visible:ring-destructive/40"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Annulla</AlertDialogCancel>
            <Button
              id="confirm-reset-btn"
              variant="destructive"
              disabled={resetConfirmName.trim() !== patient.name || resetting}
              onClick={async () => {
                setResetting(true);
                const result = await resetPatientHistory(patient.id);
                setResetting(false);
                if (!result.ok) {
                  toast.error("Errore durante il reset", { description: result.error ?? undefined });
                  return;
                }
                setShowResetDialog(false);
                toast.success("Storico azzerato con successo", {
                  description: `Eliminati: ${result.eventsDeleted} eventi, ${result.notifDeleted} notifiche, ${result.stockDeleted} movimenti scorta.`,
                  duration: 6000,
                });
                // Ricarica la pagina per aggiornare tutti i dati nello store
                navigate({ to: `/pazienti/${patient.id}`, replace: true });
                setTimeout(() => window.location.reload(), 300);
              }}
            >
              {resetting ? (
                <><Loader2 className="mr-2 size-4 animate-spin" /> Azzeramento…</>
              ) : (
                <>Sì, azzera definitivamente</>
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}