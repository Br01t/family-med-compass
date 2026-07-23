import { useState } from "react";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { OnboardingTour, resetOnboarding } from "@/components/onboarding/OnboardingTour";
import { Sparkles } from "lucide-react";
import {
  Bell,
  CheckCircle2,
  Download,
  HeartPulse,
  Hospital,
  KeyRound,
  LayoutDashboard,
  Lock,
  Package,
  BarChart3,
  Pill,
  Plus,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  UserCheck,
  Users,
  Wifi,
  Wrench,
  CalendarPlus,
} from "lucide-react";

export function GuidaContent() {
  const [tourOpen, setTourOpen] = useState(false);
  const [tourRole, setTourRole] = useState<"caregiver" | "paziente">("caregiver");
  const launchTour = (role: "caregiver" | "paziente") => {
    resetOnboarding(role);
    setTourRole(role);
    setTourOpen(true);
  };

  return (
    <>
      <OnboardingTour open={tourOpen} onOpenChange={setTourOpen} role={tourRole} />

      <div className="mb-6 rounded-2xl border border-primary/20 bg-primary-soft/40 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-black tracking-tight">Vuoi vedere il tour guidato?</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Un tour rapido con tutte le azioni principali dell&apos;app.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => launchTour("caregiver")} className="font-bold">
                Tour Caregiver
              </Button>
              <Button size="sm" variant="outline" onClick={() => launchTour("paziente")} className="font-bold">
                Tour Paziente
              </Button>
            </div>
          </div>
        </div>
      </div>

    <Tabs defaultValue="caregiver" className="space-y-6">
      <TabsList className="flex-wrap h-auto gap-1 rounded-2xl bg-secondary p-1">
        <TabsTrigger value="caregiver" className="rounded-xl gap-2 data-[state=active]:shadow-card">
          <Users className="size-4" /> Caregiver
        </TabsTrigger>
        <TabsTrigger value="paziente" className="rounded-xl gap-2 data-[state=active]:shadow-card">
          <HeartPulse className="size-4" /> Paziente
        </TabsTrigger>
        <TabsTrigger value="privacy" className="rounded-xl gap-2 data-[state=active]:shadow-card">
          <Shield className="size-4" /> Privacy & famiglia
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
            title="Collegati ai tuoi pazienti"
            description='Vai su Pazienti → registra un nuovo paziente, oppure inserisci il codice invito che ti ha condiviso il paziente (o un altro familiare) per entrare nella sua famiglia.'
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
          <GuideRow
            icon={Plus}
            title="Aggiungere un paziente gestito (senza account)"
            description='Vai su "Pazienti" → "+ Aggiungi paziente" → inserisci nome e anno di nascita. Viene creato un profilo paziente collegato al tuo account: tu diventi Caregiver Primario e puoi gestire terapie, scorte e conferme al posto suo. Il paziente così creato non ha email né password — non fa login, esiste solo dentro la tua famiglia. Se in futuro vorrà accedere in prima persona, dovrà registrarsi autonomamente scegliendo il ruolo Paziente e potrai collegarlo alla famiglia tramite un codice invito.'
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
            <Divider />
            <GuideRow
              icon={Shield}
              title="Chi può vedere questi dati?"
              description='Solo tu e gli altri caregiver collegati allo stesso paziente tramite codice invito. Vedi la scheda "Privacy & famiglia" per i dettagli su come funziona il collegamento e come restano protetti i dati.'
            />
          </div>

        <SectionTitle>Eccezioni & Imprevisti</SectionTitle>
        <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-card space-y-4">
          <div className="flex items-start gap-4">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-warning/15 text-warning">
              <Wrench className="size-4" />
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              La pagina <strong className="text-foreground">Eccezioni & Imprevisti</strong> è il punto di
              riferimento per tutto ciò che esce dalla routine normale di una terapia: dosi perse, dosaggi
              cambiati dal medico, ricoveri, farmaci sostitutivi. È accessibile solo al caregiver primario del
              paziente.
            </p>
          </div>
          <Divider />
          <GuideRow
            icon={ShieldAlert}
            title="Scalare le scorte manualmente"
            description="Quando la quantità reale di farmaco non corrisponde più a quella registrata per una causa eccezionale (compressa rotta o caduta, dose doppia presa per errore, farmaco scaduto, degenza ospedaliera, o altra perdita imprevista), seleziona paziente, terapia e quantità e premi 'Scala scorte'. Le dosi vengono sottratte subito dalla scorta residua, ma senza registrare una presa: calendario, promemoria e aderenza del paziente restano invariati."
          />
          <Divider />
          <GuideRow
            icon={Hospital}
            title="Guide passo-passo per le altre eccezioni"
            description="Nella stessa pagina trovi anche guide pratiche per: sospendere temporaneamente una terapia, gestire un cambio di dosaggio prescritto dal medico, interrompere definitivamente una cura, registrare l'acquisto di una nuova confezione, gestire un ricovero ospedaliero e sostituire temporaneamente un farmaco con un equivalente."
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

        <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-card space-y-4">
          <div className="flex items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
              <KeyRound className="size-4" />
            </div>
            <p className="font-black text-lg tracking-tight">Invitare i tuoi familiari</p>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Vai su <strong className="text-foreground">Impostazioni → Codici invito famiglia</strong> e genera un
            codice: è valido 24 ore e utilizzabile una sola volta. Condividilo a voce, per messaggio o
            email solo con il familiare che vuoi far entrare nella tua famiglia: dovrà inserirlo nella
            sua pagina "Pazienti" per collegarsi a te.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Puoi generare più codici e revocare in qualsiasi momento quelli non ancora usati dalla
            stessa schermata. Trovi tutti i dettagli sulla protezione dei tuoi dati nella scheda
            "Privacy & famiglia".
          </p>
        </div>
      </TabsContent>

      {/* ─────────────── PRIVACY & FAMIGLIA ─────────────── */}
      <TabsContent value="privacy" className="space-y-6">
        <HeroCard
          icon={Shield}
          color="success"
          title="La tua famiglia, al sicuro"
          description="FamilyMed è organizzato in famiglie isolate tra loro: ogni paziente ha una propria cerchia di caregiver e nessuno al di fuori di quella cerchia può vedere le sue terapie, i suoi orari o il suo storico."
        />

        <SectionTitle>Come ci si collega in famiglia</SectionTitle>
        <div className="grid gap-4 md:grid-cols-3">
          <StepCard
            number={1}
            title="Registrazione con consenso esplicito"
            description="In fase di registrazione scegli il ruolo (Caregiver o Paziente) e presti due consensi separati e obbligatori: uno a Termini e Privacy, uno specifico al trattamento dei dati sanitari (farmaci, orari, aderenza)."
            icon={UserCheck}
          />
          <StepCard
            number={2}
            title="Generazione del codice invito"
            description='Il paziente (dalle Impostazioni) genera un codice invito valido 24 ore e utilizzabile una sola volta, da condividere privatamente con un familiare specifico.'
            icon={KeyRound}
          />
          <StepCard
            number={3}
            title="Collegamento alla famiglia"
            description='Il familiare inserisce il codice in "Pazienti". Da quel momento diventa caregiver secondario solo per quel paziente, senza accesso ad altri nuclei familiari sulla piattaforma.'
            icon={Users}
          />
        </div>

        <SectionTitle>Come restano protetti i tuoi dati</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <FeatureCard
            icon={Lock}
            title="Famiglie isolate a livello di database"
            description="Le regole di accesso ai dati (Row Level Security) sono applicate direttamente sul database: un caregiver può leggere solo i pazienti a cui è effettivamente collegato. Non esiste una lista o una ricerca di pazienti di altre famiglie."
          />
          <FeatureCard
            icon={KeyRound}
            title="Codici invito a tempo e monouso"
            description="Ogni codice scade dopo 24 ore e può essere usato una sola volta. Puoi revocare in qualunque istante un codice non ancora utilizzato dalle Impostazioni, così da tenere sotto controllo chi può entrare nella tua famiglia."
          />
          <FeatureCard
            icon={ShieldCheck}
            title="Consenso sanitario esplicito e revocabile"
            description="Il trattamento dei dati relativi alla salute richiede un consenso esplicito e separato, ai sensi dell'art. 9.2.a GDPR, con prova registrata al momento della registrazione. Può essere revocato in qualsiasi momento dalle Impostazioni."
          />
          <FeatureCard
            icon={Users}
            title="Uscire da una famiglia quando vuoi"
            description={`Un caregiver secondario può scollegarsi in autonomia da "Pazienti" (Scollegati): perde immediatamente l'accesso ai dati di quel paziente, senza bisogno di coinvolgere nessun altro.`}
          />
        </div>

        <div className="rounded-3xl border border-primary/20 bg-primary-soft/40 p-6">
          <p className="font-black text-sm text-primary">Perché è importante</p>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            I dati sanitari sono dati particolari secondo il GDPR. Per questo FamilyMed limita
            l'accesso al minimo indispensabile: solo chi è stato esplicitamente invitato da un
            membro della famiglia può vedere le terapie e lo storico di un paziente, e solo per il
            tempo in cui resta collegato a quella famiglia.
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
    </>
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