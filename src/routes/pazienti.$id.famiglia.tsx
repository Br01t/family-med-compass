import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ChevronLeft,
  Copy,
  Crown,
  KeyRound,
  Loader2,
  Pencil,
  Pill,
  ScrollText,
  ShieldCheck,
  Trash2,
  UserMinus,
  Users,
} from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useFamilyMed } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  createFamilyInvite,
  fetchFamilyGroupData,
  fetchPatientAuditLog,
  promoteCaregiverToPrimary,
  removeCaregiverFromPatient,
  revokeFamilyInvite,
  updateCaregiverRelationship,
  type AuditLogEntry,
  type FamilyInvite,
  type PatientCaregiver,
} from "@/lib/supabase-service";

export const Route = createFileRoute("/pazienti/$id/famiglia")({
  head: ({ params }) => ({
    meta: [{ title: `Gruppo di cura · ${params.id} — FamilyMed` }],
  }),
  component: FamilyPage,
  notFoundComponent: () => (
    <AppShell title="Paziente non trovato">
      <Button asChild>
        <Link to="/pazienti">Torna ai pazienti</Link>
      </Button>
    </AppShell>
  ),
});

const AUDIT_PAGE = 30;

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "adesso";
  if (m < 60) return `${m} min fa`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h fa`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} g fa`;
  return new Date(iso).toLocaleDateString("it-IT");
}

function actionTone(action: string): { label: string; className: string } {
  if (action.startsWith("therapy_"))
    return { label: "Terapia", className: "bg-primary-soft text-primary" };
  if (action === "primary_changed")
    return { label: "Permessi", className: "bg-warning/15 text-warning" };
  if (action.startsWith("member_"))
    return { label: "Gruppo", className: "bg-primary/10 text-primary" };
  if (action.startsWith("invite_"))
    return { label: "Invito", className: "bg-muted text-muted-foreground" };
  if (action === "patient_viewed")
    return { label: "Accesso", className: "bg-muted text-muted-foreground" };
  if (action === "data_exported" || action === "account_deleted")
    return { label: "GDPR", className: "bg-destructive/15 text-destructive" };
  return { label: "Attività", className: "bg-muted text-muted-foreground" };
}

function FamilyPage() {
  const { id } = Route.useParams();
  const { data, user } = useFamilyMed();
  const patient = data.patients.find((p) => p.id === id);

  const [members, setMembers] = useState<PatientCaregiver[]>([]);
  const [invites, setInvites] = useState<FamilyInvite[]>([]);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsPage, setLogsPage] = useState(1);
  const [logsHasMore, setLogsHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busyMember, setBusyMember] = useState<string | null>(null);
  const [editingRel, setEditingRel] = useState<string | null>(null);
  const [relValue, setRelValue] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<PatientCaregiver | null>(null);
  const [confirmPromote, setConfirmPromote] = useState<PatientCaregiver | null>(null);

  const isPrimary = useMemo(() => {
    if (!user || !patient) return false;
    if (patient.ownerUserId === user.id) return true;
    if (!patient.ownerUserId && patient.primaryCaregiverId === user.id) return true;
    return false;
  }, [user, patient]);

  const load = useCallback(async () => {
    if (!patient) return;
    setLoading(true);
    try {
      // Un'unica RPC lato DB al posto di 3 query separate — vedi
      // MIGRATION_family_group_rpc.sql e fetchFamilyGroupData.
      const { members: m, invites: inv, logs: l } = await fetchFamilyGroupData(
        patient.id,
        patient.primaryCaregiverId ?? null,
        AUDIT_PAGE + 1,
      );
      setMembers(m);
      setInvites(inv);
      setLogsHasMore(l.length > AUDIT_PAGE);
      setLogs(l.slice(0, AUDIT_PAGE));
      setLogsPage(1);
    } finally {
      setLoading(false);
    }
  }, [patient]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!patient) {
    return (
      <AppShell title="Paziente non trovato">
        <Button asChild>
          <Link to="/pazienti">Torna ai pazienti</Link>
        </Button>
      </AppShell>
    );
  }

  const activeInvites = invites.filter(
    (i) => i.uses < i.maxUses && new Date(i.expiresAt) > new Date(),
  );

  async function loadMoreLogs() {
    setLoadingMore(true);
    try {
      const nextLimit = (logsPage + 1) * AUDIT_PAGE + 1;
      const l = await fetchPatientAuditLog(patient!.id, nextLimit);
      setLogsHasMore(l.length > (logsPage + 1) * AUDIT_PAGE);
      setLogs(l.slice(0, (logsPage + 1) * AUDIT_PAGE));
      setLogsPage((p) => p + 1);
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleCreateInvite() {
    setCreating(true);
    try {
      const inv = await createFamilyInvite(patient!.id, 1440, 1);
      toast.success("Codice generato", { description: inv.code });
      // createFamilyInvite ritorna già la riga completa: aggiorniamo lo
      // stato locale invece di rileggere inviti + audit dal DB (0 round
      // trip aggiuntivi). La riga "invito creato" nel registro attività
      // comparirà comunque al prossimo caricamento della pagina.
      setInvites((prev) => [inv, ...prev]);
    } catch (e) {
      toast.error("Impossibile generare il codice", {
        description: e instanceof Error ? e.message : "Riprova.",
      });
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(inviteId: string) {
    try {
      await revokeFamilyInvite(inviteId);
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
      toast.success("Codice revocato");
    } catch (e) {
      toast.error("Impossibile revocare", {
        description: e instanceof Error ? e.message : "Riprova.",
      });
    }
  }

  async function handleSaveRelationship(cgId: string) {
    setBusyMember(cgId);
    try {
      await updateCaregiverRelationship(cgId, patient!.id, relValue);
      setMembers((prev) =>
        prev.map((m) => (m.id === cgId ? { ...m, relationship: relValue.trim() || null } : m)),
      );
      toast.success("Relazione aggiornata");
      setEditingRel(null);
      setRelValue("");
    } catch (e) {
      toast.error("Errore", { description: e instanceof Error ? e.message : "" });
    } finally {
      setBusyMember(null);
    }
  }

  async function handlePromote(cg: PatientCaregiver) {
    setBusyMember(cg.id);
    try {
      await promoteCaregiverToPrimary(patient!.id, cg.id);
      toast.success(`${cg.name} è ora il caregiver principale`);
      await load();
    } catch (e) {
      toast.error("Impossibile promuovere", {
        description: e instanceof Error ? e.message : "",
      });
    } finally {
      setBusyMember(null);
      setConfirmPromote(null);
    }
  }

  async function handleRemove(cg: PatientCaregiver) {
    setBusyMember(cg.id);
    try {
      await removeCaregiverFromPatient(patient!.id, cg.id);
      setMembers((prev) => prev.filter((m) => m.id !== cg.id));
      toast.success(`${cg.name} rimosso dal gruppo`);
    } catch (e) {
      toast.error("Impossibile rimuovere", {
        description: e instanceof Error ? e.message : "",
      });
    } finally {
      setBusyMember(null);
      setConfirmRemove(null);
    }
  }

  return (
    <AppShell
      title={`Gruppo di cura di ${patient.name}`}
      subtitle="Membri, ruoli, inviti e registro attività"
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link to="/pazienti/$id" params={{ id: patient.id }}>
            <ChevronLeft className="mr-1 size-4" /> Scheda paziente
          </Link>
        </Button>
      }
    >
      <div className="mx-auto max-w-5xl space-y-6">
        <MembersCard
          members={members}
          loading={loading}
          currentUserId={user?.id}
          isPrimary={isPrimary}
          busyMember={busyMember}
          editingRel={editingRel}
          relValue={relValue}
          onStartEditRel={(cg) => {
            setEditingRel(cg.id);
            setRelValue(cg.relationship || "");
          }}
          onCancelEditRel={() => {
            setEditingRel(null);
            setRelValue("");
          }}
          onChangeRel={setRelValue}
          onSaveRel={handleSaveRelationship}
          onPromote={(cg) => setConfirmPromote(cg)}
          onRemove={(cg) => setConfirmRemove(cg)}
        />

        {isPrimary && (
          <InvitesCard
            invites={activeInvites}
            creating={creating}
            onCreate={handleCreateInvite}
            onRevoke={handleRevoke}
          />
        )}

        <AuditLogCard
          logs={logs}
          loading={loading}
          hasMore={logsHasMore}
          loadingMore={loadingMore}
          onLoadMore={loadMoreLogs}
        />
      </div>

      <AlertDialog open={!!confirmRemove} onOpenChange={(o) => !o && setConfirmRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rimuovere dal gruppo?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRemove?.name} non potrà più vedere le terapie, ricevere notifiche o
              confermare dosi per {patient.name}. Potrai reinvitarlo generando un nuovo codice.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmRemove && handleRemove(confirmRemove)}
            >
              Rimuovi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmPromote} onOpenChange={(o) => !o && setConfirmPromote(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Promuovere a principale?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmPromote?.name} diventerà il caregiver principale e potrà modificare
              terapie, dosaggi e gestire il gruppo. Tu diventerai un caregiver secondario e non
              potrai più svolgere queste azioni finché un altro principale non ti riabiliterà.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmPromote && handlePromote(confirmPromote)}>
              Promuovi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

/* -------------------------------- MEMBRI -------------------------------- */

function MembersCard(props: {
  members: PatientCaregiver[];
  loading: boolean;
  currentUserId?: string;
  isPrimary: boolean;
  busyMember: string | null;
  editingRel: string | null;
  relValue: string;
  onStartEditRel: (cg: PatientCaregiver) => void;
  onCancelEditRel: () => void;
  onChangeRel: (v: string) => void;
  onSaveRel: (cgId: string) => void;
  onPromote: (cg: PatientCaregiver) => void;
  onRemove: (cg: PatientCaregiver) => void;
}) {
  const {
    members, loading, currentUserId, isPrimary, busyMember, editingRel, relValue,
    onStartEditRel, onCancelEditRel, onChangeRel, onSaveRel, onPromote, onRemove,
  } = props;

  return (
    <section className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
      <div className="flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-xl bg-primary-soft text-primary">
          <Users className="size-5" />
        </div>
        <div>
          <h2 className="text-xl font-black tracking-tight">Membri del gruppo</h2>
          <p className="text-sm text-muted-foreground">
            {members.length} {members.length === 1 ? "persona segue" : "persone seguono"} questo
            paziente. Il caregiver principale gestisce terapie e permessi.
          </p>
        </div>
      </div>

      <div className="mt-5">
        {loading && members.length === 0 ? (
          <p className="text-sm text-muted-foreground">Caricamento…</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun caregiver collegato.</p>
        ) : (
          <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60">
            {members.map((c) => {
              const isMe = currentUserId === c.id;
              const isEditing = editingRel === c.id;
              const busy = busyMember === c.id;
              return (
                <li
                  key={c.id}
                  className={cn(
                    "flex flex-wrap items-center gap-3 p-4 transition-colors",
                    isMe && "bg-primary-soft/20",
                  )}
                >
                  <div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-primary-soft font-bold text-primary">
                    {c.photo ? (
                      <img src={c.photo} alt="" className="size-full object-cover" />
                    ) : (
                      c.name.slice(0, 1).toUpperCase()
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-bold">{c.name}</p>
                      {isMe && (
                        <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                          Tu
                        </span>
                      )}
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest",
                          c.isPrimary
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {c.isPrimary ? (
                          <span className="inline-flex items-center gap-1">
                            <Crown className="size-3" /> Principale
                          </span>
                        ) : (
                          "Secondario"
                        )}
                      </span>
                    </div>

                    {isEditing ? (
                      <div className="mt-2 flex items-center gap-1.5">
                        <Input
                          value={relValue}
                          onChange={(e) => onChangeRel(e.target.value)}
                          placeholder="Es. Figlio, Coniuge, Badante…"
                          className="h-8 max-w-[220px] rounded-lg text-xs"
                          autoFocus
                          disabled={busy}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") onSaveRel(c.id);
                            if (e.key === "Escape") onCancelEditRel();
                          }}
                        />
                        <Button size="sm" onClick={() => onSaveRel(c.id)} disabled={busy}>
                          Salva
                        </Button>
                        <Button size="sm" variant="ghost" onClick={onCancelEditRel} disabled={busy}>
                          Annulla
                        </Button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => isMe && onStartEditRel(c)}
                        disabled={!isMe}
                        className={cn(
                          "mt-0.5 inline-flex items-center gap-1.5 text-xs",
                          isMe
                            ? "cursor-pointer text-primary hover:underline"
                            : "cursor-default text-muted-foreground",
                        )}
                      >
                        {c.relationship || c.relation || (isMe ? "Aggiungi la tua relazione…" : "Familiare")}
                        {isMe && <Pencil className="size-3" />}
                      </button>
                    )}
                  </div>

                  {isPrimary && !c.isPrimary && (
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onPromote(c)}
                        disabled={busy}
                        title="Promuovi a caregiver principale"
                      >
                        <Crown className="mr-1.5 size-3.5" /> Promuovi
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => onRemove(c)}
                        disabled={busy}
                        title="Rimuovi dal gruppo"
                      >
                        <UserMinus className="size-4" />
                      </Button>
                    </div>
                  )}
                  {isMe && !c.isPrimary && !isPrimary && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => onRemove(c)}
                      disabled={busy}
                    >
                      <UserMinus className="mr-1.5 size-3.5" /> Lascia
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-2xl bg-muted/40 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>
          <strong className="text-foreground">Ruoli:</strong> il{" "}
          <em>caregiver principale</em> può modificare terapie, dosaggi, scorte e gestire i membri.
          I <em>caregiver secondari</em> visualizzano tutto, ricevono notifiche e possono
          confermare le dosi, ma non modificare la terapia.
        </p>
      </div>
    </section>
  );
}

/* -------------------------------- INVITI -------------------------------- */

function InvitesCard(props: {
  invites: FamilyInvite[];
  creating: boolean;
  onCreate: () => void;
  onRevoke: (id: string) => void;
}) {
  const { invites, creating, onCreate, onRevoke } = props;
  return (
    <section className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-primary-soft text-primary">
            <KeyRound className="size-5" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight">Inviti attivi</h2>
            <p className="text-sm text-muted-foreground">
              Ogni codice vale 24 ore ed è utilizzabile una sola volta. Chi lo usa entra nel
              gruppo come caregiver secondario.
            </p>
          </div>
        </div>
        <Button onClick={onCreate} disabled={creating}>
          {creating ? <Loader2 className="mr-2 size-4 animate-spin" /> : <KeyRound className="mr-2 size-4" />}
          Genera codice
        </Button>
      </div>

      <div className="mt-5">
        {invites.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun codice attivo.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {invites.map((inv) => (
              <InviteRow key={inv.id} invite={inv} onRevoke={() => onRevoke(inv.id)} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function InviteRow({ invite, onRevoke }: { invite: FamilyInvite; onRevoke: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const shareUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/pazienti?invite=${invite.code}`;

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(shareUrl, { width: 220, margin: 1 })
      .then((d) => alive && setQr(d))
      .catch(() => alive && setQr(null));
    return () => { alive = false; };
  }, [shareUrl]);

  const expDiff = new Date(invite.expiresAt).getTime() - Date.now();
  const expLabel =
    expDiff <= 0
      ? "scaduto"
      : expDiff < 3600_000
        ? `scade fra ${Math.max(1, Math.round(expDiff / 60000))} min`
        : `scade fra ${Math.round(expDiff / 3600_000)} h`;

  return (
    <li className="flex gap-4 rounded-2xl border border-border/60 p-4">
      <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">
        {qr ? <img src={qr} alt="QR invito" className="size-full" /> : <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-2xl font-black tracking-widest">{invite.code}</p>
        <p className="text-xs text-muted-foreground">{expLabel}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(invite.code).then(
                () => toast.success("Codice copiato"),
                () => toast.error("Impossibile copiare"),
              );
            }}
          >
            <Copy className="mr-1 size-3.5" /> Codice
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(shareUrl).then(
                () => toast.success("Link copiato"),
                () => toast.error("Impossibile copiare"),
              );
            }}
          >
            <Copy className="mr-1 size-3.5" /> Link
          </Button>
          <Button size="sm" variant="ghost" onClick={onRevoke}>
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      </div>
    </li>
  );
}

/* ----------------------------- REGISTRO ATTIVITÀ ----------------------------- */

function AuditLogCard(props: {
  logs: AuditLogEntry[];
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  const { logs, loading, hasMore, loadingMore, onLoadMore } = props;
  return (
    <section className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
      <div className="flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-xl bg-primary-soft text-primary">
          <ScrollText className="size-5" />
        </div>
        <div>
          <h2 className="text-xl font-black tracking-tight">Registro attività</h2>
          <p className="text-sm text-muted-foreground">
            Ultime azioni svolte dai membri del gruppo. Trasparenza per evitare equivoci.
            Conservato per 90 giorni.
          </p>
        </div>
      </div>

      <div className="mt-5">
        {loading && logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Caricamento…</p>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border/60 p-8 text-center text-muted-foreground">
            <Pill className="size-6 opacity-40" />
            <p className="text-sm">
              Non risultano attività recenti. Le azioni compariranno qui man mano che i membri
              interagiscono con la scheda.
            </p>
          </div>
        ) : (
          <ol className="relative space-y-4 border-l-2 border-border/60 pl-5">
            {logs.map((l) => {
              const tone = actionTone(l.action);
              return (
                <li key={l.id} className="relative">
                  <span className="absolute -left-[26px] top-1.5 grid size-4 place-items-center rounded-full bg-background ring-2 ring-border">
                    <span className={cn("size-1.5 rounded-full", tone.className.replace("bg-", "bg-").split(" ")[0])} />
                  </span>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest", tone.className)}>
                      {tone.label}
                    </span>
                    <p className="text-sm">{l.summary}</p>
                    <span className="ml-auto text-xs text-muted-foreground">{relTime(l.createdAt)}</span>
                  </div>
                  {l.meta && Object.keys(l.meta).length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {Object.entries(l.meta as Record<string, [unknown, unknown]>).map(([k, v]) => {
                        const pair = Array.isArray(v) ? v : [null, v];
                        return (
                          <span key={k} className="mr-3">
                            <strong className="font-semibold text-foreground/80">{k}:</strong>{" "}
                            <span className="line-through opacity-60">{formatMeta(pair[0])}</span>{" "}
                            → {formatMeta(pair[1])}
                          </span>
                        );
                      })}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {hasMore && (
          <div className="mt-4 flex justify-center">
            <Button variant="outline" size="sm" onClick={onLoadMore} disabled={loadingMore}>
              {loadingMore && <Loader2 className="mr-2 size-4 animate-spin" />}
              Carica altre
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

function formatMeta(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "sì" : "no";
  return String(v);
}