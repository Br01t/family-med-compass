import { useEffect, useState } from "react";
import { useFamilyMed } from "@/lib/store";
import { OnboardingTour, hasSeenOnboarding, type OnboardingRole } from "./OnboardingTour";

/**
 * Mount once inside the authenticated app tree. On first login for the current
 * role, opens the guided tour automatically. Dismissible.
 */
export function OnboardingAutoStart() {
  const { user, userProfile, loadingAuth } = useFamilyMed();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<OnboardingRole>("caregiver");

  useEffect(() => {
    if (loadingAuth || !user || !userProfile) return;
    const r: OnboardingRole = userProfile.role === "paziente" ? "paziente" : "caregiver";
    if (!hasSeenOnboarding(r)) {
      setRole(r);
      // Small delay so the user sees the page first, then the tour opens.
      const t = setTimeout(() => setOpen(true), 600);
      return () => clearTimeout(t);
    }
  }, [loadingAuth, user, userProfile]);

  if (!user || !userProfile) return null;
  return <OnboardingTour open={open} onOpenChange={setOpen} role={role} />;
}
