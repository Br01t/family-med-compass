import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useFamilyMed } from "@/lib/store";
import { requestNotificationPermission } from "@/components/NotificationScheduler";

export const Route = createFileRoute("/impostazioni")({
  head: () => ({ meta: [{ title: "Impostazioni — FamilyMed" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { data, resetDemoData } = useFamilyMed();

  return (
    <AppShell title="Impostazioni" subtitle="Preferenze account e sistema">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Profilo">
          <Field label="Nome caregiver" value={data.caregivers[0]?.name ?? "—"} />
          <Field label="Ruolo" value={data.currentRole} capitalize />
          <Field label="Pazienti seguiti" value={String(data.patients.length)} />
        </Card>

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

        <Card title="Dati demo">
          <p className="text-sm text-muted-foreground">
            L'MVP salva tutto sul tuo browser (localStorage). Puoi resettare i dati
            di esempio in qualsiasi momento.
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
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "unsupported",
  );

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
      new Notification("FamilyMed", {
        body: "Le notifiche dei farmaci sono attive ✅",
        icon: "/icons/icon-192.png",
      });
    } else if (p === "denied") {
      toast.error("Notifiche bloccate", {
        description: "Abilitale dalle impostazioni del browser per riceverle.",
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
      <h2 className="text-lg font-black tracking-tight">Sveglie & notifiche</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Attiva le notifiche web per ricevere un promemoria all'ora esatta di
        ogni farmaco (con foto e note se caricate). Funziona finché l'app è
        aperta o installata come PWA sul telefono.
      </p>
      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border/50 p-3">
        <div>
          <p className="text-sm font-semibold">Notifiche web in-app</p>
          <p className="text-xs text-muted-foreground">Stato: {status}</p>
        </div>
        <Button
          onClick={ask}
          disabled={perm === "granted" || perm === "denied" || perm === "unsupported"}
        >
          {perm === "granted" ? "Attive" : "Attiva"}
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Per sveglie affidabili anche ad app chiusa, dalla pagina Terapie usa
        “Calendario” per esportare l'evento nel calendario nativo del telefono.
      </p>
    </section>
  );
}
