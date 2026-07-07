import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Pill } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Reimposta password — FamilyMed" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Supabase gestisce automaticamente il recovery quando il link contiene #access_token
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    // Se la sessione è già presente all'apertura
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    return () => subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) return toast.error("La password deve avere almeno 6 caratteri.");
    if (password !== confirm) return toast.error("Le due password non coincidono.");
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password aggiornata");
      navigate({ to: "/login", replace: true });
    } catch (err: any) {
      toast.error("Impossibile aggiornare la password", { description: err?.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lift">
            <Pill className="size-6" />
          </div>
          <h1 className="text-2xl font-black tracking-tight">Reimposta la password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Inserisci una nuova password per il tuo account.
          </p>
        </div>

        {!ready ? (
          <div className="rounded-3xl border border-border/60 bg-card p-6 text-center text-sm text-muted-foreground">
            Attendo il link di recupero dalla tua email…<br />
            Se hai aperto la pagina senza cliccare il link nella mail, richiedi un nuovo recupero da <a className="text-primary hover:underline" href="/login">Login</a>.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4 rounded-3xl border border-border/60 bg-card p-6 shadow-card">
            <div>
              <Label htmlFor="new-pw">Nuova password</Label>
              <Input id="new-pw" type="password" required minLength={6} value={password}
                onChange={(e) => setPassword(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="confirm-pw">Conferma password</Label>
              <Input id="confirm-pw" type="password" required minLength={6} value={confirm}
                onChange={(e) => setConfirm(e.target.value)} className="mt-1" />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Aggiornamento…" : "Aggiorna password"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
