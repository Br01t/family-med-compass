import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { HeartPulse, Pill, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUpUser, formatAuthError } from "@/lib/auth-service";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { useFamilyMed } from "@/lib/store";
import { cn } from "@/lib/utils";
import { type Role } from "@/lib/mock-data";
import { FeedbackDialog } from "@/components/FeedbackDialog";
import { LEGAL_CONTACT } from "@/lib/legal-contact";

export const Route = createFileRoute("/registrati")({
  head: () => ({ meta: [{ title: "Registrati — FamilyMed" }] }),
  component: RegisterPage,
});

function RegisterPage() {
  const { user, userProfile, loadingAuth } = useFamilyMed();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("caregiver");
  const [consentTerms, setConsentTerms] = useState(false);
  const [consentHealth, setConsentHealth] = useState(false);
  const [ageDeclared, setAgeDeclared] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState("");
  const [dialogDescription, setDialogDescription] = useState("");
  const [dialogVariant, setDialogVariant] = useState<"success" | "error" | "info">("info");

  useEffect(() => {
    if (!loadingAuth && user && userProfile) {
      navigate({ to: userProfile.role === "paziente" ? "/paziente" : "/caregiver" });
    }
  }, [loadingAuth, user, userProfile, navigate]);

  // Validazione password: min 8 caratteri + almeno 1 numero + almeno 1 lettera
  function validatePassword(pwd: string): string | null {
    if (pwd.length < 8) return "La password deve essere di almeno 8 caratteri.";
    if (!/\d/.test(pwd)) return "La password deve contenere almeno un numero.";
    if (!/[a-zA-Z]/.test(pwd)) return "La password deve contenere almeno una lettera.";
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consentTerms || !consentHealth || !ageDeclared) {
      setDialogVariant("error");
      setDialogTitle("Consensi obbligatori");
      setDialogDescription(
        "Per procedere devi confermare di avere almeno 18 anni, accettare i Termini di Servizio e la Privacy, e prestare il consenso esplicito al trattamento dei dati sanitari.",
      );
      setDialogOpen(true);
      return;
    }
    const pwdError = validatePassword(password);
    if (pwdError) {
      setDialogVariant("error");
      setDialogTitle("Password non valida");
      setDialogDescription(pwdError);
      setDialogOpen(true);
      return;
    }
    setSubmitting(true);
    try {
      await signUpUser({ email, password, name, role, captchaToken });
      setCaptchaToken(undefined); // token monouso

      // Registra la prova dei consensi (GDPR art. 7.1) — OBBLIGATORIO.
      // Se fallisce, l'account viene creato ma la registrazione si blocca:
      // l'utente verrà avvisato e potrà riprovare.
      const { supabase } = await import("@/lib/supabase");
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (uid) {
        const ua = typeof navigator !== "undefined" ? navigator.userAgent : null;
        const { error: consentError } = await supabase.from("user_consents").insert([
          { user_id: uid, kind: "terms_privacy", granted: true, user_agent: ua },
          { user_id: uid, kind: "health_data", granted: true, user_agent: ua },
          { user_id: uid, kind: "age_declaration", granted: true, user_agent: ua },
        ]);
        if (consentError) {
          // Errore non bloccante solo se la tabella non esiste ancora (setup incompleto).
          // In tutti gli altri casi trattiamo l'errore come critico e avvisiamo l'utente.
          if (
            consentError.code !== "42P01" && // tabella non esiste
            !consentError.message?.includes("does not exist")
          ) {
            console.error("[GDPR] Consensi non registrati:", consentError);
            setDialogVariant("error");
            setDialogTitle("Registrazione incompleta");
            setDialogDescription(
              "Il tuo account è stato creato ma non è stato possibile registrare il consenso GDPR. " +
              `Accedi e verifica la sezione Privacy nelle impostazioni, oppure contattaci a ${LEGAL_CONTACT.privacyEmail}.`,
            );
            setDialogOpen(true);
            return;
          } else {
            console.warn("[GDPR] Tabella user_consents non trovata (esegui MIGRATION_consensi_gdpr.sql).");
          }
        }
      }

      setDialogVariant("success");
      setDialogTitle("Registrazione completata");
      setDialogDescription(
        "Il tuo account è stato creato. Verifica l'email se serve la conferma, quindi accedi per continuare.",
      );
      setDialogOpen(true);
      setEmail("");
      setPassword("");
      setName("");
    } catch (error: unknown) {
      setCaptchaToken(undefined); // token consumato/scaduto: il widget ne genera uno nuovo
      setDialogVariant("error");
      setDialogTitle("Errore durante la registrazione");
      setDialogDescription(formatAuthError(error));
      setDialogOpen(true);
    } finally {
      setSubmitting(false);
    }
  };

  const roleOptions: { value: Role; label: string; hint: string; icon: typeof HeartPulse }[] = [
    {
      value: "caregiver",
      label: "Caregiver",
      hint: "Segui le terapie di un familiare",
      icon: Users,
    },
    {
      value: "paziente",
      label: "Paziente",
      hint: "Gestisci le tue terapie",
      icon: HeartPulse,
    },
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Link
            to="/"
            className="mb-4 grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lift"
          >
            <Pill className="size-6" />
          </Link>
          <h1 className="text-2xl font-black tracking-tight">Crea il tuo account</h1>
          <p className="mt-1 text-sm text-muted-foreground">Scegli come vuoi usare FamilyMed.</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-3xl border border-border/60 bg-card p-6 shadow-card"
        >
          <div>
            <Label>Ti registri come</Label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {roleOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRole(opt.value)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-center transition-colors",
                    role === opt.value
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-border/60 bg-surface text-muted-foreground hover:bg-secondary",
                  )}
                >
                  <opt.icon className="size-5" />
                  <span className="text-sm font-bold">{opt.label}</span>
                  <span className="text-[11px] leading-tight">{opt.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="name">Nome completo</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Mario Rossi"
              className="mt-1 text-base"
              style={{ fontSize: "16px" }}
            />
          </div>
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
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="Min. 8 caratteri con almeno 1 numero"
              className="mt-1 text-base"
              style={{ fontSize: "16px" }}
            />
          </div>
          <div className="space-y-3 rounded-2xl border border-border/60 bg-surface p-3">
            <label className="flex cursor-pointer items-start gap-2 text-xs leading-snug text-foreground">
              <input
                type="checkbox"
                checked={ageDeclared}
                onChange={(e) => setAgeDeclared(e.target.checked)}
                required
                className="mt-0.5 size-4 shrink-0 rounded border-border accent-primary"
              />
              <span>
                Dichiaro di avere <strong>almeno 18 anni</strong>. Se creerò profili per persone
                minorenni o non autosufficienti, dichiaro di esserne genitore, tutore legale o
                comunque autorizzato a gestirne i dati sanitari.
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-xs leading-snug text-foreground">
              <input
                type="checkbox"
                checked={consentTerms}
                onChange={(e) => setConsentTerms(e.target.checked)}
                required
                className="mt-0.5 size-4 shrink-0 rounded border-border accent-primary"
              />
              <span>
                Ho letto e accetto i{" "}
                <Link to="/termini" target="_blank" className="font-semibold text-primary hover:underline">
                  Termini di Servizio
                </Link>{" "}
                e l'{" "}
                <Link to="/privacy" target="_blank" className="font-semibold text-primary hover:underline">
                  Informativa Privacy
                </Link>
                .
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-xs leading-snug text-foreground">
              <input
                type="checkbox"
                checked={consentHealth}
                onChange={(e) => setConsentHealth(e.target.checked)}
                required
                className="mt-0.5 size-4 shrink-0 rounded border-border accent-primary"
              />
              <span>
                Presto il <strong>consenso esplicito</strong> al trattamento dei miei dati relativi alla
                salute (farmaci, orari, aderenza) per l'erogazione del servizio, ai sensi
                dell'art. 9.2.a GDPR. Posso revocarlo in qualsiasi momento dalle impostazioni.
              </span>
            </label>
          </div>

          <TurnstileWidget onVerify={setCaptchaToken} onExpire={() => setCaptchaToken(undefined)} />

          <Button
            type="submit"
            className="w-full touch-manipulation"
            disabled={
              submitting ||
              !consentTerms ||
              !consentHealth ||
              !ageDeclared ||
              (!!import.meta.env.VITE_TURNSTILE_SITE_KEY && !captchaToken)
            }
          >
            {submitting ? "Creazione in corso..." : "Registrati"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Hai già un account?{" "}
          <Link to="/login" className="font-semibold text-primary hover:underline">
            Accedi
          </Link>
        </p>
      </div>

      <FeedbackDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={dialogTitle}
        description={dialogDescription}
        variant={dialogVariant}
      />
    </div>
  );
}