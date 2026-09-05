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
    <div className="landing-light min-h-screen w-full flex flex-col items-center justify-center bg-[#FAF8F5] px-4 py-10 text-stone-800 selection:bg-emerald-100 selection:text-emerald-900 relative overflow-hidden">
      {/* Blob organici di sfondo */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-fluid-blob absolute -top-24 -left-16 h-96 w-96 rounded-full bg-emerald-200/70 blur-2xl" />
        <div className="animate-fluid-blob absolute -bottom-20 -right-16 h-96 w-96 rounded-full bg-amber-200/60 blur-2xl" style={{ animationDelay: "-6s" }} />
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
          <h1 className="font-display text-3xl font-bold tracking-tight text-stone-900">Reimposta la password</h1>
          <p className="mt-2 text-base text-stone-600 font-normal">
            Inserisci una nuova password per il tuo account.
          </p>
        </div>

        {!ready ? (
          <div className="rounded-3xl border border-stone-200/80 bg-white/85 p-6 text-center text-sm sm:text-base text-stone-600 shadow-sm backdrop-blur-md">
            Attendo il link di recupero dalla tua email…<br />
            Se hai aperto la pagina senza cliccare il link nella mail, richiedi un nuovo recupero da{" "}
            <Link className="font-bold text-emerald-800 hover:text-emerald-900 underline" to="/login">Login</Link>.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4 rounded-3xl border border-stone-200/80 bg-white/85 p-6 sm:p-7 shadow-sm backdrop-blur-md">
            <div>
              <Label htmlFor="new-pw" className="text-sm font-semibold text-stone-700">Nuova password</Label>
              <Input
                id="new-pw"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 text-base bg-white border-stone-300 text-stone-900 placeholder:text-stone-400 rounded-xl focus:border-emerald-700 focus:ring-emerald-700/20"
                style={{ fontSize: "16px" }}
              />
            </div>
            <div>
              <Label htmlFor="confirm-pw" className="text-sm font-semibold text-stone-700">Conferma password</Label>
              <Input
                id="confirm-pw"
                type="password"
                required
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="mt-1 text-base bg-white border-stone-300 text-stone-900 placeholder:text-stone-400 rounded-xl focus:border-emerald-700 focus:ring-emerald-700/20"
                style={{ fontSize: "16px" }}
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-emerald-800 text-white font-bold hover:bg-emerald-900 rounded-2xl py-3.5 text-base shadow-sm transition-all"
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