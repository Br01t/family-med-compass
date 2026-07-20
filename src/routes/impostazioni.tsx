import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { BookOpen, ShieldCheck, FileText, Cookie, Mail, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { signUpUser } from "@/lib/auth-service";
import { AppShell } from "@/components/AppShell";
import { PatientShell } from "@/components/PatientShell";
import { FamilyInviteCard } from "@/components/FamilyInviteCard";
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
  const { data, user, userProfile, loadingAuth, logout } = useFamilyMed();
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

  // Vista paziente: profilo + inviti famiglia + installazione app.
  if (isPatient && user && userProfile) {
    const myPatient = data.patients[0];
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
          {myPatient && <FamilyInviteCard patientId={myPatient.id} />}
          <InstallCard />
          <InfoAssistenzaCard />
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

        <InfoAssistenzaCard />

        <section className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
          <h2 className="text-lg font-black tracking-tight">Sincronizzazione</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            {user
              ? "✓ Dati sincronizzati sul cloud in tempo reale. Ogni azione è condivisa istantaneamente tra paziente e caregiver."
              : "Accedi per sincronizzare i tuoi dati sul cloud."}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border/50 p-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Stato
              </p>
              <p className="mt-1 font-bold text-success">
                Online
              </p>
            </div>

            <div className="rounded-xl border border-border/50 p-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Aggiornamenti
              </p>
              <p className="mt-1 font-bold">
                In tempo reale
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
          <h2 className="text-lg font-black tracking-tight">Uno strumento in più per la famiglia</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            FamilyMed nasce per aiutare paziente e familiari a rimanere sincronizzati
            nella gestione delle terapie. <b>Continua sempre a seguire la normale procedura
            prevista per l'assunzione delle cure</b> e utilizza questa app come <b>supporto
            aggiuntivo</b> per avere più ordine, promemoria e <b>condivisione</b> delle informazioni.
          </p>
          <div className="mt-4 rounded-2xl border border-primary/20 bg-primary-soft/40 p-4">
            <p className="text-sm font-semibold text-primary">
              L'app è in continua evoluzione
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Nuove idee, funzioni o miglioramenti possono essere aggiunti nel tempo per
              renderla sempre più utile alle esigenze della famiglia. Se noti errori o
              comportamenti imprevisti, verranno analizzati e risolti per migliorare
              continuamente l'esperienza.
            </p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

/* ---------------- Informazioni & assistenza ---------------- */

const INFO_LINKS = [
  { to: "/guida", label: "Guida all'app", icon: BookOpen },
  { to: "/privacy", label: "Privacy", icon: ShieldCheck },
  { to: "/termini", label: "Termini di Servizio", icon: FileText },
  { to: "/cookie", label: "Cookie Policy", icon: Cookie },
] as const;

function InfoAssistenzaCard() {
  return (
    <section className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
      <h2 className="text-lg font-black tracking-tight">Informazioni & assistenza</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Guida all'app e documenti legali di FamilyMed.
      </p>
      <ul className="mt-4 divide-y divide-border/50 overflow-hidden rounded-2xl border border-border/50">
        {INFO_LINKS.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <Link
              to={to}
              className="flex items-center gap-3 px-4 py-3 text-sm font-semibold hover:bg-muted/50 transition-colors"
            >
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex-1">{label}</span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
        <li>
          <a
            href="mailto:giacomo.piccinini1@gmail.com"
            className="flex items-center gap-3 px-4 py-3 text-sm font-semibold hover:bg-muted/50 transition-colors"
          >
            <Mail className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex-1">Contattaci</span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </a>
        </li>
      </ul>
    </section>
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