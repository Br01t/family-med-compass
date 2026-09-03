import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Pill, ArrowLeft } from "lucide-react";
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
    <div className="landing-ocean min-h-screen w-full flex flex-col items-center justify-center bg-ocean-950 px-4 py-10 text-white selection:bg-ocean-300 selection:text-ocean-950 relative overflow-hidden">
      {/* Glow d'atmosfera */}
      <div className="pointer-events-none absolute -top-32 left-1/2 size-96 -translate-x-1/2 rounded-full bg-ocean-300/10 blur-3xl" />

      <div className="w-full max-w-sm relative z-10">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-ocean-200 hover:text-ocean-300 transition-colors font-medium"
        >
          <ArrowLeft className="size-4" /> Torna alla home
        </Link>

        <div className="mb-8 flex flex-col items-center text-center">
          <Link
            to="/"
            className="mb-4 grid size-14 place-items-center rounded-2xl bg-ocean-300 text-ocean-950 shadow-ocean hover:bg-ocean-200 transition-all"
          >
            <Pill className="size-6.5" />
          </Link>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white italic">Reimposta la password</h1>
          <p className="mt-2 text-base text-ocean-100 font-normal">
            Inserisci una nuova password per il tuo account.
          </p>
        </div>

        {!ready ? (
          <div className="rounded-3xl border border-ocean-600/30 bg-ocean-800/40 p-6 text-center text-sm sm:text-base text-ocean-100 shadow-ocean">
            Attendo il link di recupero dalla tua email…<br />
            Se hai aperto la pagina senza cliccare il link nella mail, richiedi un nuovo recupero da{" "}
            <Link className="font-bold text-ocean-300 hover:text-white underline" to="/login">Login</Link>.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4 rounded-3xl border border-ocean-600/30 bg-ocean-800/40 p-6 sm:p-7 shadow-ocean backdrop-blur-sm">
            <div>
              <Label htmlFor="new-pw" className="text-sm font-semibold text-ocean-100">Nuova password</Label>
              <Input
                id="new-pw"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 text-base bg-ocean-900/60 border-ocean-600/40 text-white placeholder:text-ocean-200/40 rounded-xl focus:border-ocean-300 focus:ring-ocean-300/30"
                style={{ fontSize: "16px" }}
              />
            </div>
            <div>
              <Label htmlFor="confirm-pw" className="text-sm font-semibold text-ocean-100">Conferma password</Label>
              <Input
                id="confirm-pw"
                type="password"
                required
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="mt-1 text-base bg-ocean-900/60 border-ocean-600/40 text-white placeholder:text-ocean-200/40 rounded-xl focus:border-ocean-300 focus:ring-ocean-300/30"
                style={{ fontSize: "16px" }}
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-ocean-300 text-ocean-950 font-extrabold hover:bg-ocean-200 rounded-2xl py-3.5 text-base shadow-ocean transition-all"
              disabled={submitting}
            >
              {submitting ? "Aggiornamento in corso…" : "Aggiorna password"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
