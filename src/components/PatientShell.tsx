import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ArrowLeft, Bell, LogOut, Pill } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFamilyMed } from "@/lib/store";

/**
 * Shell mobile-first dedicato al paziente.
 * Non usa la sidebar del caregiver: header semplice con back, titolo, notifiche e logout.
 */
export function PatientShell({
  title,
  subtitle,
  children,
  backTo = "/paziente",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  backTo?: string;
}) {
  const navigate = useNavigate();
  const { data, user, logout } = useFamilyMed();

  const patient =
    (user && data?.patients?.find((p) => p.userId === user.id)) ??
    data?.patients?.find((p) => p.id === data.currentPatientId) ??
    data?.patients?.[0];

  const unreadCount = data.notifications.filter(
    (n) => !n.read && (!n.patientId || !patient || n.patientId === patient.id),
  ).length;

  const handleLogout = async () => {
    await logout();
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-xl items-center justify-between px-5 pt-5">
        <Link to={backTo} className="flex items-center gap-2 font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-5" />
          <span className="text-sm">Indietro</span>
        </Link>
        <Link to="/paziente" className="flex items-center gap-2 font-black tracking-tight">
          <span className="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Pill className="size-4" />
          </span>
          FamilyMed
        </Link>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" asChild aria-label="Notifiche">
            <Link to="/notifiche" className="relative">
              <Bell className="size-5" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
          </Button>
          <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Esci">
            <LogOut className="size-5" />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-5 pb-24 pt-6">
        <div className="mb-6">
          <h1 className="text-4xl font-black tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {children}
      </main>
    </div>
  );
}
