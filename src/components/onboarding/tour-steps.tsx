import type { ReactNode } from "react";
import {
  Bell,
  CheckCircle2,
  Clock,
  HeartPulse,
  KeyRound,
  LayoutDashboard,
  Package,
  Pill,
  Plus,
  Users,
  UserCheck,
  CalendarClock,
  ShieldCheck,
} from "lucide-react";

export type TourStep = {
  icon: ReactNode;
  title: string;
  body: ReactNode;
  /** Optional deep-link the user can jump to. Only shown when authenticated. */
  cta?: { label: string; to: string };
  /** Optional visual mock/demo. */
  demo?: ReactNode;
};

/* --------------------------- CAREGIVER TOUR --------------------------- */

export const caregiverSteps: TourStep[] = [
  {
    icon: <HeartPulse className="size-6" />,
    title: "Benvenuto, caregiver 👋",
    body: (
      <>
        FamilyMed ti aiuta a seguire da lontano le terapie di chi ami. In pochi
        passi ti mostro <b>tutto quello che puoi fare</b> — puoi interrompere in
        qualsiasi momento.
      </>
    ),
    demo: (
      <div className="rounded-2xl border border-border/60 bg-primary-soft/40 p-5 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-primary">
          Anteprima
        </p>
        <p className="mt-1 text-2xl font-black tracking-tight">
          La tua Famiglia, sotto controllo
        </p>
      </div>
    ),
  },
  {
    icon: <UserCheck className="size-6" />,
    title: "1. Aggiungi il tuo primo paziente",
    body: (
      <>
        Dalla pagina <b>Pazienti</b> puoi creare un profilo gestito (basta
        nome ed età): il paziente non ha bisogno di un account. In alternativa,
        se ha già installato l&apos;app, generi un <b>codice invito</b> e lui lo
        inserisce per collegarsi alla tua famiglia.
      </>
    ),
    cta: { label: "Vai a Pazienti", to: "/pazienti" },
    demo: (
      <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-card">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Plus className="size-5" />
          </div>
          <div>
            <p className="text-sm font-bold">Nuovo paziente</p>
            <p className="text-xs text-muted-foreground">
              Nome, età — pronti in 30 secondi.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    icon: <Pill className="size-6" />,
    title: "2. Aggiungi le terapie",
    body: (
      <>
        Per ogni paziente inserisci farmaci, dosaggio, orari, scorte e tempo
        massimo di ritardo. FamilyMed calcolerà da solo <b>promemoria</b>,{" "}
        <b>ritardi</b> e <b>dimenticate</b>.
      </>
    ),
    cta: { label: "Vai a Terapie", to: "/terapie" },
  },
  {
    icon: <LayoutDashboard className="size-6" />,
    title: "3. La tua Dashboard",
    body: (
      <>
        La <b>Dashboard</b> è il tuo pannello di controllo: alert attivi,
        scorte in esaurimento, aderenza settimanale e la timeline delle dosi
        di ieri, oggi e domani. Ogni card è cliccabile per aprire il dettaglio.
      </>
    ),
    cta: { label: "Apri la Dashboard", to: "/caregiver" },
    demo: (
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border/60 bg-card p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-destructive">
            Alert attivi
          </p>
          <p className="mt-1 text-2xl font-black">2</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary">
            Aderenza 7gg
          </p>
          <p className="mt-1 text-2xl font-black">94%</p>
        </div>
      </div>
    ),
  },
  {
    icon: <CheckCircle2 className="size-6" />,
    title: "4. Dosi da confermare",
    body: (
      <>
        Se una dose diventa <b>dimenticata</b> o <b>saltata</b>, puoi
        confermarla manualmente al posto del paziente (dopo averlo sentito):
        aggiorna lo storico e scala le scorte.
      </>
    ),
    cta: { label: "Vai a Dosi da confermare", to: "/dose-da-confermare" },
  },
  {
    icon: <Bell className="size-6" />,
    title: "5. Notifiche in tempo reale",
    body: (
      <>
        Ricevi una notifica quando il paziente <b>conferma</b>, <b>rimanda</b>
        {" "}o <b>salta</b> una dose, e quando una scorta sta finendo. Trovi
        tutto nel centro notifiche interno.
      </>
    ),
    cta: { label: "Apri le notifiche", to: "/notifiche" },
  },
  {
    icon: <Package className="size-6" />,
    title: "6. Scorte e storico",
    body: (
      <>
        Nella pagina <b>Scorte</b> ricarichi le pillole con un tap. Nello{" "}
        <b>Storico</b> vedi aderenza, calendario e puoi <b>scaricare il PDF</b>
        {" "}dei 7/30/90 giorni da portare al medico.
      </>
    ),
    cta: { label: "Vai a Storico", to: "/storico-report" },
  },
  {
    icon: <ShieldCheck className="size-6" />,
    title: "Sei pronto! 🎉",
    body: (
      <>
        Puoi rivedere questo tour quando vuoi dalla <b>Guida</b> o dalla home.
        Buona cura!
      </>
    ),
  },
];

/* --------------------------- PATIENT TOUR --------------------------- */

export const patientSteps: TourStep[] = [
  {
    icon: <HeartPulse className="size-6" />,
    title: "Ciao! 👋",
    body: (
      <>
        FamilyMed ti ricorda quando prendere le medicine. È semplicissima:
        pulsanti grandi, un tap e hai finito. Ti mostro come funziona.
      </>
    ),
  },
  {
    icon: <Clock className="size-6" />,
    title: "L’orario della medicina",
    body: (
      <>
        Poco prima dell&apos;orario, il telefono <b>suona</b> e ti mostra una
        finestra grande con il nome del farmaco. Vedi il <b>timer</b> per
        sapere quanto tempo hai ancora per confermarla.
      </>
    ),
    demo: (
      <div className="rounded-2xl border-l-8 border-accent bg-card p-4 shadow-card">
        <p className="text-lg font-black">Cardioaspirina</p>
        <p className="text-xs text-muted-foreground">100mg · 1 compressa</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs font-bold text-muted-foreground">
            Tempo per confermare
          </span>
          <span className="text-lg font-black text-primary">08:42</span>
        </div>
      </div>
    ),
  },
  {
    icon: <CheckCircle2 className="size-6" />,
    title: "Ho preso la medicina",
    body: (
      <>
        Quando l&apos;hai presa, premi il pulsante verde grande{" "}
        <b>“Ho preso la medicina”</b>. La famiglia riceve subito la conferma.
        Non serve fare altro.
      </>
    ),
    demo: (
      <div className="grid h-14 place-items-center rounded-xl bg-primary text-base font-bold text-primary-foreground shadow-lift">
        ✓ Ho preso la medicina
      </div>
    ),
  },
  {
    icon: <CalendarClock className="size-6" />,
    title: "Non posso adesso: Rimanda",
    body: (
      <>
        Se stai facendo altro puoi premere <b>Rimanda</b>: la finestra
        ricomparirà dopo il tempo deciso dal medico. Puoi rimandare{" "}
        <b>solo una volta</b>.
      </>
    ),
  },
  {
    icon: <Pill className="size-6" />,
    title: "Le tue terapie",
    body: (
      <>
        Nella pagina <b>Terapie</b> vedi l&apos;elenco dei tuoi farmaci e i
        prossimi orari. Nella <b>Home</b> hai sempre in evidenza la prossima
        dose.
      </>
    ),
    cta: { label: "Vai a Terapie", to: "/le-mie-terapie" },
  },
  {
    icon: <Bell className="size-6" />,
    title: "Notifiche",
    body: (
      <>
        Nel centro notifiche trovi il riepilogo di cosa hai preso, rimandato
        o saltato. Se salti una dose, un familiare potrebbe chiamarti per
        aiutarti — è normale, tranquillo.
      </>
    ),
    cta: { label: "Apri le notifiche", to: "/notifiche" },
  },
  {
    icon: <KeyRound className="size-6" />,
    title: "Collegati alla famiglia",
    body: (
      <>
        Se un familiare ti ha dato un <b>codice invito</b>, inseriscilo dalle{" "}
        <b>Impostazioni</b>: potrà seguirti a distanza e aiutarti se serve.
      </>
    ),
    cta: { label: "Vai a Impostazioni", to: "/impostazioni" },
  },
  {
    icon: <Users className="size-6" />,
    title: "Tutto qui! 💙",
    body: (
      <>
        Puoi rivedere questa guida quando vuoi dalla pagina <b>Guida</b>. In
        bocca al lupo!
      </>
    ),
  },
];
