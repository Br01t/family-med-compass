import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { signUpUser } from "@/lib/auth-service";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFamilyMed } from "@/lib/store";
import { requestNotificationPermission } from "@/components/NotificationScheduler";
import { subscribeToPush } from "@/lib/push-subscription";
import { type Role } from "@/lib/mock-data";

export const Route = createFileRoute("/impostazioni")({
  head: () => ({ meta: [{ title: "Impostazioni — FamilyMed" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { data, user, userProfile, loadingAuth, logout, resetDemoData } = useFamilyMed();
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  
  // Form states
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
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      toast.success("Accesso effettuato con successo!");
      setEmail("");
      setPassword("");
    } catch (error: any) {
      console.error(error);
      toast.error("Errore durante l'accesso", {
        description: error.message || "Verifica le credenziali.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await signUpUser({ email, password, name, role });
      toast.success("Registrazione completata con successo!");
      setEmail("");
      setPassword("");
      setName("");
    } catch (error: any) {
      console.error(error);
      toast.error("Errore durante la registrazione", {
        description: error.message || "Riprova con un'altra email.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell title="Impostazioni" subtitle="Preferenze account e sistema">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Gestione Profilo / Autenticazione */}
        <section className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
          <h2 className="text-lg font-black tracking-tight">Profilo & Account</h2>
          
          {loadingAuth ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Caricamento account...</div>
          ) : user && userProfile ? (
            <div className="mt-4 space-y-4">
              <Field label="Nome" value={userProfile.name} />
              <Field label="Email" value={userProfile.email} />
              <Field label="Ruolo" value={userProfile.role} capitalize />
              <Field label="UID Supabase" value={user.id} />
              
              <Button
                variant="destructive"
                className="w-full mt-2"
                onClick={async () => {
                  await logout();
                  toast.info("Sessione chiusa.");
                }}
              >
                Disconnetti
              </Button>
            </div>
          ) : (
            <div className="mt-4">
              <div className="flex gap-2 p-1 bg-muted rounded-xl mb-4">
                <button
                  type="button"
                  onClick={() => setActiveTab("login")}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                    activeTab === "login" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
                  }`}
                >
                  Accedi
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("register")}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                    activeTab === "register" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
                  }`}
                >
                  Registrati
                </button>
              </div>

              {activeTab === "login" ? (
                <form onSubmit={handleLogin} className="space-y-3">
                  <div>
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="nome@esempio.it"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="login-password">Password</Label>
                    <Input
                      id="login-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="mt-1"
                    />
                  </div>
                  <Button type="submit" className="w-full mt-2" disabled={submitting}>
                    {submitting ? "Accesso in corso..." : "Accedi"}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleRegister} className="space-y-3">
                  <div>
                    <Label htmlFor="reg-name">Nome completo</Label>
                    <Input
                      id="reg-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      placeholder="Mario Rossi"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="reg-email">Email</Label>
                    <Input
                      id="reg-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="nome@esempio.it"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="reg-password">Password</Label>
                    <Input
                      id="reg-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="Almeno 6 caratteri"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="reg-role">Ruolo account</Label>
                    <Select value={role} onValueChange={(v) => setRoleState(v as Role)}>
                      <SelectTrigger id="reg-role" className="mt-1">
                        <SelectValue placeholder="Seleziona ruolo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="caregiver">Caregiver (Famigliare)</SelectItem>
                        <SelectItem value="paziente">Paziente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" className="w-full mt-2" disabled={submitting}>
                    {submitting ? "Creazione in corso..." : "Registrati e Accedi"}
                  </Button>
                </form>
              )}
            </div>
          )}
        </section>

        <Card title="Sistema">
          <Field label="Fuso orario" value={data.settings.timezone} />
          <Field label="Lingua" value="Italiano" />
          <Field label="Tema" value={data.settings.theme} capitalize />
          <Field label="Volume reminder" value={`${data.settings.reminderVolume}%`} />
        </Card>

        <Card title="Preferenze notifiche">
          <ToggleRow label="Push notifications" defaultChecked />
          <ToggleRow label="Email" defaultChecked />
          <ToggleRow label="WhatsApp Business" defaultChecked />
          <ToggleRow label="Alert timeout terapia" defaultChecked />
          <ToggleRow label="Alert scorte basse" defaultChecked />
        </Card>

        <NotificationsCard />

        <Card title="Database & Dati">
          {user ? (
            <p className="text-sm text-green-600 dark:text-green-400 font-semibold">
              ✓ Sei connesso a Supabase PostgreSQL in tempo reale. I tuoi dati sono sincronizzati sul cloud.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Attualmente stai usando la modalità demo locale. Puoi caricare i dati demo predefiniti sul browser.
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => {
                  resetDemoData();
                  toast.success("Dati demo ripristinati");
                }}
              >
                Ripristina dati iniziali
              </Button>
            </>
          )}
        </Card>
      </div>
    </AppShell>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
      <h2 className="text-lg font-black tracking-tight">{title}</h2>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  capitalize,
}: {
  label: string;
  value: string;
  capitalize?: boolean;
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-3 border-b border-border/50 pb-2 last:border-0">
      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span className={`truncate text-right text-sm font-semibold ${capitalize ? "capitalize" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function ToggleRow({
  label,
  defaultChecked,
}: {
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border/50 p-3">
      <Label className="text-sm font-semibold">{label}</Label>
      <Switch defaultChecked={defaultChecked} />
    </div>
  );
}

function NotificationsCard() {
  const { user } = useFamilyMed();
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "unsupported",
  );
  const [pushBusy, setPushBusy] = useState(false);
  const [pushOk, setPushOk] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const id = window.setInterval(() => setPerm(Notification.permission), 2000);
    return () => window.clearInterval(id);
  }, []);

  async function ask() {
    const p = await requestNotificationPermission();
    setPerm(p);
    if (p === "granted") {
      toast.success("Notifiche attive", {
        description: "Riceverai un promemoria all'orario di ogni farmaco.",
      });
    } else if (p === "denied") {
      toast.error("Notifiche bloccate", {
        description: "Abilitale dalle impostazioni del browser per riceverle.",
      });
    }
  }

  async function enablePush() {
    if (!user) {
      toast.error("Devi essere autenticato per attivare le push.");
      return;
    }
    setPushBusy(true);
    const res = await subscribeToPush(user.id);
    setPushBusy(false);
    if (res.ok) {
      setPushOk(true);
      toast.success("Push attive su questo dispositivo", {
        description: "Riceverai una notifica anche ad app chiusa.",
      });
    } else {
      toast.error("Push non attivate", {
        description: res.reason ?? "Riprova o abilita le notifiche del browser.",
      });
    }
  }

  const status =
    perm === "granted"
      ? "Attive"
      : perm === "denied"
        ? "Bloccate dal browser"
        : perm === "unsupported"
          ? "Non supportate su questo dispositivo"
          : "Non attive";

  return (
    <section className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
      <h2 className="text-lg font-black tracking-tight">Sveglie & notifiche push</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Attiva le notifiche per ricevere promemoria all'orario esatto di ogni farmaco,
        con foto e suoni. Le push server-side arrivano anche ad app chiusa se installi FamilyMed come PWA.
      </p>
      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 p-3">
          <div>
            <p className="text-sm font-semibold">Permesso notifiche browser</p>
            <p className="text-xs text-muted-foreground">Stato: {status}</p>
          </div>
          <Button
            onClick={ask}
            disabled={perm === "granted" || perm === "denied" || perm === "unsupported"}
          >
            {perm === "granted" ? "Attive" : "Attiva"}
          </Button>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 p-3">
          <div>
            <p className="text-sm font-semibold">Push su questo dispositivo</p>
            <p className="text-xs text-muted-foreground">
              {pushOk ? "Registrate ✓" : "Consente le notifiche anche ad app chiusa"}
            </p>
          </div>
          <Button
            onClick={enablePush}
            disabled={pushBusy || perm !== "granted" || !user}
            variant={pushOk ? "outline" : "default"}
          >
            {pushBusy ? "Registrazione…" : pushOk ? "Ok" : "Attiva push"}
          </Button>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Suggerimento: installa FamilyMed come app dal tuo browser (menu → "Aggiungi a schermata Home")
        per ricevere le notifiche in modo affidabile anche a schermo bloccato.
      </p>
    </section>
  );
}
