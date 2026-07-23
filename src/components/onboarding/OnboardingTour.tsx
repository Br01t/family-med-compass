import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { caregiverSteps, patientSteps, type TourStep } from "./tour-steps";

export type OnboardingRole = "caregiver" | "paziente";

const DONE_KEY = (role: OnboardingRole) => `familymed:onboarding:${role}:done`;
const SKIP_KEY = (role: OnboardingRole) => `familymed:onboarding:${role}:skip`;

export function hasSeenOnboarding(role: OnboardingRole): boolean {
  if (typeof window === "undefined") return true;
  return (
    localStorage.getItem(DONE_KEY(role)) === "1" ||
    localStorage.getItem(SKIP_KEY(role)) === "1"
  );
}

export function markOnboardingSeen(role: OnboardingRole) {
  if (typeof window === "undefined") return;
  localStorage.setItem(DONE_KEY(role), "1");
}

export function resetOnboarding(role: OnboardingRole) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(DONE_KEY(role));
  localStorage.removeItem(SKIP_KEY(role));
}

export function OnboardingTour({
  open,
  onOpenChange,
  role,
  allowNavigation = true,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  role: OnboardingRole;
  /** If false, hides the "Vai a…" deep-link buttons (used pre-login). */
  allowNavigation?: boolean;
}) {
  const navigate = useNavigate();
  const steps: TourStep[] = role === "caregiver" ? caregiverSteps : patientSteps;
  const [i, setI] = useState(0);

  useEffect(() => {
    if (open) setI(0);
  }, [open]);

  const step = steps[i];
  const isLast = i === steps.length - 1;

  const handleClose = (persist: "done" | "skip" | "none") => {
    if (persist === "done") localStorage.setItem(DONE_KEY(role), "1");
    if (persist === "skip") localStorage.setItem(SKIP_KEY(role), "1");
    onOpenChange(false);
  };

  const handleJump = () => {
    if (!step.cta) return;
    localStorage.setItem(DONE_KEY(role), "1");
    onOpenChange(false);
    navigate({ to: step.cta.to });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : handleClose("none"))}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-2">
          <div className="flex items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lift">
              {step.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {role === "caregiver" ? "Tour caregiver" : "Tour paziente"} · {i + 1}/{steps.length}
              </p>
              <DialogTitle className="text-lg font-black tracking-tight leading-tight">
                {step.title}
              </DialogTitle>
            </div>
            <button
              type="button"
              onClick={() => handleClose("none")}
              className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Chiudi"
            >
              <X className="size-4" />
            </button>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="px-6 pb-4 pt-2 space-y-4">
          <DialogDescription asChild>
            <p className="text-sm leading-relaxed text-foreground/80">{step.body}</p>
          </DialogDescription>
          {step.demo && <div>{step.demo}</div>}
          {allowNavigation && step.cta && (
            <Button onClick={handleJump} className="w-full h-11 font-bold">
              {step.cta.label} →
            </Button>
          )}
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 px-6 pb-3">
          {steps.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setI(idx)}
              aria-label={`Vai al passo ${idx + 1}`}
              className={cn(
                "h-1.5 rounded-full transition-all",
                idx === i ? "w-6 bg-primary" : "w-1.5 bg-muted",
              )}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-border/60 bg-surface-muted/40 px-4 py-3">
          <button
            type="button"
            onClick={() => handleClose("skip")}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            Non mostrare più
          </button>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setI((v) => Math.max(0, v - 1))}
              disabled={i === 0}
            >
              <ArrowLeft className="size-4" />
            </Button>
            {isLast ? (
              <Button size="sm" onClick={() => handleClose("done")} className="font-bold">
                Ho capito
              </Button>
            ) : (
              <Button size="sm" onClick={() => setI((v) => v + 1)} className="font-bold">
                Avanti <ArrowRight className="ml-1 size-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
