import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { signUpUser } from "@/lib/auth-service";
import { AppShell } from "@/components/AppShell";
import { PatientShell } from "@/components/PatientShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFamilyMed } from "@/lib/store";
import { type Role } from "@/lib/mock-data";

export const Route = createFileRoute("/impostazioni")({
  head: () => ({ meta: [{ title: "Impostazioni — FamilyMed" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, userProfile, loadingAuth, logout } = useFamilyMed();
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRoleState] = useState<Role>("caregiver");
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Accesso effettuato con successo!");
      setEmail(""); setPassword("");
    } catch (error: any) {
      toast.error("Errore durante l'accesso", { description: error.message });
    } finally { setSubmitting(false); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await signUpUser({ email, password, name, role });
      toast.success("Registrazione completata!");
      setEmail(""); setPassword(""); setName("");
    } catch (error: any) {
      toast.error("Errore durante la registrazione", { description: error.message });
    } finally { setSubmitting(false); }
  };

  const isPatient = userProfile?.role === "paziente";

  if (loadingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Caricamento…</p>
      </div>
    );
  }

  // Vista paziente: profilo + installazione app.
  if (isPatient && user && userProfile) {
    return (
      <PatientShell title="Impostazioni" subtitle="Il tuo account e l'app">
        <div className="space-y-4">
          <section className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
            <h2 className="text-lg font-black tracking-tight">Il tuo account</h2>
            <div className="mt-4 space-y-4">
              <Field label="Nome" value={userProfile.name} />
              <Field label="Email" value={userProfile.email} />
              <Button
                variant="destructive"
                className="w-full mt-2"
                onClick={async () => { await logout(); toast.info("Sessione chiusa."); }}
              >
                Disconnetti
              </Button>
            </div>
          </section>
          <InstallCard />
        </div>
      </PatientShell>
    );
  }

  return (
    <AppShell title="Impostazioni" subtitle="Account e installazione">
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
          <h2 className="text-lg font-black tracking-tight">Profilo & Account</h2>
          {loadingAuth ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Caricamento account...</div>
          ) : user && userProfile ? (
            <div className="mt-4 space-y-4">
              <Field label="Nome" value={userProfile.name} />
              <Field label="Email" value={userProfile.email} />
              <Field label="Ruolo" value={userProfile.role} capitalize />
              <Button
                variant="destructive"
                className="w-full mt-2"
                onClick={async () => { await logout(); toast.info("Sessione chiusa."); }}
              >
                Disconnetti
              </Button>
            </div>
          ) : (
            <div className="mt-4">
              <div className="flex gap-2 p-1 bg-muted rounded-xl mb-4">
                <button type="button" onClick={() => setActiveTab("login")}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === "login" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}>
                  Accedi
                </button>
                <button type="button" onClick={() => setActiveTab("register")}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === "register" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}>
                  Registrati
                </button>
              </div>
              {activeTab === "login" ? (
                <form onSubmit={handleLogin} className="space-y-3">
                  <div><Label htmlFor="login-email">Email</Label>
                    <Input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1" /></div>
                  <div><Label htmlFor="login-password">Password</Label>
                    <Input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="mt-1" /></div>
                  <Button type="submit" className="w-full mt-2" disabled={submitting}>{submitting ? "Accesso..." : "Accedi"}</Button>
                </form>
              ) : (
                <form onSubmit={handleRegister} className="space-y-3">
                  <div><Label htmlFor="reg-name">Nome completo</Label>
                    <Input id="reg-name" value={name} onChange={(e) => setName(e.target.value)} required className="mt-1" /></div>
                  <div><Label htmlFor="reg-email">Email</Label>
                    <Input id="reg-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1" /></div>
                  <div><Label htmlFor="reg-password">Password</Label>
                    <Input id="reg-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Almeno 6 caratteri" className="mt-1" /></div>
                  <div><Label htmlFor="reg-role">Ruolo</Label>
                    <Select value={role} onValueChange={(v) => setRoleState(v as Role)}>
                      <SelectTrigger id="reg-role" className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="caregiver">Caregiver (Famigliare)</SelectItem>
                        <SelectItem value="paziente">Paziente</SelectItem>
                      </SelectContent>
                    </Select></div>
                  <Button type="submit" className="w-full mt-2" disabled={submitting}>{submitting ? "Creazione..." : "Registrati e Accedi"}</Button>
                </form>
              )}
            </div>
          )}
        </section>

        <InstallCard />

        <section className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
          <h2 className="text-lg font-black tracking-tight">Sincronizzazione</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            {user
              ? "✓ Dati sincronizzati sul cloud in tempo reale. Ogni azione è condivisa istantaneamente tra paziente e caregiver."
              : "Accedi per sincronizzare i tuoi dati sul cloud."}
          </p>
        </section>

        <section className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
          <h2 className="text-lg font-black tracking-tight">Promemoria</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            I promemoria delle cure appaiono come modali dentro l'app quando è aperta.
            Per ricevere avvisi anche quando l'app è chiusa, aggiungi ogni terapia al
            calendario del telefono dalla pagina <b>Le mie terapie</b>: il sistema del
            calendario notificherà autonomamente all'orario esatto.
          </p>
        </section>
      </div>
    </AppShell>
  );
}

/* ---------------- Installa app ---------------- */

function InstallCard() {
  const [installed, setInstalled] = useState(false);
  const [deferred, setDeferred] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    setInstalled(standalone);
    const ua = window.navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream);

    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e); };
    const onInstalled = () => { setInstalled(true); setDeferred(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!deferred) return;
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") toast.success("App installata!");
    setDeferred(null);
  }

  return (
    <section className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
      <h2 className="text-lg font-black tracking-tight">Installa app</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Installa FamilyMed sul telefono per usarla come una vera app, sempre disponibile in home.
      </p>
      <div className="mt-4">
        {installed ? (
          <div className="rounded-xl border border-green-500/40 bg-green-500/10 p-3 text-sm font-semibold text-green-700 dark:text-green-400">
            ✓ App installata su questo dispositivo
          </div>
        ) : deferred ? (
          <Button onClick={install} className="w-full">Installa FamilyMed</Button>
        ) : isIOS ? (
          <div className="rounded-xl border border-border/50 bg-muted/40 p-3 text-sm">
            <p className="font-semibold">Su iPhone/iPad:</p>
            <ol className="mt-2 list-decimal pl-5 text-muted-foreground space-y-1">
              <li>Tocca <b>Condividi</b> nella barra di Safari</li>
              <li>Scegli <b>Aggiungi alla schermata Home</b></li>
              <li>Conferma con <b>Aggiungi</b></li>
            </ol>
          </div>
        ) : (
          <div className="rounded-xl border border-border/50 bg-muted/40 p-3 text-sm text-muted-foreground">
            Apri questa pagina dal browser del telefono e usa il menu <b>"Installa app"</b> o <b>"Aggiungi a schermata Home"</b>.
          </div>
        )}
      </div>
    </section>
  );
}

function Field({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-3 border-b border-border/50 pb-2 last:border-0">
      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className={`truncate text-right text-sm font-semibold ${capitalize ? "capitalize" : ""}`}>{value}</span>
    </div>
  );
}
