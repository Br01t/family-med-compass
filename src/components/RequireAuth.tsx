import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useFamilyMed } from "@/lib/store";
import { type Role } from "@/lib/mock-data";

/**
 * Protegge una rotta: se l'autenticazione è ancora in corso mostra un loader,
 * se l'utente non è autenticato lo rimanda a /login, e se `role` è indicato
 * ma non corrisponde al ruolo del profilo, lo rimanda alla sua area corretta.
 */
export function RequireAuth({
  children,
  role,
}: {
  children: ReactNode;
  role?: Role;
}) {
  const { user, userProfile, loadingAuth } = useFamilyMed();
  const navigate = useNavigate();

  useEffect(() => {
    if (loadingAuth) return;
    if (!user || !userProfile) {
      navigate({ to: "/login" });
      return;
    }
    if (role && userProfile.role !== role) {
      navigate({ to: userProfile.role === "paziente" ? "/paziente" : "/caregiver" });
    }
  }, [loadingAuth, user, userProfile, role, navigate]);

  if (loadingAuth || !user || !userProfile || (role && userProfile.role !== role)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Caricamento...</p>
      </div>
    );
  }

  return <>{children}</>;
}