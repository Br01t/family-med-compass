import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Pill } from "lucide-react";
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      setDialogVariant("error");
      setDialogTitle("Impossibile accedere");
      setDialogDescription(formatAuthError(error));
      setDialogOpen(true);
    } finally {
      setSubmitting(false);
    }
  };

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
              className="mt-1"
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
              className="mt-1"
            />
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Accesso in corso..." : "Accedi"}
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
              try {
                const { supabase } = await import("@/lib/supabase");
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                  redirectTo: `${window.location.origin}/reset-password`,
                });
                if (error) throw error;
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
            className="w-full text-center text-xs font-semibold text-muted-foreground hover:text-primary hover:underline"
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
