import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Pill, AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFamilyMed } from "@/lib/store";
import { getUserProfile, signInUser, formatAuthError } from "@/lib/auth-service";
import { FeedbackDialog } from "@/components/FeedbackDialog";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Accedi — FamilyMed" }] }),
  component: LoginPage,
});

/** Delay progressivo per tentativi falliti: 0, 1, 2, 4, 8 secondi */
const BACKOFF_DELAYS_S = [0, 1, 2, 4, 8];
/** Lockout dopo questo numero di tentativi falliti */
const LOCKOUT_AFTER = 5;
/** Durata lockout in secondi */
const LOCKOUT_DURATION_S = 300; // 5 minuti
/** Rate limit reset password: secondi minimi tra 2 richieste per email */
const RESET_COOLDOWN_S = 60;

function LoginPage() {
  const { user, userProfile, loadingAuth } = useFamilyMed();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState("");
  const [dialogDescription, setDialogDescription] = useState("");
  const [dialogVariant, setDialogVariant] = useState<"success" | "error" | "info">("info");

  // --- Rate limiting state ---
  const failedAttempts = useRef(0);
  const lockedUntil = useRef<number | null>(null);
  const [lockoutSecondsLeft, setLockoutSecondsLeft] = useState(0);
  const [backoffSecondsLeft, setBackoffSecondsLeft] = useState(0);
  const lockoutTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- Reset password rate limit ---
  const lastResetRequest = useRef<Record<string, number>>({});

  // Countdown timer per lockout e backoff
  useEffect(() => {
    if (lockoutSecondsLeft <= 0 && backoffSecondsLeft <= 0) return;
    const interval = setInterval(() => {
      setLockoutSecondsLeft((s) => Math.max(0, s - 1));
      setBackoffSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutSecondsLeft, backoffSecondsLeft]);

  useEffect(() => {
    return () => {
      if (lockoutTimer.current) clearInterval(lockoutTimer.current);
    };
  }, []);

  function isLocked(): boolean {
    if (lockedUntil.current === null) return false;
    if (Date.now() < lockedUntil.current) return true;
    // Lockout scaduto: reset
    lockedUntil.current = null;
    failedAttempts.current = 0;
    return false;
  }

  function formatSeconds(s: number): string {
    if (s >= 60) return `${Math.ceil(s / 60)} min`;
    return `${s} sec`;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Controlla lockout
    if (isLocked()) {
      const remaining = Math.ceil((lockedUntil.current! - Date.now()) / 1000);
      setLockoutSecondsLeft(remaining);
      return;
    }

    // Controlla backoff progressivo
    if (backoffSecondsLeft > 0) return;

    setSubmitting(true);

    try {
      const user = await signInUser({ email, password });

      if (!user) {
        setDialogVariant("error");
        setDialogTitle("Accesso non completato");
        setDialogDescription(
          "Impossibile completare l'accesso. Verifica la tua email e conferma l'account se necessario.",
        );
        setDialogOpen(true);
        return;
      }

      // Login riuscito: reset contatori
      failedAttempts.current = 0;
      lockedUntil.current = null;

      const fallbackRole =
        typeof user.user_metadata === "object" && user.user_metadata !== null
          ? (user.user_metadata as Record<string, unknown>).role
          : undefined;

      const profile = await getUserProfile(user.id);
      const role =
        profile?.role === "paziente" || profile?.role === "caregiver"
          ? profile.role
          : fallbackRole === "paziente" || fallbackRole === "caregiver"
            ? fallbackRole
            : undefined;

      setDialogVariant("success");
      setDialogTitle("Accesso effettuato");
      setDialogDescription("Bentornato! Stiamo aprendo la tua area personale.");
      setDialogOpen(true);

      if (role === "paziente" || role === "caregiver") {
        navigate({
          to: role === "paziente" ? "/paziente" : "/caregiver",
          replace: true,
        });
        return;
      }

      setDialogDescription(
        "Accesso riuscito, ma non è stato possibile determinare il ruolo. Contatta l'assistenza.",
      );
      setDialogVariant("error");
      setDialogOpen(true);
    } catch (error: unknown) {
      // Incrementa contatore tentativi falliti
      failedAttempts.current += 1;
      const attempts = failedAttempts.current;

      if (attempts >= LOCKOUT_AFTER) {
        // Lockout completo
        lockedUntil.current = Date.now() + LOCKOUT_DURATION_S * 1000;
        setLockoutSecondsLeft(LOCKOUT_DURATION_S);
        setDialogVariant("error");
        setDialogTitle("Accesso bloccato temporaneamente");
        setDialogDescription(
          `Troppi tentativi falliti. Riprova tra ${formatSeconds(LOCKOUT_DURATION_S)}.`,
        );
        setDialogOpen(true);
      } else {
        // Backoff progressivo
        const delayS = BACKOFF_DELAYS_S[Math.min(attempts, BACKOFF_DELAYS_S.length - 1)];
        if (delayS > 0) setBackoffSecondsLeft(delayS);

        const remaining = LOCKOUT_AFTER - attempts;
        const errMsg = formatAuthError(error);
        setDialogVariant("error");
        setDialogTitle("Impossibile accedere");
        setDialogDescription(
          remaining <= 2
            ? `${errMsg} — Attenzione: dopo ancora ${remaining} tentativo/i l'accesso verrà bloccato per ${formatSeconds(LOCKOUT_DURATION_S)}.`
            : errMsg,
        );
        setDialogOpen(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const isBlocked = isLocked() || lockoutSecondsLeft > 0;
  const isThrottled = backoffSecondsLeft > 0;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Link
            to="/"
            className="mb-4 grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lift"
          >
            <Pill className="size-6" />
          </Link>

          <h1 className="text-2xl font-black tracking-tight">Bentornato su FamilyMed</h1>

          <p className="mt-1 text-sm text-muted-foreground">
            Accedi con le tue credenziali per continuare.
          </p>
        </div>

        {isBlocked && (
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <Clock className="mt-0.5 size-4 shrink-0" />
            <p>
              <strong>Accesso bloccato.</strong> Troppi tentativi falliti.{" "}
              Riprova tra <strong>{formatSeconds(lockoutSecondsLeft)}</strong>.
            </p>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-3xl border border-border/60 bg-card p-6 shadow-card"
        >
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="nome@esempio.it"
              className="mt-1 text-base"
              style={{ fontSize: "16px" }}
              disabled={isBlocked}
            />
          </div>

          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 text-base"
              style={{ fontSize: "16px" }}
              disabled={isBlocked}
            />
          </div>

          <Button
            type="submit"
            className="w-full touch-manipulation"
            disabled={submitting || isBlocked || isThrottled}
          >
            {isBlocked
              ? `Bloccato (${formatSeconds(lockoutSecondsLeft)})`
              : isThrottled
                ? `Attendi ${formatSeconds(backoffSecondsLeft)}…`
                : submitting
                  ? "Accesso in corso..."
                  : "Accedi"}
          </Button>

          <button
            type="button"
            onClick={async () => {
              if (!email) {
                setDialogVariant("info");
                setDialogTitle("Serve la tua email");
                setDialogDescription("Inserisci l'email qui sopra, poi clicca di nuovo su 'Password dimenticata'.");
                setDialogOpen(true);
                return;
              }

              // Rate limit: max 1 richiesta per email ogni RESET_COOLDOWN_S secondi
              const now = Date.now();
              const lastRequest = lastResetRequest.current[email] ?? 0;
              const elapsed = (now - lastRequest) / 1000;
              if (elapsed < RESET_COOLDOWN_S) {
                const wait = Math.ceil(RESET_COOLDOWN_S - elapsed);
                setDialogVariant("info");
                setDialogTitle("Richiesta già inviata");
                setDialogDescription(
                  `Hai già richiesto un link di recupero per questa email. Attendi ancora ${formatSeconds(wait)} prima di riprovare.`,
                );
                setDialogOpen(true);
                return;
              }

              try {
                const { supabase } = await import("@/lib/supabase");
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                  redirectTo: `${window.location.origin}/reset-password`,
                });
                if (error) throw error;
                lastResetRequest.current[email] = now;
                setDialogVariant("success");
                setDialogTitle("Email inviata");
                setDialogDescription("Controlla la posta e clicca sul link per reimpostare la password.");
                setDialogOpen(true);
              } catch (err) {
                setDialogVariant("error");
                setDialogTitle("Impossibile inviare l'email");
                setDialogDescription(formatAuthError(err));
                setDialogOpen(true);
              }
            }}
            className="w-full touch-manipulation text-center text-xs font-semibold text-muted-foreground hover:text-primary hover:underline disabled:opacity-40"
            disabled={isBlocked}
          >
            Password dimenticata?
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Non hai un account?{" "}
          <Link to="/registrati" className="font-semibold text-primary hover:underline">
            Registrati
          </Link>
        </p>
      </div>

      <FeedbackDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={dialogTitle}
        description={dialogDescription}
        variant={dialogVariant}
        actionLabel="Chiudi"
      />
    </div>
  );
}
