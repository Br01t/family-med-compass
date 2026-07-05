import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bell,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Download,
  HeartPulse,
  LayoutDashboard,
  Package,
  PieChart,
  Pill,
  Plus,
  Shield,
  Smartphone,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/guida")({
  head: () => ({
    meta: [
      { title: "Guida — FamilyMed" },
      {
        name: "description",
        content: "Come funziona FamilyMed: guida completa per caregiver e pazienti.",
      },
    ],
  }),
  component: GuidaPage,
});

function GuidaPage() {
  return (
    <AppShell
      title="Guida all'app"
      subtitle="Come funziona FamilyMed — tutto quello che devi sapere"
    >
      <Tabs defaultValue="caregiver" className="space-y-6">
        <TabsList className="flex-wrap h-auto gap-1 rounded-2xl bg-secondary p-1">
          <TabsTrigger value="caregiver" className="rounded-xl gap-2 data-[state=active]:shadow-card">
            <Users className="size-4" /> Caregiver
          </TabsTrigger>
          <TabsTrigger value="paziente" className="rounded-xl gap-2 data-[state=active]:shadow-card">
            <HeartPulse className="size-4" /> Paziente
          </TabsTrigger>
          <TabsTrigger value="funzioni" className="rounded-xl gap-2 data-[state=active]:shadow-card">
            <LayoutDashboard className="size-4" /> Funzioni
          </TabsTrigger>
          <TabsTrigger value="offline" className="rounded-xl gap-2 data-[state=active]:shadow-card">
            <WifiOff className="size-4" /> Offline & PWA
          </TabsTrigger>
        </TabsList>

        {/* ─────────────── CAREGIVER ─────────────── */}
        <TabsContent value="caregiver" className="space-y-6">
          <HeroCard
            icon={Users}
            color="primary"
            title="Sei un Caregiver?"
            description="Il caregiver è la persona che monitora la salute di uno o più familiari: controlla che le medicine vengano prese, riceve alert se qualcosa non va, gestisce le scorte e può aggiungere nuove terapie."
          />

          <SectionTitle>Come iniziare</SectionTitle>
          <div className="grid gap-4 md:grid-cols-3">
            <StepCard
              number={1}
              title="Entra come Caregiver"
              description='Dalla homepage, clicca "Vista Caregiver". Il tuo ruolo viene ricordato automaticamente.'
              icon={Users}
            />
            <StepCard
              number={2}
              title="Aggiungi i tuoi pazienti"
              description='Vai su Pazienti → "+ Aggiungi paziente". Inserisci nome e anno di nascita.'
              icon={Plus}
            />
            <StepCard
              number={3}
              title="Configura le terapie"
              description='Vai su Terapie → "+ Nuova terapia". Imposta farmaco, orari, dosi e reminder.'
              icon={Pill}
            />
          </div>

          <SectionTitle>La Dashboard Caregiver</SectionTitle>
          <div className="grid gap-4 md:grid-cols-2">
            <FeatureCard
              icon={LayoutDashboard}
              title="Panoramica famiglia"
              description="Vedi subito l'aderenza media (ultimi 7 giorni), gli alert attivi e le scorte in esaurimento per tutti i tuoi pazienti."
            />
            <FeatureCard
              icon={HeartPulse}
              title="Scheda paziente"
              description="Clicca su un paziente per vedere le dosi di oggi, la timeline degli eventi e il piano terapeutico completo."
            />
            <FeatureCard
              icon={Bell}
              title="Notifiche e alert"
              description='Ricevi notifiche quando una dose viene saltata o è in ritardo. La sezione "Notifiche" raccoglie tutto lo storico.'
            />
            <FeatureCard
              icon={Package}
              title="Gestione scorte"
              description="Monitora quante compresse rimangono per ogni terapia. Ricevi allerta automatica quando le scorte scendono sotto la soglia."
            />
          </div>

          <SectionTitle>Gestione Pazienti e Terapie</SectionTitle>
          <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-card space-y-4">
            <GuideRow
              icon={Plus}
              title="Aggiungere un paziente"
              description='Vai su "Pazienti" nella sidebar → clicca "+ Aggiungi paziente" in alto a destra → compila nome e anno di nascita → Salva.'
            />
            <Divider />
            <GuideRow
              icon={Pill}
              title="Aggiungere una terapia"
              description='Vai su "Terapie" → clicca "+ Nuova terapia" (globale) oppure il pulsante "+ Terapia" accanto al nome del paziente → compila il form completo → Salva.'
            />
            <Divider />
            <GuideRow
              icon={Shield}
              title="Modificare una terapia"
              description='In "Terapie", ogni scheda farmaco ha il pulsante "Modifica". Il form si apre pre-compilato: cambia solo i campi che vuoi aggiornare → Salva modifiche.'
            />
            <Divider />
            <GuideRow
              icon={CheckCircle2}
              title="Sospendere/riattivare una terapia"
              description="Ogni scheda terapia ha un pulsante accendi/spegni in alto a destra. Una terapia sospesa non genera reminder né dose da confermare."
            />
          </div>

          <SectionTitle>Sezioni dell'app</SectionTitle>
          <NavGrid />
        </TabsContent>

        {/* ─────────────── PAZIENTE ─────────────── */}
        <TabsContent value="paziente" className="space-y-6">
          <HeroCard
            icon={HeartPulse}
            color="accent"
            title="Sei il Paziente?"
            description="La vista paziente è pensata per essere semplicissima: un pulsante grande, testo leggibile, una sola azione per confermare che hai preso la medicina."
          />

          <SectionTitle>Come funziona per te</SectionTitle>
          <div className="grid gap-4 md:grid-cols-2">
            <StepCard
              number={1}
              title="Vedi le medicine di oggi"
              description="La schermata mostra le medicine nell'ordine degli orari. Ogni card indica nome, dosaggio e orario."
              icon={Pill}
            />
            <StepCard
              number={2}
              title='Clicca "Ho preso la medicina"'
              description="Un tap grande conferma la dose. L'app aggiorna la scorta e avvisa automaticamente i tuoi familiari."
              icon={CheckCircle2}
            />
          </div>

          <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-card space-y-4">
            <p className="font-black text-lg tracking-tight">Cosa succede se dimentico?</p>
            <div className="space-y-3 text-sm">
              <TimelineItem time="+15 min" label="Primo reminder" color="warning" />
              <TimelineItem time="+30 min" label="Secondo reminder" color="warning" />
              <TimelineItem time="+45 min" label="Notifica WhatsApp (se configurata)" color="accent" />
              <TimelineItem time="Timeout" label="Alert ai caregiver — la dose è marcata come saltata" color="destructive" />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Il caregiver può vedere tutto nella timeline e può anche confermare la dose al posto tuo dalla sua dashboard.
            </p>
          </div>
        </TabsContent>

        {/* ─────────────── FUNZIONI ─────────────── */}
        <TabsContent value="funzioni" className="space-y-6">
          <SectionTitle>Tutte le sezioni</SectionTitle>
          <div className="grid gap-4 md:grid-cols-2">
            <FeatureCard
              icon={LayoutDashboard}
              title="Dashboard Caregiver"
              description="Panoramica con aderenza media, alert attivi, scorte in esaurimento e timeline eventi giornaliera."
              badge="Caregiver"
            />
            <FeatureCard
              icon={HeartPulse}
              title="Vista Paziente"
              description="Interfaccia semplificata con una dose alla volta, pulsante grande e conferma in un tap."
              badge="Paziente"
            />
            <FeatureCard
              icon={Users}
              title="Pazienti"
              description="Lista dei pazienti seguiti con aderenza, prossima dose e accesso alla scheda dettaglio."
              badge="Caregiver"
            />
            <FeatureCard
              icon={Pill}
              title="Terapie"
              description="Gestione completa: aggiungi, modifica, sospendi o elimina farmaci per ogni paziente."
              badge="Caregiver"
            />
            <FeatureCard
              icon={PieChart}
              title="Storico & Report"
              description="Visualizza l'aderenza nel tempo, le dosi saltate e genera report settimanali/mensili."
              badge="Caregiver"
            />
            <FeatureCard
              icon={Package}
              title="Scorte"
              description="Controlla le compresse rimanenti, la stima dei giorni di autonomia e ricevi allerta quando finiscono."
              badge="Caregiver"
            />
            <FeatureCard
              icon={Bell}
              title="Notifiche"
              description="Storico di tutti gli alert: timeout, scorte basse, conferme dose. Segna come lette con un click."
              badge="Entrambi"
            />
            <FeatureCard
              icon={Shield}
              title="Impostazioni"
              description="Lingua, tema, fuso orario, volume reminder. Reset dati demo disponibile."
              badge="Entrambi"
            />
          </div>
        </TabsContent>

        {/* ─────────────── OFFLINE & PWA ─────────────── */}
        <TabsContent value="offline" className="space-y-6">
          <HeroCard
            icon={Wifi}
            color="success"
            title="FamilyMed funziona offline"
            description="Tutte le pagine principali vengono salvate sul tuo dispositivo. Puoi confermare dosi, consultare il piano terapeutico e leggere lo storico anche senza connessione."
          />

          <SectionTitle>Come installare l'app</SectionTitle>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
              <div className="flex items-center gap-3 mb-4">
                <div className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary">
                  <Smartphone className="size-5" />
                </div>
                <p className="font-black">Su iPhone (Safari)</p>
              </div>
              <ol className="space-y-3 text-sm text-muted-foreground">
                <li className="flex gap-3">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-black text-primary-foreground">1</span>
                  Apri FamilyMed in <strong className="text-foreground">Safari</strong>
                </li>
                <li className="flex gap-3">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-black text-primary-foreground">2</span>
                  Tocca l'icona <strong className="text-foreground">Condividi ↑</strong> in basso
                </li>
                <li className="flex gap-3">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-black text-primary-foreground">3</span>
                  Scorri e tocca <strong className="text-foreground">"Aggiungi alla schermata Home"</strong>
                </li>
                <li className="flex gap-3">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-black text-primary-foreground">4</span>
                  Conferma → l'icona FamilyMed apparirà sul tuo Home
                </li>
              </ol>
            </div>

            <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
              <div className="flex items-center gap-3 mb-4">
                <div className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary">
                  <Download className="size-5" />
                </div>
                <p className="font-black">Su Android (Chrome)</p>
              </div>
              <ol className="space-y-3 text-sm text-muted-foreground">
                <li className="flex gap-3">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-black text-primary-foreground">1</span>
                  Apri FamilyMed in <strong className="text-foreground">Chrome</strong>
                </li>
                <li className="flex gap-3">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-black text-primary-foreground">2</span>
                  Appare automaticamente il banner <strong className="text-foreground">"Aggiungi a Home"</strong>
                </li>
                <li className="flex gap-3">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-black text-primary-foreground">3</span>
                  Oppure tocca ⋮ → <strong className="text-foreground">"Aggiungi a schermata Home"</strong>
                </li>
                <li className="flex gap-3">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-black text-primary-foreground">4</span>
                  Conferma → l'app si apre come app nativa
                </li>
              </ol>
            </div>
          </div>

          <SectionTitle>Cosa funziona offline</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { label: "Dashboard Caregiver", ok: true },
              { label: "Vista Paziente", ok: true },
              { label: "Elenco Pazienti", ok: true },
              { label: "Gestione Terapie", ok: true },
              { label: "Storico e Report", ok: true },
              { label: "Notifiche locali", ok: true },
              { label: "Scorte", ok: true },
              { label: "Impostazioni", ok: true },
              { label: "Sincronizzazione cloud", ok: false },
              { label: "Invio WhatsApp/Email", ok: false },
            ].map((item) => (
              <div
                key={item.label}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-4 py-3 text-sm",
                  item.ok
                    ? "border-success/20 bg-success/5 text-foreground"
                    : "border-border/40 bg-muted/40 text-muted-foreground",
                )}
              >
                <span className={cn("text-base", item.ok ? "text-success" : "text-muted-foreground")}>
                  {item.ok ? "✓" : "✗"}
                </span>
                {item.label}
              </div>
            ))}
          </div>

          <div className="rounded-3xl border border-primary/20 bg-primary-soft/40 p-5 text-sm text-muted-foreground">
            <strong className="text-foreground">Nota:</strong> Tutti i dati sono salvati localmente nel tuo browser (localStorage). Non vengono trasmessi a nessun server in questa versione demo.
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-8 flex justify-center">
        <Button asChild variant="outline" size="lg" className="h-12 px-6">
          <Link to="/caregiver">
            <ChevronRight className="mr-2 size-4" />
            Vai alla dashboard
          </Link>
        </Button>
      </div>
    </AppShell>
  );
}

/* ── Sub-components ── */

function HeroCard({
  icon: Icon,
  color,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  color: "primary" | "accent" | "success";
  title: string;
  description: string;
}) {
  const styles = {
    primary: "bg-primary-soft text-primary",
    accent: "bg-accent-soft text-accent",
    success: "bg-success/10 text-success",
  }[color];
  return (
    <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
      <div className="flex items-start gap-4">
        <div className={cn("grid size-12 shrink-0 place-items-center rounded-2xl", styles)}>
          <Icon className="size-6" />
        </div>
        <div>
          <p className="text-xl font-black tracking-tight">{title}</p>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground pt-2">
      {children}
    </h2>
  );
}

function StepCard({
  number,
  title,
  description,
  icon: Icon,
}: {
  number: number;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
      <div className="flex items-center gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-sm font-black text-primary-foreground shadow-lift">
          {number}
        </div>
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <p className="mt-4 font-black tracking-tight">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
  badge,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <div className="rounded-3xl border border-border/60 bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
            <Icon className="size-4" />
          </div>
          <p className="font-black tracking-tight">{title}</p>
        </div>
        {badge && (
          <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {badge}
          </span>
        )}
      </div>
      <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

function GuideRow({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-4">
      <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
        <Icon className="size-4" />
      </div>
      <div>
        <p className="font-bold text-sm">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

function Divider() {
  return <div className="border-t border-border/50" />;
}

function TimelineItem({
  time,
  label,
  color,
}: {
  time: string;
  label: string;
  color: "warning" | "accent" | "destructive";
}) {
  const dot = {
    warning: "bg-warning",
    accent: "bg-accent",
    destructive: "bg-destructive",
  }[color];
  return (
    <div className="flex items-center gap-3">
      <span className={cn("size-2 shrink-0 rounded-full", dot)} />
      <span className="font-mono text-xs font-bold text-muted-foreground w-16 shrink-0">{time}</span>
      <span className="text-sm">{label}</span>
    </div>
  );
}

function NavGrid() {
  const items = [
    { icon: LayoutDashboard, label: "Dashboard", url: "/caregiver" },
    { icon: Users, label: "Pazienti", url: "/pazienti" },
    { icon: Pill, label: "Terapie", url: "/terapie" },
    { icon: PieChart, label: "Storico", url: "/storico" },
    { icon: Package, label: "Scorte", url: "/scorte" },
    { icon: Bell, label: "Notifiche", url: "/notifiche" },
  ];
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
      {items.map((item) => (
        <Link
          key={item.url}
          to={item.url}
          className="flex flex-col items-center gap-2 rounded-2xl border border-border/60 bg-card p-4 text-center shadow-card transition hover:shadow-lift hover:border-primary/30"
        >
          <div className="grid size-9 place-items-center rounded-xl bg-primary-soft text-primary">
            <item.icon className="size-4" />
          </div>
          <span className="text-[11px] font-bold">{item.label}</span>
        </Link>
      ))}
    </div>
  );
}
