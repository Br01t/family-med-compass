import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Informativa sulla Privacy — FamilyMed" },
      {
        name: "description",
        content:
          "Informativa privacy di FamilyMed ai sensi del GDPR (Reg. UE 2016/679) per il trattamento dei dati personali e sanitari.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
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
          <h1 className="text-2xl font-black">Informativa sulla Privacy</h1>
          <p className="text-xs text-muted-foreground">
            Ultimo aggiornamento: 20 luglio 2026 — Ai sensi degli artt. 13-14 del Regolamento
            UE 2016/679 (GDPR) e del D.lgs. 196/2003.
          </p>

          <h2>1. Titolare del trattamento</h2>
          <p>
            Il Titolare del trattamento è <strong>Family Med</strong>,
            contattabile all'indirizzo email <strong>giacomo.piccinini1@gmail.com</strong>. Per esercitare i
            diritti previsti dal GDPR è possibile scrivere allo stesso indirizzo.
          </p>

          <h2>2. Categorie di dati trattati</h2>
          <ul>
            <li>
              <strong>Dati identificativi e di contatto:</strong> nome, cognome, email, ruolo
              (paziente o caregiver).
            </li>
            <li>
              <strong>Dati relativi alla salute (categoria particolare — art. 9 GDPR):</strong>
              nome dei farmaci, posologia, orari di assunzione, quantità in scorta, storico delle
              assunzioni (confermate, saltate, dimenticate), eventuali note del caregiver.
            </li>
            <li>
              <strong>Dati tecnici:</strong> log di autenticazione, token di sessione, informazioni
              di diagnostica dell'applicazione.
            </li>
          </ul>

          <h2>3. Finalità e base giuridica</h2>
          <ul>
            <li>
              Erogazione del servizio (gestione terapie, promemoria, condivisione con i familiari) —
              art. 6.1.b GDPR (esecuzione del contratto) e art. 9.2.a GDPR (<strong>consenso
              esplicito</strong> per i dati sanitari).
            </li>
            <li>
              Adempimenti legali e di sicurezza — art. 6.1.c GDPR.
            </li>
            <li>
              Statistiche interne aggregate e non identificative — legittimo interesse
              (art. 6.1.f GDPR).
            </li>
          </ul>
          <p>
            Il consenso al trattamento dei dati sanitari è <strong>facoltativo ma necessario</strong>
            per utilizzare l'app; senza tale consenso non è possibile registrare o monitorare
            terapie. Il consenso è revocabile in ogni momento dalle impostazioni dell'account.
          </p>

          <h2>4. Modalità del trattamento</h2>
          <p>
            I dati sono trattati con strumenti elettronici, protetti da autenticazione JWT,
            Row-Level Security a livello di database e crittografia in transito (TLS). L'accesso ai
            dati di un paziente è consentito solo al paziente stesso e ai caregiver da lui
            autorizzati tramite codice invito familiare.
          </p>

          <h2>5. Destinatari e responsabili esterni</h2>
          <ul>
            <li>
              <strong>Supabase (Supabase Inc., USA/UE):</strong> hosting database, autenticazione e
              storage — Responsabile del trattamento ex art. 28 GDPR, coperto da SCC.
            </li>
            <li>
              <strong>Cloudflare (Cloudflare Inc., USA):</strong> CDN e hosting dell'applicazione —
              coperto da SCC.
            </li>
            <li>Familiari autorizzati dal paziente tramite codice invito.</li>
          </ul>

          <h2>6. Trasferimenti extra-UE</h2>
          <p>
            Eventuali trasferimenti verso paesi terzi avvengono sulla base delle Standard
            Contractual Clauses approvate dalla Commissione Europea.
          </p>

          <h2>7. Periodo di conservazione</h2>
          <ul>
            <li>Dati account: fino alla cancellazione dell'account.</li>
            <li>Storico terapie e assunzioni: fino alla cancellazione richiesta dall'utente.</li>
            <li>Notifiche: eliminate automaticamente dopo 90 giorni.</li>
            <li>Log di sicurezza: massimo 12 mesi.</li>
          </ul>

          <h2>8. Diritti dell'interessato</h2>
          <p>
            L'utente può in ogni momento esercitare i diritti di accesso, rettifica, cancellazione,
            limitazione, opposizione e portabilità (artt. 15-22 GDPR), oltre al diritto di revocare
            il consenso e di proporre reclamo al <strong>Garante per la protezione dei dati
            personali</strong> (www.garanteprivacy.it).
          </p>

          <h2>9. Minori</h2>
          <p>
            Il servizio non è destinato a minori di 16 anni. Per pazienti minori l'account deve
            essere gestito da un genitore o tutore legale.
          </p>

          <h2>10. Modifiche</h2>
          <p>
            La presente informativa può essere aggiornata; le modifiche sostanziali saranno
            notificate all'interno dell'app.
          </p>
        </article>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link to="/termini" className="hover:underline">Termini di Servizio</Link>
          {" · "}
          <Link to="/cookie" className="hover:underline">Cookie Policy</Link>
        </p>
      </div>
    </div>
  );
}
