import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Pill, AlertTriangle, Clock, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFamilyMed } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { getUserProfile, signInUser, formatAuthError } from "@/lib/auth-service";
import { TurnstileWidget } from "@/components/TurnstileWidget";
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
  const [captchaToken, setCaptchaToken] = useState<string | undefined>(undefined);
  const [mfaChallenge, setMfaChallenge] = useState<{ factorId: string; challengeId: string } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaSubmitting, setMfaSubmitting] = useState(false);
  const [pendingUser, setPendingUser] = useState<{ id: string; user_metadata?: unknown } | null>(null);
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

  const completeLoginRedirect = async (signedInUser: { id: string; user_metadata?: unknown }) => {
    const fallbackRole =
      typeof signedInUser.user_metadata === "object" && signedInUser.user_metadata !== null
        ? (signedInUser.user_metadata as Record<string, unknown>).role
        : undefined;

    const profile = await getUserProfile(signedInUser.id);
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
  };

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !mfaChallenge || !pendingUser) return;
    if (mfaCode.length !== 6) return;
    setMfaSubmitting(true);
    try {
      const { error } = await supabase.auth.mfa.verify({
        factorId: mfaChallenge.factorId,
        challengeId: mfaChallenge.challengeId,
        code: mfaCode,
      });
      if (error) throw error;

      failedAttempts.current = 0;
      lockedUntil.current = null;
      const userToRedirect = pendingUser;
      setMfaChallenge(null);
      setMfaCode("");
      setPendingUser(null);
      await completeLoginRedirect(userToRedirect);
    } catch (error) {
      setMfaCode("");
      setDialogVariant("error");
      setDialogTitle("Codice non valido");
      setDialogDescription("Controlla l'ora del telefono e riprova con il codice più recente.");
      setDialogOpen(true);
    } finally {
      setMfaSubmitting(false);
    }
  };

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
      const user = await signInUser({ email, password, captchaToken });
      setCaptchaToken(undefined); // il token è monouso, va rigenerato a ogni tentativo

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

      // Se l'utente ha attivato l'autenticazione a due fattori, Supabase
      // segnala che serve un secondo passaggio (aal1 → aal2) prima che la
      // sessione sia pienamente autorizzata: mettiamo in pausa il redirect
      // e chiediamo il codice a 6 cifre.
      if (supabase) {
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aal && aal.nextLevel === "aal2" && aal.nextLevel !== aal.currentLevel) {
          const { data: factorsData } = await supabase.auth.mfa.listFactors();
          const factor = factorsData?.totp?.[0];
          if (factor) {
            const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
              factorId: factor.id,
            });
            if (challengeError) throw challengeError;
            setMfaChallenge({ factorId: factor.id, challengeId: challenge.id });
            setPendingUser({ id: user.id, user_metadata: user.user_metadata });
            setSubmitting(false);
            return;
          }
        }
      }

      await completeLoginRedirect({ id: user.id, user_metadata: user.user_metadata });
      return;
    } catch (error: unknown) {
      setCaptchaToken(undefined); // token consumato/scaduto: il widget ne genera uno nuovo
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
    <div className="landing-light min-h-screen w-full flex flex-col items-center justify-center bg-[#FAF8F5] px-4 py-10 text-stone-800 selection:bg-emerald-100 selection:text-emerald-900 relative overflow-hidden">
      {/* Blob organici di sfondo */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-fluid-blob absolute -top-24 -left-16 h-96 w-96 bg-gradient-to-tr from-emerald-100 via-teal-50 to-emerald-50 opacity-70 blur-3xl" />
        <div className="animate-fluid-blob absolute -bottom-20 -right-16 h-96 w-96 bg-gradient-to-bl from-amber-100 via-orange-50 to-stone-100 opacity-60 blur-3xl" style={{ animationDelay: "-6s" }} />
      </div>

      <div className="w-full max-w-sm relative z-10">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-stone-500 hover:text-emerald-800 transition-colors font-medium"
        >
          <ArrowLeft className="size-4" /> Torna alla home
        </Link>

        <div className="mb-8 flex flex-col items-center text-center">
          <Link
            to="/"
            className="mb-4 grid size-14 place-items-center rounded-2xl bg-emerald-800 text-white shadow-sm hover:bg-emerald-900 transition-all"
          >
            <Pill className="size-6.5" />
          </Link>

          <h1 className="font-display text-3xl font-bold tracking-tight text-stone-900 italic">
            Bentornato su FamilyMed
          </h1>

          <p className="mt-2 text-base text-stone-600 font-normal">
            Accedi con le tue credenziali per continuare.
          </p>
        </div>

        {isBlocked && (
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-rose-500/30 bg-rose-50 p-4 text-sm text-rose-700">
            <Clock className="mt-0.5 size-4 shrink-0 text-rose-300" />
            <p>
              <strong>Accesso bloccato.</strong> Troppi tentativi falliti.{" "}
              Riprova tra <strong>{formatSeconds(lockoutSecondsLeft)}</strong>.
            </p>
          </div>
        )}

        {mfaChallenge ? (
          <form
            onSubmit={handleMfaVerify}
            className="space-y-4 rounded-3xl border border-stone-200/80 bg-white/85 p-6 sm:p-7 shadow-sm backdrop-blur-md"
          >
            <div className="text-center">
              <p className="text-base font-bold text-stone-900">Verifica in due passaggi</p>
              <p className="mt-1 text-sm text-stone-600">
                Inserisci il codice a 6 cifre dalla tua app di autenticazione.
              </p>
            </div>
            <div>
              <Label htmlFor="mfa-login-code" className="text-sm font-semibold text-stone-700">Codice</Label>
              <Input
                id="mfa-login-code"
                inputMode="numeric"
                maxLength={6}
                autoFocus
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className="mt-1 text-center text-lg tracking-[0.5em] bg-white border-stone-300 text-stone-900 placeholder:text-stone-400 rounded-xl"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-emerald-800 text-white font-bold hover:bg-emerald-900 rounded-2xl py-3.5 text-base shadow-sm transition-all"
              disabled={mfaSubmitting || mfaCode.length !== 6}
            >
              {mfaSubmitting ? "Verifica in corso..." : "Conferma"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full text-sm font-semibold text-stone-600 hover:text-stone-900 hover:bg-stone-100/60 rounded-xl"
              onClick={() => {
                setMfaChallenge(null);
                setPendingUser(null);
                setMfaCode("");
              }}
            >
              Torna al login
            </Button>
          </form>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-3xl border border-stone-200/80 bg-white/85 p-6 sm:p-7 shadow-sm backdrop-blur-md"
          >
            <div>
              <Label htmlFor="email" className="text-sm font-semibold text-stone-700">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="nome@esempio.it"
                className="mt-1 text-base bg-white border-stone-300 text-stone-900 placeholder:text-stone-400 rounded-xl focus:border-emerald-700 focus:ring-emerald-700/20"
                style={{ fontSize: "16px" }}
                disabled={isBlocked}
              />
            </div>

            <div>
              <Label htmlFor="password" className="text-sm font-semibold text-stone-700">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="mt-1 text-base bg-white border-stone-300 text-stone-900 placeholder:text-stone-400 rounded-xl focus:border-emerald-700 focus:ring-emerald-700/20"
                style={{ fontSize: "16px" }}
                disabled={isBlocked}
              />
            </div>

            <TurnstileWidget onVerify={setCaptchaToken} onExpire={() => setCaptchaToken(undefined)} />

            <Button
              type="submit"
              className="w-full touch-manipulation bg-emerald-800 text-white font-bold hover:bg-emerald-900 rounded-2xl py-3.5 text-base shadow-sm transition-all"
              disabled={submitting || isBlocked || isThrottled || (!!import.meta.env.VITE_TURNSTILE_SITE_KEY && !captchaToken)}
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
              className="w-full touch-manipulation text-center text-sm font-semibold text-stone-500 hover:text-emerald-800 hover:underline disabled:opacity-40"
              disabled={isBlocked}
            >
              Password dimenticata?
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-stone-600">
          Non hai un account?{" "}
          <Link to="/registrati" className="font-bold text-emerald-800 hover:text-emerald-900 underline">
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