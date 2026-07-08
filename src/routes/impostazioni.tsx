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
import { requestNotificationPermission } from "@/components/NotificationScheduler";
import { subscribeToPush, isSubscribedOnThisDevice, unsubscribeFromPush, sendPushToUser } from "@/lib/push-subscription";
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

  // Vista paziente: solo profilo/logout, installazione app e notifiche push.
  if (isPatient && user && userProfile) {
    return (
      <PatientShell title="Impostazioni" subtitle="Il tuo account, app e notifiche">
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
          <PushCard />
        </div>
      </PatientShell>
    );
  }

  return (
    <AppShell title="Impostazioni" subtitle="Account, installazione e notifiche">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Profilo & Account */}
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
        <PushCard />

        <section className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
          <h2 className="text-lg font-black tracking-tight">Sincronizzazione</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            {user
              ? "✓ Dati sincronizzati sul cloud in tempo reale. Ogni azione è condivisa istantaneamente tra paziente e caregiver."
              : "Accedi per sincronizzare i tuoi dati sul cloud."}
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
        Installa FamilyMed sul telefono per usarla come una vera app e ricevere notifiche anche a schermo bloccato.
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
            <p className="mt-2 text-xs text-muted-foreground">Le notifiche push su iOS funzionano solo dopo l'installazione (iOS 16.4+).</p>
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

/* ---------------- Notifiche push ---------------- */

function PushCard() {
  const { user } = useFamilyMed();
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported",
  );
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setInstalled(
      window.matchMedia?.("(display-mode: standalone)").matches ||
        (window.navigator as any).standalone === true,
    );
    const id = window.setInterval(() => {
      if ("Notification" in window) setPerm(Notification.permission);
    }, 2000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!user) return;
    isSubscribedOnThisDevice(user.id).then(setSubscribed);
  }, [user, perm]);

  async function ask() {
    const p = await requestNotificationPermission();
    setPerm(p);
    if (p === "granted") toast.success("Notifiche attive");
    else if (p === "denied") toast.error("Notifiche bloccate dal browser");
  }

  async function enable() {
    if (!user) return;
    setBusy(true);
    const res = await subscribeToPush(user.id);
    setBusy(false);
    if (res.ok) {
      setSubscribed(true);
      toast.success("Dispositivo registrato per le push");
    } else {
      toast.error("Registrazione fallita", { description: res.reason });
    }
  }

  async function disable() {
    if (!user) return;
    setBusy(true);
    await unsubscribeFromPush(user.id);
    setBusy(false);
    setSubscribed(false);
    toast.info("Dispositivo disconnesso dalle push");
  }

  async function testPush() {
    if (!user) return;
    setTesting(true);
    await sendPushToUser({
      targetUserId: user.id,
      title: "Notifica di test — FamilyMed",
      body: "Se vedi questo messaggio, le push funzionano anche ad app chiusa.",
      url: "/notifiche",
      tag: "test-" + Date.now(),
      requireInteraction: false,
    });
    setTesting(false);
    toast.success("Test inviato", { description: "Chiudi l'app e attendi qualche secondo." });
  }

  const iosNeedsInstall =
    typeof window !== "undefined" &&
    /iPad|iPhone|iPod/.test(window.navigator.userAgent) &&
    !installed;

  return (
    <section className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
      <h2 className="text-lg font-black tracking-tight">Notifiche push & sveglie</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Configura le notifiche per ricevere i promemoria all'orario esatto, anche con app chiusa e schermo bloccato.
      </p>

      <ol className="mt-4 space-y-3">
        <Step
          n={1}
          done={installed}
          title="Installa l'app"
          desc={installed ? "PWA installata ✓" : "Aggiungi FamilyMed alla schermata Home (vedi card sopra)."}
          warning={iosNeedsInstall ? "Su iOS le push funzionano SOLO dopo l'installazione." : undefined}
        />
        <Step
          n={2}
          done={perm === "granted"}
          title="Concedi il permesso notifiche"
          desc={
            perm === "granted" ? "Permesso concesso ✓" :
            perm === "denied" ? "Permesso negato. Sbloccalo dalle impostazioni del browser." :
            perm === "unsupported" ? "Non supportato su questo browser." :
            "Necessario per mostrare gli avvisi."
          }
          action={
            perm !== "granted" && perm !== "unsupported" ? (
              <Button size="sm" onClick={ask} disabled={perm === "denied"}>Attiva</Button>
            ) : null
          }
        />
        <Step
          n={3}
          done={subscribed}
          title="Registra questo dispositivo"
          desc={
            !user ? "Devi essere autenticato." :
            subscribed ? "Dispositivo registrato sul server ✓" :
            "Attiva le push server-side (funzionano ad app chiusa)."
          }
          action={
            user && perm === "granted" ? (
              subscribed ? (
                <Button size="sm" variant="outline" onClick={disable} disabled={busy}>Disattiva</Button>
              ) : (
                <Button size="sm" onClick={enable} disabled={busy}>{busy ? "..." : "Registra"}</Button>
              )
            ) : null
          }
        />
      </ol>

      {subscribed && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/40 p-3">
          <div>
            <p className="text-sm font-semibold">Prova una notifica</p>
            <p className="text-xs text-muted-foreground">Verifica che arrivi anche con l'app chiusa.</p>
          </div>
          <Button size="sm" variant="outline" onClick={testPush} disabled={testing}>
            {testing ? "Invio..." : "Invia test"}
          </Button>
        </div>
      )}
    </section>
  );
}

function Step({
  n, done, title, desc, action, warning,
}: {
  n: number; done: boolean; title: string; desc: string; action?: React.ReactNode; warning?: string;
}) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-border/50 p-3">
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${done ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"}`}>
        {done ? "✓" : n}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
        {warning && <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 font-semibold">{warning}</p>}
      </div>
      {action}
    </li>
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
