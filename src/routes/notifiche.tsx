import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertOctagon,
  AlertTriangle,
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  Package,
  PillIcon,
  XCircle,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PatientShell } from "@/components/PatientShell";
import { Button } from "@/components/ui/button";
import { useFamilyMed } from "@/lib/store";
import { fetchNotificationsPage } from "@/lib/supabase-service";
import type { Notification, NotificationKind } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/notifiche")({
  head: () => ({ meta: [{ title: "Notifiche — FamilyMed" }] }),
  component: NotificationsPage,
});

const PAGE_SIZE = 20;

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
  const { data, user, userProfile, markNotificationRead } = useFamilyMed();
  const isPatient = userProfile?.role === "paziente";

  const patient = isPatient
    ? (user && data.patients.find((p) => p.userId === user.id)) ??
      data.patients.find((p) => p.id === data.currentPatientId) ??
      data.patients[0]
    : undefined;

  const [patientFilter, setPatientFilter] = useState<string>("");
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Reset alla pagina 0 quando cambia il filtro
  useEffect(() => {
    setPage(0);
  }, [patientFilter]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const res = await fetchNotificationsPage(user.id, page, PAGE_SIZE, {
      patientId: isPatient
        ? patient?.id ?? null
        : patientFilter || null,
    });
    setItems(res.items);
    setTotal(res.total);
    setLoading(false);
  }, [user, page, patientFilter, isPatient, patient?.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-mark come lette solo le notifiche della pagina visualizzata
  useEffect(() => {
    if (!user) return;
    const unread = items.filter((n) => !n.read);
    for (const n of unread) void markNotificationRead(n.id);
  }, [items, user, markNotificationRead]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (isPatient) {
    return (
      <PatientShell title="Storico notifiche" subtitle="Le azioni recenti sulle tue terapie">
        <NotificationList
          items={items}
          loading={loading}
          page={page}
          totalPages={totalPages}
          total={total}
          onPage={setPage}
        />
      </PatientShell>
    );
  }

  return (
    <AppShell title="Centro notifiche" subtitle="Le azioni recenti dei tuoi pazienti">
      <CaregiverView
        items={items}
        data={data}
        loading={loading}
        page={page}
        totalPages={totalPages}
        total={total}
        patientFilter={patientFilter}
        onFilterChange={setPatientFilter}
        onPage={setPage}
      />
    </AppShell>
  );
}

function Pagination({
  page,
  totalPages,
  total,
  onPage,
  loading,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (p: number) => void;
  loading: boolean;
}) {
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between gap-2 pt-2">
      <p className="text-xs text-muted-foreground">
        {total} notifiche — pagina {page + 1} di {totalPages}
      </p>
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="outline"
          disabled={loading || page === 0}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={loading || page >= totalPages - 1}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function NotificationList({
  items,
  loading,
  page,
  totalPages,
  total,
  onPage,
}: {
  items: Notification[];
  loading: boolean;
  page: number;
  totalPages: number;
  total: number;
  onPage: (p: number) => void;
}) {
  if (loading && items.length === 0) {
    return <EmptyState title="Caricamento…" message="Attendi qualche istante." />;
  }
  if (items.length === 0) {
    return <EmptyState title="Nessuna notifica" message="Non è ancora arrivata nessuna notifica." />;
  }

  return (
    <div className="space-y-4">
      <ol className="space-y-3">
        {items.map((n) => {
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
      <Pagination page={page} totalPages={totalPages} total={total} onPage={onPage} loading={loading} />
    </div>
  );
}

function CaregiverView({
  items,
  data,
  loading,
  page,
  totalPages,
  total,
  patientFilter,
  onFilterChange,
  onPage,
}: {
  items: Notification[];
  data: ReturnType<typeof useFamilyMed>["data"];
  loading: boolean;
  page: number;
  totalPages: number;
  total: number;
  patientFilter: string;
  onFilterChange: (v: string) => void;
  onPage: (p: number) => void;
}) {
  const patientsOptions = useMemo(() => data.patients, [data.patients]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {patientsOptions.length > 0 && (
          <select
            value={patientFilter}
            onChange={(e) => onFilterChange(e.target.value)}
            className="rounded-full border border-border bg-card px-4 py-1.5 text-xs font-bold text-foreground"
          >
            <option value="">Tutti i pazienti</option>
            {patientsOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="rounded-3xl border border-border/60 bg-card shadow-card">
        <ul className="divide-y divide-border/60">
          {loading && items.length === 0 && (
            <li className="p-8 text-center text-sm text-muted-foreground">Caricamento…</li>
          )}
          {!loading && items.length === 0 && (
            <li className="p-8 text-center text-sm text-muted-foreground">
              Nessuna notifica con questo filtro.
            </li>
          )}
          {items.map((n) => {
            const patient = data.patients.find((p) => p.id === n.patientId);
            const meta = KIND_META[n.kind] ?? KIND_META.info;
            const Icon = meta.icon;
            return (
              <li
                key={n.id}
                className="flex flex-col gap-3 p-5 sm:grid sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start sm:gap-4"
              >
                <div className="flex items-start gap-4 sm:contents">
                  <div className={cn("grid size-11 shrink-0 place-items-center rounded-xl", meta.tone)}>
                    <Icon className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
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
                    <p className="mt-1 whitespace-normal break-words font-bold">{n.title}</p>
                    {n.message && (
                      <p className="whitespace-normal break-words text-sm text-muted-foreground">
                        {n.message}
                      </p>
                    )}
                  </div>
                </div>
                <div className="shrink-0 pl-15 text-left sm:pl-0 sm:text-right">
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

      <Pagination page={page} totalPages={totalPages} total={total} onPage={onPage} loading={loading} />
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
