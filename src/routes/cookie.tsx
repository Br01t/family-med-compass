import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { LEGAL_CONTACT } from "@/lib/legal-contact";
import { PublicPageShell } from "@/components/public/PublicPageShell";

export const Route = createFileRoute("/cookie")({
  head: () => ({
    meta: [
      { title: "Cookie Policy — FamilyMed" },
      {
        name: "description",
        content: "Elenco dei cookie e delle tecnologie di archiviazione locale usate da FamilyMed.",
      },
    ],
  }),
  component: CookiePage,
});

function CookiePage() {
  return (
    <PublicPageShell currentPath="/cookie">
      <div className="py-6 sm:py-8 max-w-3xl mx-auto">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-ocean-200 hover:text-ocean-300 transition-colors font-medium"
        >
          <ArrowLeft className="size-4" /> Torna alla home
        </Link>

        <article className="prose prose-invert max-w-none rounded-3xl border border-ocean-600/30 bg-ocean-800/40 p-6 sm:p-12 shadow-ocean backdrop-blur-sm">
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-white italic">Cookie Policy</h1>
          <p className="text-xs sm:text-sm text-ocean-200 font-normal">Ultimo aggiornamento: 31 agosto 2026</p>

          <h2>1. Cosa sono i cookie</h2>
          <p>
            I cookie sono piccoli file di testo salvati sul dispositivo dell'utente. FamilyMed
            utilizza anche tecnologie affini quali <em>localStorage</em> e <em>sessionStorage</em>.
          </p>

          <h2>2. Cookie e archiviazione utilizzati</h2>
          <ul>
            <li>
              <strong>Tecnici / sessione (necessari):</strong> token di autenticazione Supabase
              salvati in <code>localStorage</code> per mantenere l'utente collegato. Senza di essi
              l'app non funziona: non richiedono consenso ex art. 122 Codice Privacy.
            </li>
            <li>
              <strong>Preferenze:</strong> impostazioni locali come lo stato del banner di
              installazione PWA.
            </li>
            <li>
              <strong>Service Worker cache:</strong> l'app registra un service worker per il
              funzionamento offline, che memorizza asset statici sul dispositivo.
            </li>
          </ul>

          <h2>3. Cookie di terze parti</h2>
          <p>
            FamilyMed <strong>non utilizza cookie di profilazione, di marketing o di analytics di
            terze parti</strong>. L'unico servizio esterno contattato è Supabase per
            l'autenticazione e la sincronizzazione dei dati.
          </p>

          <h2>4. Gestione del consenso</h2>
          <p>
            Poiché sono utilizzati esclusivamente cookie tecnici necessari, non è richiesto un
            banner di consenso. L'utente può comunque cancellare in qualsiasi momento cookie e
            storage locale dalle impostazioni del proprio browser: ciò comporterà la disconnessione
            dall'account.
          </p>

          <h2>5. Contatti</h2>
          <p>
            Per domande sulla presente Cookie Policy scrivere a <strong>{LEGAL_CONTACT.privacyEmail}</strong>.
          </p>
        </article>

        <p className="mt-8 text-center text-sm text-ocean-200">
          <Link to="/privacy" className="hover:text-ocean-300 underline transition-colors">Informativa Privacy</Link>
          {" · "}
          <Link to="/termini" className="hover:text-ocean-300 underline transition-colors">Termini di Servizio</Link>
        </p>
      </div>
    </PublicPageShell>
  );
}