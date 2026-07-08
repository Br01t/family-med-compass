import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Bell, Home, LogOut, Pill, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFamilyMed } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useAppBadge } from "@/hooks/use-app-badge";
import { useNotificationToasts } from "@/hooks/use-notification-toasts";

/**
 * Shell mobile-first dedicato al paziente.
 * Header semplice + bottom nav con SOLO le sezioni destinate al paziente
 * (nessuna voce del caregiver). Nessuna sidebar.
 */
const PATIENT_NAV = [
  { to: "/paziente", label: "Home", icon: Home },
  { to: "/le-mie-terapie", label: "Terapie", icon: Pill },
  { to: "/notifiche", label: "Notifiche", icon: Bell },
  { to: "/impostazioni", label: "Account", icon: Settings },
] as const;

export function PatientShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const { data, user, logout } = useFamilyMed();
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  const patient =
    (user && data?.patients?.find((p) => p.userId === user.id)) ??
    data?.patients?.find((p) => p.id === data.currentPatientId) ??
    data?.patients?.[0];

  const unreadCount = data.notifications.filter(
    (n) =>
      !n.read &&
      (!n.targetUserId || n.targetUserId === user?.id) &&
      (!n.patientId || !patient || n.patientId === patient.id),
  ).length;

  useAppBadge(unreadCount);
  useNotificationToasts(data.notifications);

  const handleLogout = async () => {
    await logout();
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="mx-auto flex max-w-xl items-center justify-between px-5 pt-5">
        <Link to="/paziente" className="flex items-center gap-2 font-black tracking-tight">
          <span className="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Pill className="size-4" />
          </span>
          FamilyMed
        </Link>
        <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Esci">
          <LogOut className="size-5" />
        </Button>
      </header>

      <main className="mx-auto max-w-xl px-5 pt-6">
        <div className="mb-6">
          <h1 className="text-4xl font-black tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {children}
      </main>

      {/* Bottom nav: solo sezioni per il paziente */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-border/60 bg-background/95 backdrop-blur">
        <ul className="mx-auto grid max-w-xl grid-cols-4">
          {PATIENT_NAV.map((item) => {
            const active =
              item.to === "/paziente"
                ? pathname === "/paziente"
                : pathname.startsWith(item.to);
            const Icon = item.icon;
            const showBadge = item.to === "/notifiche" && unreadCount > 0;
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={cn(
                    "relative flex flex-col items-center gap-1 py-3 text-[11px] font-semibold transition",
                    active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-5" />
                  <span>{item.label}</span>
                  {showBadge && (
                    <span className="absolute right-[calc(50%-18px)] top-2 grid size-4 place-items-center rounded-full bg-accent text-[9px] font-bold text-accent-foreground">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
