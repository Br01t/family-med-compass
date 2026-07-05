import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useFamilyMed } from "@/lib/store";

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
