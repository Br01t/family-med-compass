import { Link } from "@tanstack/react-router";
import { Users, Mail } from "lucide-react";
import { LEGAL_CONTACT } from "@/lib/legal-contact";

export function PublicFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-stone-200/80 bg-stone-100/70 backdrop-blur-md mt-16 sm:mt-24 text-stone-700">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
          {/* Brand */}
          <div className="sm:col-span-2 md:col-span-1">
            <Link to="/" className="group flex items-center gap-2.5">
              <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-emerald-800 text-white shadow-xs group-hover:bg-emerald-900 transition-colors">
                <Users className="size-4" />
              </div>
              <p className="font-display text-lg font-bold text-stone-900 italic">FamilyMed</p>
            </Link>
            <p className="mt-3 text-sm text-stone-600 leading-relaxed max-w-xs">
              Il luogo condiviso dove la famiglia coordina la cura quotidiana: promemoria, visibilità in tempo reale e serenità.
            </p>
          </div>

          {/* Navigazione */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-900">
              Prodotto
            </p>
            <ul className="mt-3.5 space-y-2.5 text-sm">
              <li>
                <Link to={"/prezzi" as any} className="text-stone-600 hover:text-emerald-800 transition-colors">
                  Prezzi e Piani
                </Link>
              </li>
              <li>
                <Link to="/guida-pubblica" className="text-stone-600 hover:text-emerald-800 transition-colors">
                  Guida all'app
                </Link>
              </li>
              <li>
                <Link to="/registrati" className="text-stone-600 hover:text-emerald-800 transition-colors">
                  Inizia gratis
                </Link>
              </li>
              <li>
                <Link to="/login" className="text-stone-600 hover:text-emerald-800 transition-colors">
                  Accedi
                </Link>
              </li>
            </ul>
          </div>

          {/* Legale */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-900">
              Note Legali
            </p>
            <ul className="mt-3.5 space-y-2.5 text-sm">
              <li>
                <Link to="/privacy" className="text-stone-600 hover:text-emerald-800 transition-colors">
                  Informativa Privacy
                </Link>
              </li>
              <li>
                <Link to="/termini" className="text-stone-600 hover:text-emerald-800 transition-colors">
                  Termini di Servizio
                </Link>
              </li>
              <li>
                <Link to="/cookie" className="text-stone-600 hover:text-emerald-800 transition-colors">
                  Cookie Policy
                </Link>
              </li>
            </ul>
          </div>

          {/* Contatti */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-900">
              Contatti
            </p>
            <ul className="mt-3.5 space-y-2.5 text-sm">
              <li>
                <a
                  href={`mailto:${LEGAL_CONTACT.supportEmail}`}
                  className="inline-flex items-center gap-1.5 text-stone-600 hover:text-emerald-800 transition-colors"
                >
                  <Mail className="size-3.5 shrink-0 text-emerald-700" />
                  <span>Supporto Famiglie</span>
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${LEGAL_CONTACT.privacyEmail}`}
                  className="inline-flex items-center gap-1.5 text-stone-600 hover:text-emerald-800 transition-colors"
                >
                  <Mail className="size-3.5 shrink-0 text-emerald-700" />
                  <span>Privacy & DPO</span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-stone-200/80 pt-6 sm:flex-row text-xs text-stone-500">
          <p>
            © {year} FamilyMed · Protezione e conformità dati sanitari GDPR
          </p>
          <p className="text-center sm:text-right max-w-md">
            FamilyMed non sostituisce il parere medico: segui sempre le indicazioni del medico curante.
          </p>
        </div>
      </div>
    </footer>
  );
}
