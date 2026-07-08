import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertOctagon, AlertTriangle, Bell, Check, CheckCheck, Clock, Info, Package, PillIcon, XCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PatientShell } from "@/components/PatientShell";
import { Button } from "@/components/ui/button";
import { useFamilyMed } from "@/lib/store";
import type { Notification, NotificationKind } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/notifiche")({
  head: () => ({ meta: [{ title: "Notifiche — FamilyMed" }] }),
  component: NotificationsPage,
});

const KIND_META: Record<
  NotificationKind,
  { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }
> = {
  reminder: { label: "Promemoria", icon: Bell, tone: "bg-primary-soft text-primary" },
  reminder_pre: { label: "Promemoria pre", icon: Clock, tone: "bg-primary-soft text-primary" },
  due: { label: "È ora", icon: AlertOctagon, tone: "bg-warning/20 text-warning-foreground" },
  reminder_post: { label: "Promemoria post", icon: Clock, tone: "bg-warning/15 text-warning-foreground" },
  missed: { label: "Dose saltata", icon: AlertTriangle, tone: "bg-destructive/15 text-destructive" },
  taken: { label: "Confermata", icon: Check, tone: "bg-success/15 text-success" },
  snoozed: { label: "Rimandata", icon: Clock, tone: "bg-warning/15 text-warning-foreground" },
  skipped: { label: "Rifiutata", icon: XCircle, tone: "bg-destructive/10 text-destructive" },
  low_stock: { label: "Scorta bassa", icon: Package, tone: "bg-orange-100 text-orange-800" },
  info: { label: "Info", icon: Info, tone: "bg-secondary text-muted-foreground" },
};

const CAREGIVER_FILTERS: Array<{ id: "all" | "missed" | "taken" | "action" | "reminder" | "stock"; label: string }> = [
  { id: "all", label: "Tutte" },
  { id: "reminder", label: "Promemoria" },
  { id: "taken", label: "Confermate" },
  { id: "missed", label: "Saltate" },
  { id: "action", label: "Azioni paziente" },
  { id: "stock", label: "Scorte" },
];

const PATIENT_FILTERS: Array<{ id: "all" | "reminder" | "taken" | "missed"; label: string }> = [
  { id: "all", label: "Tutte" },
  { id: "reminder", label: "Promemoria" },
  { id: "taken", label: "Confermate" },
  { id: "missed", label: "Saltate" },
];

function NotificationsPage() {
  const { data, user, userProfile, markNotificationRead, markAllRead } = useFamilyMed();
  const isPatient = userProfile?.role === "paziente";

  const patient = isPatient
    ? (user && data.patients.find((p) => p.userId === user.id)) ??
      data.patients.find((p) => p.id === data.currentPatientId) ??
      data.patients[0]
    : undefined;

  const items = useMemo(() => {
    const base = isPatient
      ? data.notifications.filter((n) => !n.patientId || (patient && n.patientId === patient.id))
      : data.notifications;
    return [...base].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [data.notifications, isPatient, patient]);

  const unread = items.filter((n) => !n.read).length;

  if (isPatient) {
    return (
      <PatientShell title="Le tue notifiche" subtitle={`${unread} non lette · ${items.length} totali`}>
        <PatientView
          items={items}
          markRead={markNotificationRead}
          markAllRead={markAllRead}
          unread={unread}
        />
      </PatientShell>
    );
  }

  return (
    <AppShell
      title="Centro notifiche"
      subtitle={`${unread} non lette · ${items.length} totali`}
      actions={
        <Button size="sm" variant="outline" onClick={markAllRead} disabled={unread === 0}>
          <CheckCheck className="mr-2 size-4" /> Segna tutte lette
        </Button>
      }
    >
      <CaregiverView items={items} data={data} markRead={markNotificationRead} />
    </AppShell>
  );
}

function PatientView({
  items,
  markRead,
  markAllRead,
  unread,
}: {
  items: Notification[];
  markRead: (id: string) => void;
  markAllRead: () => void;
  unread: number;
}) {
  const [filter, setFilter] = useState<(typeof PATIENT_FILTERS)[number]["id"]>("all");

  const filtered = items.filter((n) => {
    if (filter === "all") return true;
    if (filter === "reminder") return n.kind === "reminder" || n.kind === "reminder_pre" || n.kind === "reminder_post" || n.kind === "due";
    if (filter === "taken") return n.kind === "taken";
    if (filter === "missed") return n.kind === "missed" || n.kind === "skipped" || n.kind === "snoozed";
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {PATIENT_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition",
              filter === f.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-secondary",
            )}
          >
            {f.label}
          </button>
        ))}
        <Button
          size="sm"
          variant="outline"
          onClick={markAllRead}
          disabled={unread === 0}
          className="ml-auto"
        >
          <CheckCheck className="mr-2 size-4" /> Segna tutte lette
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Nessuna notifica"
          message="Qui vedrai i promemoria dei tuoi farmaci e le conferme."
        />
      ) : (
        <ol className="space-y-3">
          {filtered.map((n) => {
            const meta = KIND_META[n.kind] ?? KIND_META.info;
            const Icon = meta.icon;
            return (
              <li
                key={n.id}
                className={cn(
                  "flex items-start gap-4 rounded-2xl border-2 bg-card p-4 shadow-sm",
                  !n.read ? "border-primary/60 bg-primary-soft/20" : "border-border/60",
                )}
              >
                <div className={cn("grid size-14 shrink-0 place-items-center rounded-xl", meta.tone)}>
                  <Icon className="size-7" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    {meta.label}
                  </p>
                  <p className="mt-0.5 text-lg font-black leading-tight">{n.title}</p>
                  {n.message && (
                    <p className="mt-1 text-sm text-muted-foreground">{n.message}</p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    {new Date(n.createdAt).toLocaleString("it-IT", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                {!n.read && (
                  <button
                    onClick={() => markRead(n.id)}
                    className="shrink-0 rounded-lg border border-primary/40 px-3 py-1 text-xs font-bold text-primary hover:bg-primary-soft"
                  >
                    Segna letta
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function CaregiverView({
  items,
  data,
  markRead,
}: {
  items: Notification[];
  data: ReturnType<typeof useFamilyMed>["data"];
  markRead: (id: string) => void;
}) {
  const [filter, setFilter] = useState<(typeof CAREGIVER_FILTERS)[number]["id"]>("all");
  const [patientFilter, setPatientFilter] = useState<string>("");

  const filtered = items.filter((n) => {
    if (patientFilter && n.patientId !== patientFilter) return false;
    if (filter === "all") return true;
    if (filter === "missed") return n.kind === "missed" || n.kind === "low_stock";
    if (filter === "taken") return n.kind === "taken";
    if (filter === "action")
      return n.kind === "skipped" || n.kind === "snoozed" || n.kind === "taken";
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {CAREGIVER_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition",
              filter === f.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-secondary",
            )}
          >
            {f.label}
          </button>
        ))}
        {data.patients.length > 0 && (
          <select
            value={patientFilter}
            onChange={(e) => setPatientFilter(e.target.value)}
            className="ml-auto rounded-full border border-border bg-card px-4 py-1.5 text-xs font-bold text-foreground"
          >
            <option value="">Tutti i pazienti</option>
            {data.patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="rounded-3xl border border-border/60 bg-card shadow-card">
        <ul className="divide-y divide-border/60">
          {filtered.length === 0 && (
            <li className="p-8 text-center text-sm text-muted-foreground">
              Nessuna notifica con questo filtro.
            </li>
          )}
          {filtered.map((n) => {
            const patient = data.patients.find((p) => p.id === n.patientId);
            const meta = KIND_META[n.kind] ?? KIND_META.info;
            const Icon = meta.icon;
            return (
              <li
                key={n.id}
                className={cn(
                  "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 p-5 transition",
                  !n.read && "bg-primary-soft/30",
                )}
              >
                <div className={cn("grid size-11 shrink-0 place-items-center rounded-xl", meta.tone)}>
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {meta.label}
                    </span>
                    {patient && (
                      <Link
                        to="/pazienti/$id"
                        params={{ id: patient.id }}
                        className="text-xs font-bold text-primary hover:underline"
                      >
                        {patient.name}
                      </Link>
                    )}
                  </div>
                  <p className="mt-1 truncate font-bold">{n.title}</p>
                  {n.message && (
                    <p className="truncate text-sm text-muted-foreground">{n.message}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-muted-foreground">
                    {new Date(n.createdAt).toLocaleTimeString("it-IT", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  {!n.read && (
                    <button
                      onClick={() => markRead(n.id)}
                      className="mt-1 text-xs font-semibold text-primary hover:underline"
                    >
                      Segna letta
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-border/60 bg-card p-12 text-center">
      <PillIcon className="mx-auto size-10 text-muted-foreground" />
      <p className="mt-4 text-lg font-black">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
