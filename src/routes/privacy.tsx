import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { LEGAL_CONTACT } from "@/lib/legal-contact";

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
            Ultimo aggiornamento: 31 agosto 2026 — Ai sensi degli artt. 13-14 del Regolamento
            UE 2016/679 (GDPR) e del D.lgs. 196/2003.
          </p>

          <h2>1. Titolare del trattamento</h2>
          <p>
            Il Titolare del trattamento è <strong>[NOME COGNOME / RAGIONE SOCIALE]</strong>,
            {" "}<strong>[Ditta individuale / Libero professionista]</strong> con Partita IVA{" "}
            <strong>[P.IVA]</strong>, con sede in <strong>[CITTÀ, PROVINCIA]</strong>.
          </p>
          <p>
            Per esercitare i diritti previsti dal GDPR o per qualsiasi domanda sul trattamento dei
            dati è possibile scrivere a <strong>{LEGAL_CONTACT.privacyEmail}</strong>
            {" "}o, per comunicazioni con valore legale, a <strong>[PEC — vedi nota sotto]</strong>.
          </p>
          <p className="text-xs text-muted-foreground">
            <em>
              Nota per chi compila: sostituire i placeholder con i dati reali prima della
              pubblicazione. Se non si dispone ancora di una PEC, verificarne l'obbligo attuale per
              i titolari di Partita IVA (l'iscrizione è ormai richiesta per la generalità delle
              attività con P.IVA, incluse le ditte individuali) — il commercialista/Fiscozen può
              indicare la procedura più rapida per attivarne una a basso costo.
            </em>
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
            Il trattamento dei dati sanitari (nome dei farmaci, posologia, orari, storico
            assunzioni) è il cuore stesso del servizio richiesto: senza registrare questi dati,
            l'app non può funzionare. Per questo il consenso esplicito al trattamento dei dati
            sanitari è <strong>un prerequisito necessario per usare le funzioni di gestione
            terapie</strong> — non è possibile attivarle senza prestarlo, così come non è
            possibile creare un account senza accettare Termini e Privacy.
          </p>
          <p>
            L'utente può <strong>revocare il consenso in qualsiasi momento</strong> dalle
            impostazioni dell'account. La revoca non è retroattiva (non incide sulla liceità del
            trattamento già effettuato) ma comporta la disattivazione delle funzioni di gestione
            terapie, poiché quel trattamento non può più avvenire senza la relativa base
            giuridica; l'utente può comunque richiedere in qualsiasi momento l'esportazione o la
            cancellazione dei propri dati come descritto alla sezione 9.
          </p>

          <h2>4. Dati inseriti da un caregiver per conto di un'altra persona</h2>
          <p>
            In molti casi chi inserisce i dati sanitari di un paziente (nome dei farmaci,
            posologia, storico assunzioni) non è la persona a cui quei dati si riferiscono, ma un
            familiare o un caregiver che se ne prende cura — ad esempio un figlio che gestisce le
            terapie di un genitore anziano non autonomo nell'uso dell'app.
          </p>
          <p>
            In questi casi, al momento di aggiungere un nuovo paziente il caregiver deve
            dichiarare esplicitamente di avere titolo per farlo, in quanto genitore, tutore legale,
            amministratore di sostegno, oppure su indicazione diretta della persona interessata.
            Questa dichiarazione viene registrata con data, ora e riferimento al paziente per cui è
            stata resa, secondo lo stesso principio di responsabilizzazione (<em>accountability</em>)
            già applicato al consenso di registrazione (art. 7.1 GDPR).
          </p>
          <p>
            Il Titolare del trattamento non verifica autonomamente la veridicità di tale
            dichiarazione, che resta nella responsabilità di chi la rende. Un paziente maggiorenne
            e capace di intendere e di volere può in qualsiasi momento richiedere l'accesso, la
            rettifica o la cancellazione dei propri dati inseriti da un caregiver, oppure revocare
            l'autorizzazione, scrivendo agli indirizzi indicati alla sezione 1.
          </p>

          <h2>5. Modalità del trattamento</h2>
          <p>
            I dati sono trattati con strumenti elettronici, protetti da autenticazione JWT,
            Row-Level Security a livello di database e crittografia in transito (TLS). L'accesso ai
            dati di un paziente è consentito solo al paziente stesso e ai caregiver da lui
            autorizzati tramite codice invito familiare.
          </p>

          <h2>6. Destinatari e responsabili esterni</h2>
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

          <h2>7. Trasferimenti extra-UE</h2>
          <p>
            Eventuali trasferimenti verso paesi terzi avvengono sulla base delle Standard
            Contractual Clauses approvate dalla Commissione Europea.
          </p>

          <h2>8. Periodo di conservazione dei dati</h2>
          <p>
            Al fine di ridurre al minimo il trattamento e garantire la massima protezione del Free Tier, i dati vengono conservati secondo i seguenti tempi di retention automatica:
          </p>
          <ul>
            <li><strong>Dati account e profilo:</strong> conservati fino alla cancellazione dell'account da parte dell'utente.</li>
            <li><strong>Terapie e posologia attiva:</strong> conservate fino all'eliminazione manuale della terapia o dell'account.</li>
            <li><strong>Notifiche e alert:</strong> eliminate automaticamente dal database dopo <strong>30 giorni</strong>.</li>
            <li><strong>Log delle azioni familiari (Audit Log):</strong> eliminati automaticamente dopo <strong>90 giorni</strong>.</li>
            <li><strong>Storico assunzioni/eventi dosi passate:</strong> eliminati automaticamente dal database dopo <strong>180 giorni</strong> (i report PDF scaricati rimangono in possesso del paziente/caregiver).</li>
          </ul>

          <h2>9. Diritti dell'interessato</h2>
          <p>
            L'utente può in ogni momento esercitare i diritti di accesso, rettifica, cancellazione,
            limitazione, opposizione e portabilità (artt. 15-22 GDPR), oltre al diritto di revocare
            il consenso e di proporre reclamo al <strong>Garante per la protezione dei dati
            personali</strong> (www.garanteprivacy.it).
          </p>

          <h2>10. Minori</h2>
          <p>
            Il servizio non è destinato a minori di 16 anni. Per pazienti minori l'account deve
            essere gestito da un genitore o tutore legale.
          </p>

          <h2>11. Modifiche</h2>
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