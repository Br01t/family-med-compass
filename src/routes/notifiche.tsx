import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Bell, CheckCheck, Info } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useFamilyMed } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/notifiche")({
  head: () => ({ meta: [{ title: "Notifiche — FamilyMed" }] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { data, markNotificationRead, markAllRead } = useFamilyMed();
  const items = [...data.notifications].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const unread = items.filter((n) => !n.read).length;

  return (
    <AppShell
      title="Centro notifiche"
      subtitle={`${unread} non lette`}
      actions={
        <Button size="sm" variant="outline" onClick={markAllRead} disabled={unread === 0}>
          <CheckCheck className="mr-2 size-4" /> Segna tutte lette
        </Button>
      }
    >
      <div className="rounded-3xl border border-border/60 bg-card shadow-card">
        <ul className="divide-y divide-border/60">
          {items.length === 0 && (
            <li className="p-8 text-center text-sm text-muted-foreground">
              Nessuna notifica.
            </li>
          )}
          {items.map((n) => {
            const patient = data.patients.find((p) => p.id === n.patientId);
            const Icon =
              n.severity === "alert"
                ? AlertTriangle
                : n.severity === "warning"
                  ? Bell
                  : Info;
            const tone =
              n.severity === "alert"
                ? "bg-accent-soft text-accent"
                : n.severity === "warning"
                  ? "bg-warning/15 text-warning-foreground"
                  : "bg-primary-soft text-primary";
            return (
              <li
                key={n.id}
                className={cn(
                  "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 p-5 transition",
                  !n.read && "bg-primary-soft/30",
                )}
              >
                <div className={cn("grid size-11 shrink-0 place-items-center rounded-xl", tone)}>
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-bold">{n.title}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {n.message}
                    {patient && ` · ${patient.name}`}
                  </p>
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
                      onClick={() => markNotificationRead(n.id)}
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
    </AppShell>
  );
}
