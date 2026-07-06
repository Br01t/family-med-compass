import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Pill } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { useFamilyMed } from "@/lib/store";

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

  // 🔥 REDIRECT SICURO (anche dopo refresh store)
  useEffect(() => {
    if (!loadingAuth && userProfile?.role) {
      navigate({
        to: userProfile.role === "paziente" ? "/paziente" : "/caregiver",
        replace: true,
      });
    }
  }, [loadingAuth, userProfile, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setSubmitting(true);

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    toast.success("Accesso effettuato!");

    const role = data.user?.user_metadata?.role;

    if (!role) {
      toast.error("Ruolo utente mancante");
      return;
    }

    navigate({
      to: role === "paziente" ? "/paziente" : "/caregiver",
      replace: true,
    });

  } catch (error: any) {
    toast.error("Errore durante l'accesso", {
      description: error?.message || "Verifica email e password.",
    });
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

          <h1 className="text-2xl font-black tracking-tight">
            Bentornato su FamilyMed
          </h1>

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
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Non hai un account?{" "}
          <Link to="/registrati" className="font-semibold text-primary hover:underline">
            Registrati
          </Link>
        </p>
      </div>
    </div>
  );
}