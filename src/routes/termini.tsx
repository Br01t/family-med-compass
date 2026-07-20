import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/termini")({
  head: () => ({
    meta: [
      { title: "Termini di Servizio — FamilyMed" },
      {
        name: "description",
        content:
          "Termini e condizioni d'uso di FamilyMed: obblighi, limitazioni di responsabilità e uso corretto dell'app.",
      },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="size-4" /> Torna alla home
        </Link>

        <article className="prose prose-sm max-w-none rounded-3xl border border-border/60 bg-card p-8 shadow-card">
          <h1 className="text-2xl font-black">Termini di Servizio</h1>
          <p className="text-xs text-muted-foreground">Ultimo aggiornamento: 20 luglio 2026</p>

          <h2>1. Oggetto</h2>
          <p>
            FamilyMed ("il Servizio") è un'applicazione di supporto alla gestione della terapia
            farmacologica domiciliare che consente al paziente di ricevere promemoria e al
            caregiver di monitorare l'aderenza alle cure. Utilizzando il Servizio si accettano
            integralmente i presenti Termini.
          </p>

          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
            <p className="m-0 text-sm font-semibold">
              ⚠️ Avvertenza medica importante
            </p>
            <p className="m-0 mt-1 text-sm">
              FamilyMed <strong>non è un dispositivo medico</strong>, non fornisce diagnosi né
              consigli terapeutici e non sostituisce in alcun modo il parere di un medico o di un
              farmacista. In caso di emergenza chiamare il <strong>112</strong>. Non modificare mai
              autonomamente dosaggi o cure sulla base delle informazioni presenti nell'app.
            </p>
          </div>

          <h2>2. Registrazione e account</h2>
          <p>
            Per usare il Servizio è necessario creare un account fornendo dati veritieri, avere
            almeno 16 anni e mantenere riservate le credenziali di accesso. L'utente è responsabile
            di tutte le attività svolte con il proprio account.
          </p>

          <h2>3. Ruoli</h2>
          <ul>
            <li>
              <strong>Paziente:</strong> gestisce le proprie terapie e visualizza i promemoria.
            </li>
            <li>
              <strong>Caregiver principale:</strong> chi crea l'account del paziente o riceve la
              nomina; può modificare terapie, scorte e invitare altri caregiver.
            </li>
            <li>
              <strong>Caregiver secondario:</strong> visualizza lo stato e può confermare le dosi,
              ma non può modificare dosaggi né invitare altre persone.
            </li>
          </ul>

          <h2>4. Uso corretto</h2>
          <p>Sono vietate, tra le altre, le seguenti condotte:</p>
          <ul>
            <li>Inserimento di dati sanitari relativi a soggetti diversi dal titolare del profilo senza il loro consenso;</li>
            <li>Tentativi di accesso non autorizzato ad account di terzi;</li>
            <li>Uso automatizzato o reverse engineering del Servizio;</li>
            <li>Uso a scopo diagnostico o terapeutico professionale.</li>
          </ul>

          <h2>5. Limitazione di responsabilità</h2>
          <p>
            Nei limiti consentiti dalla legge, il fornitore del Servizio non risponde di danni
            diretti o indiretti derivanti da: (i) omessa o ritardata ricezione dei promemoria per
            cause tecniche (assenza di rete, notifiche disattivate a livello di sistema
            operativo, dispositivo spento); (ii) inserimento di dati errati da parte dell'utente;
            (iii) decisioni terapeutiche prese sulla base delle informazioni dell'app.
          </p>
          <p>
            <strong>
              Il paziente e il caregiver restano gli unici responsabili della corretta assunzione
              dei farmaci.
            </strong>
          </p>

          <h2>6. Proprietà intellettuale</h2>
          <p>
            Il codice, il marchio, la grafica e i contenuti del Servizio sono protetti da diritti
            di proprietà intellettuale del Titolare o dei rispettivi licenziatari.
          </p>

          <h2>7. Recesso e cancellazione</h2>
          <p>
            L'utente può in qualsiasi momento cancellare il proprio account dalla sezione
            Impostazioni. La cancellazione comporta l'eliminazione dei dati personali salvo
            obblighi di conservazione previsti dalla legge.
          </p>

          <h2>8. Modifiche</h2>
          <p>
            I presenti Termini possono essere modificati; la nuova versione sarà notificata via
            email o all'interno dell'app almeno 15 giorni prima dell'entrata in vigore.
          </p>

          <h2>9. Legge applicabile e foro</h2>
          <p>
            I presenti Termini sono regolati dalla legge italiana. Per il consumatore è competente
            il foro del luogo di residenza o domicilio; negli altri casi il foro competente in via
            esclusiva è quello di <strong>[Città del Titolare]</strong>.
          </p>
        </article>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link to="/privacy" className="hover:underline">Informativa Privacy</Link>
          {" · "}
          <Link to="/cookie" className="hover:underline">Cookie Policy</Link>
        </p>
      </div>
    </div>
  );
}
