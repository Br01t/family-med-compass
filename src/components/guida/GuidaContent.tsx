import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Bell,
  CheckCircle2,
  Download,
  HeartPulse,
  LayoutDashboard,
  Package,
  BarChart3,
  Pill,
  Plus,
  Shield,
  Smartphone,
  Users,
  Wifi,
  CalendarPlus,
} from "lucide-react";

export function GuidaContent() {
  return (
    <Tabs defaultValue="caregiver" className="space-y-6">
      <TabsList className="flex-wrap h-auto gap-1 rounded-2xl bg-secondary p-1">
        <TabsTrigger value="caregiver" className="rounded-xl gap-2 data-[state=active]:shadow-card">
          <Users className="size-4" /> Caregiver
        </TabsTrigger>
        <TabsTrigger value="paziente" className="rounded-xl gap-2 data-[state=active]:shadow-card">
          <HeartPulse className="size-4" /> Paziente
        </TabsTrigger>
        <TabsTrigger value="offline" className="rounded-xl gap-2 data-[state=active]:shadow-card">
          <Download className="size-4" /> Installazione
        </TabsTrigger>
      </TabsList>

      {/* ─────────────── CAREGIVER ─────────────── */}
      <TabsContent value="caregiver" className="space-y-6">
        <HeroCard
          icon={Users}
          color="primary"
          title="Sei un Caregiver?"
          description="Il caregiver è la persona che monitora la salute di uno o più familiari (Pazienti): controlla che le medicine vengano prese, riceve alert se qualcosa non va, gestisce le scorte e può aggiungere nuove terapie."
        />

        <SectionTitle>Come iniziare</SectionTitle>
        <div className="grid gap-4 md:grid-cols-3">
          <StepCard
            number={1}
            title="Entra come Caregiver"
            description='Dalla homepage, clicca "Accedi" e registrati con il ruolo di Caregiver'
            icon={Users}
          />
          <StepCard
            number={2}
            title="Aggiungi i tuoi pazienti"
            description='Vai su Pazienti → Seleziona tra i Pazienti registrati quello che vuoi seguire. Puoi anche registrare un nuovo Paziente.'
            icon={Plus}
          />
          <StepCard
            number={3}
            title="Configura le terapie"
            description='Vai su Terapie → "+ Nuova terapia". Imposta farmaco, orari, dosi, reminder, foto e note.'
            icon={Pill}
          />
        </div>

        <SectionTitle>La Dashboard Caregiver</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <FeatureCard
            icon={LayoutDashboard}
            title="Panoramica famiglia"
            description="Vedi subito l'aderenza media (ultimi 7 giorni), gli alert attivi (dosi saltate) e le scorte in esaurimento per tutti i tuoi pazienti."
          />
          <FeatureCard
            icon={HeartPulse}
            title="Scheda paziente"
            description='Clicca su un Paziente (sia dalla dashboard che dalla pagina "Pazienti") per vedere le dosi di oggi, la timeline degli eventi e il piano terapeutico completo.'
          />
          <FeatureCard
            icon={Bell}
            title="Notifiche e alert"
            description='Ricevi notifiche quando una dose viene saltata o è in ritardo. La sezione "Notifiche" raccoglie tutto lo storico. Un Alert viene sollevato quando una dose viene saltata (nella pagina "Dose da confermare" il Caregiver deve segnare la cose come saltata o confermata dopo una contatto diretto col Paziente)'
          />
          <FeatureCard
            icon={Package}
            title="Gestione scorte"
            description="Monitora quante compresse rimangono per ogni terapia. Ricevi allerta automatica quando le scorte scendono sotto la soglia."
          />
        </div>

        <SectionTitle>Gestione Terapie</SectionTitle>
        <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-card space-y-4">
          {/* <GuideRow
            icon={Plus}
            title="Aggiungere un paziente"
            description='Vai su "Pazienti" nella sidebar → clicca "+ Aggiungi paziente" in alto a destra → compila nome e anno di nascita → Salva.'
          />
          <Divider /> */}
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
          <Divider />
          <GuideRow
            icon={CalendarPlus}
            title="Aggiungere la terapia al calendario"
            description="Dal dettaglio della terapia puoi aggiungere automaticamente l'evento al calendario personale del telefono. Il calendario aiuta a ricordare gli orari delle cure con un reminder preimpostato e link all'app, mentre FamilyMed mantiene paziente e caregiver sincronizzati sulle informazioni della terapia. Per assicurare la sincronizzazione corretta, modifica manualmente i dettagli dell'evento nel calendario del tuo dispositivo in modo che coincida con i tempi indicati nella terapia, sia per te che per il paziente!"
          />
        </div>

        <SectionTitle>Storico & Report</SectionTitle>
          <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-card space-y-4">
            <GuideRow
              icon={BarChart3}
              title="Monitorare l'aderenza alla terapia"
              description="Nella sezione Storico & Report puoi analizzare l'aderenza del paziente alle terapie negli ultimi 7, 30 o 90 giorni. Visualizza la percentuale di assunzione corretta e l'andamento nel tempo."
            />
            <Divider />
            <GuideRow
              icon={CalendarPlus}
              title="Consultare il calendario delle dosi"
              description="Puoi selezionare un giorno specifico dal calendario per vedere nel dettaglio quali dosi erano previste, quali sono state confermate, ritardate o saltate."
            />
            <Divider />
            <GuideRow
              icon={Bell}
              title="Analizzare dosi saltate e ritardi"
              description="Lo storico mostra quante dosi sono state saltate e quante assunte in ritardo, aiutando il caregiver a individuare eventuali difficoltà nella gestione della terapia."
            />
            <Divider />
            <GuideRow
              icon={Pill}
              title="Panoramica delle singole terapie"
              description="Per ogni terapia puoi vedere un riepilogo completo con frequenza di assunzione, andamento dell'aderenza, eventuali problemi riscontrati e lo storico delle conferme."
            />
          </div>
      </TabsContent>

      {/* ─────────────── PAZIENTE ─────────────── */}
      <TabsContent value="paziente" className="space-y-6">
        <HeroCard
          icon={HeartPulse}
          color="accent"
          title="Sei il Paziente?"
          description="La vista paziente è pensata per essere semplicissima: pulsanti grandi, testo leggibile, una sola azione per confermare che hai preso la medicina e una sola per posticipare l'assunzione (secondo i tempi massimi previsti)."
        />

        <SectionTitle>Come funziona per te</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <StepCard
            number={1}
            title="Vedi le medicine di oggi"
            description="La schermata mostra le medicine nell'ordine degli orari. Ogni card indica nome, dosaggio e orario. Vedi anche il progresso giornaliero (quante cure ti mancano/quante ne hai completate)."
            icon={Pill}
          />
          <StepCard
            number={2}
            title='Clicca "Ho preso la medicina"'
            description="Un tap grande conferma la dose. L'app aggiorna la scorta e avvisa automaticamente i tuoi familiari. Anche il ritardo o la non assunzione vengono registrati e comunicati!"
            icon={CheckCircle2}
          />
        </div>

        <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-card space-y-4">
          <p className="font-black text-lg tracking-tight">Gestione delle proprie terapie</p>

          <GuideRow
            icon={Pill}
            title="Visualizzare le terapie assegnate"
            description="Il paziente può consultare tutte le cure assegnate, con dettagli su farmaco, dosaggio, orari, istruzioni e informazioni aggiuntive."
          />

          <Divider />

          <GuideRow
            icon={HeartPulse}
            title="Consultare i dettagli della cura"
            description="Ogni terapia mostra le informazioni principali come foto del farmaco, confezione, note personali e periodo previsto di assunzione."
          />

          <Divider />

          <GuideRow
            icon={CalendarPlus}
            title="Aggiungere la terapia al calendario"
            description="Il paziente può aggiungere automaticamente una terapia al calendario del telefono, creando gli eventi negli orari previsti per l'assunzione."
          />

          <Divider />

          <GuideRow
            icon={Bell}
            title="Promemoria automatici"
            description="L'evento calendario viene configurato con un reminder predefinito prima dell'orario di assunzione, così da ricevere un avviso in anticipo."
          />

          <p className="text-xs text-muted-foreground mt-2">
            Il calendario personale aiuta a ricordare gli orari delle cure, mentre FamilyMed
            permette di mantenere paziente e caregiver sincronizzati sulle informazioni della terapia.
          </p>
        </div>
      </TabsContent>

      {/* ─────────────── PWA ─────────────── */}
      <TabsContent value="offline" className="space-y-6">
        <HeroCard
          icon={Wifi}
          color="success"
          title="Puoi installare FamilyMed su qualunque dispositivo"
          description="FamilyMed può essere aggiunta alla schermata Home di smartphone, tablet e computer per essere utilizzata, senza dover installare nulla dagli store. Si può accedere anche da browser senza installazione (è fortemente consigliata l'installazione su smartphone e tablet)."
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
      </TabsContent>
    </Tabs>
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