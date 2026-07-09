import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertOctagon, AlertTriangle, Bell, Check, Clock, Info, Package, PillIcon, XCircle } from "lucide-react";
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
  final_due: { label: "Ultima chiamata", icon: AlertOctagon, tone: "bg-accent/20 text-accent" },
  missed: { label: "Dimenticata", icon: AlertTriangle, tone: "bg-destructive/15 text-destructive" },
  taken: { label: "Confermata", icon: Check, tone: "bg-success/15 text-success" },
  taken_after_snooze: { label: "Confermata dopo rimando", icon: Check, tone: "bg-success/15 text-success" },
  snoozed: { label: "Rimandata", icon: Clock, tone: "bg-warning/15 text-warning-foreground" },
  skipped: { label: "Rifiutata", icon: XCircle, tone: "bg-destructive/10 text-destructive" },
  low_stock: { label: "Scorta bassa", icon: Package, tone: "bg-orange-100 text-orange-800" },
  info: { label: "Info", icon: Info, tone: "bg-secondary text-muted-foreground" },
};

function NotificationsPage() {
  const {
    data,
    user,
    userProfile,
    markNotificationRead,
  } = useFamilyMed();
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

  // Auto-mark come lette all'apertura: le notifiche viste non devono essere
  // riproposte al prossimo mount o su altri dispositivi.
  useEffect(() => {
    if (!user) return;
    const unread = items.filter(
      (n) => !n.read && (!n.targetUserId || n.targetUserId === user.id),
    );
    for (const n of unread) {
      void markNotificationRead(n.id);
    }
  }, [user, items, markNotificationRead]);

  if (isPatient) {
    return (
      <PatientShell title="Storico notifiche" subtitle="Le azioni recenti sulle tue terapie">
        <NotificationList items={items} data={data} />
      </PatientShell>
    );
  }

  return (
    <AppShell
      title="Centro notifiche"
      subtitle="Le azioni recenti dei tuoi pazienti"
    >
      <CaregiverView items={items} data={data} />
    </AppShell>
  );
}

function NotificationList({
  items,
  data,
}: {
  items: Notification[];
  data: ReturnType<typeof useFamilyMed>["data"];
}) {
  const [showAll, setShowAll] = useState(false);
  // Di default nasconde tutto ciò che era già read prima dell'apertura di questa
  // sessione (in pratica: nulla è "nuovo" perché al mount marchiamo tutte lette).
  // Il toggle mostra l'intero storico.
  const [initialUnreadIds] = useState(() => new Set(items.filter((n) => !n.read).map((n) => n.id)));
  const filtered = showAll ? items : items.filter((n) => initialUnreadIds.has(n.id));

  if (filtered.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState
          title={showAll ? "Nessuna notifica" : "Tutto letto"}
          message={
            showAll
              ? "Non è ancora arrivata nessuna notifica."
              : "Non ci sono nuove notifiche da vedere."
          }
        />
        {!showAll && items.length > 0 && (
          <div className="flex justify-center">
            <Button variant="outline" size="sm" onClick={() => setShowAll(true)}>
              Mostra storico ({items.length})
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ol className="space-y-3">
        {filtered.map((n) => {
          const meta = KIND_META[n.kind] ?? KIND_META.info;
          const Icon = meta.icon;
          return (
            <li
              key={n.id}
              className="flex items-start gap-4 rounded-2xl border border-border/60 bg-card p-4 shadow-sm"
            >
              <div className={cn("grid size-12 shrink-0 place-items-center rounded-xl", meta.tone)}>
                <Icon className="size-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  {meta.label}
                </p>
                <p className="mt-0.5 text-base font-black leading-tight">{n.title}</p>
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
            </li>
          );
        })}
      </ol>
      {!showAll && items.length > filtered.length && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => setShowAll(true)}>
            Mostra storico ({items.length - filtered.length} più vecchie)
          </Button>
        </div>
      )}
      {showAll && (
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => setShowAll(false)}>
            Nascondi lo storico
          </Button>
        </div>
      )}
    </div>
  );
}

function CaregiverView({
  items,
  data,
}: {
  items: Notification[];
  data: ReturnType<typeof useFamilyMed>["data"];
}) {
  const [patientFilter, setPatientFilter] = useState<string>("");
  const [showAll, setShowAll] = useState(false);
  const [initialUnreadIds] = useState(() => new Set(items.filter((n) => !n.read).map((n) => n.id)));

  const filtered = items.filter((n) => {
    if (patientFilter && n.patientId !== patientFilter) return false;
    if (!showAll && !initialUnreadIds.has(n.id)) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {data.patients.length > 0 && (
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
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowAll((v) => !v)}
          className="ml-auto"
        >
          {showAll ? "Solo nuove" : `Mostra storico (${items.length})`}
        </Button>
      </div>

      <div className="rounded-3xl border border-border/60 bg-card shadow-card">
        <ul className="divide-y divide-border/60">
          {filtered.length === 0 && (
            <li className="p-8 text-center text-sm text-muted-foreground">
              {showAll
                ? "Nessuna notifica con questo filtro."
                : "Nessuna nuova notifica. Tutte le azioni recenti sono già state viste."}
            </li>
          )}
          {filtered.map((n) => {
            const patient = data.patients.find((p) => p.id === n.patientId);
            const meta = KIND_META[n.kind] ?? KIND_META.info;
            const Icon = meta.icon;
            return (
              <li
                key={n.id}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 p-5"
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
                    {new Date(n.createdAt).toLocaleString("it-IT", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
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
