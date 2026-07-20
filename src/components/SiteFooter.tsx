import { Link } from "@tanstack/react-router";
import { Pill, Mail } from "lucide-react";

/**
 * Footer completo, mostrato SOLO nella landing page pubblica (prima del login).
 * Contiene i link legali, la guida e i contatti. All'interno dell'app,
 * dopo il login, viene usato invece <AppFooter /> (semplicissimo).
 */
export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/60 bg-surface-muted/40 w-full">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
          {/* Brand */}
          <div className="sm:col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5">
              <div className="grid size-9 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lift">
                <Pill className="size-4.5" />
              </div>
              <p className="text-base font-black tracking-tight">FamilyMed</p>
            </div>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground leading-relaxed">
              Un piccolo aiuto per chi vuoi bene: promemoria per il paziente, monitoraggio
              in tempo reale per la famiglia.
            </p>
          </div>

          {/* Prodotto */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Prodotto
            </p>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link to="/guida-pubblica" className="text-foreground/80 hover:text-primary transition-colors">
                  Guida all'app
                </Link>
              </li>
              <li>
                <Link to="/login" className="text-foreground/80 hover:text-primary transition-colors">
                  Accedi
                </Link>
              </li>
              <li>
                <Link to="/registrati" className="text-foreground/80 hover:text-primary transition-colors">
                  Registrati
                </Link>
              </li>
            </ul>
          </div>

          {/* Legale */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Legale
            </p>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link to="/privacy" className="text-foreground/80 hover:text-primary transition-colors">
                  Privacy
                </Link>
              </li>
              <li>
                <Link to="/termini" className="text-foreground/80 hover:text-primary transition-colors">
                  Termini di Servizio
                </Link>
              </li>
              <li>
                <Link to="/cookie" className="text-foreground/80 hover:text-primary transition-colors">
                  Cookie Policy
                </Link>
              </li>
            </ul>
          </div>

          {/* Contatti */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Contatti
            </p>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <a
                  href="mailto:giacomo.piccinini1@gmail.com"
                  className="inline-flex items-center gap-1.5 text-foreground/80 hover:text-primary transition-colors"
                >
                  <Mail className="size-3.5 shrink-0" />
                  Scrivici
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col-reverse items-center gap-3 border-t border-border/60 pt-6 sm:flex-row sm:justify-between">
          <p className="text-center text-[10px] sm:text-xs text-muted-foreground leading-tight">
            © {year} FamilyMed · Uso interno esclusivo. Non distribuire.
          </p>
          <p className="text-center text-[10px] sm:text-xs text-muted-foreground leading-tight">
            FamilyMed non sostituisce il parere medico: segui sempre le indicazioni del tuo medico curante.
          </p>
        </div>
      </div>
    </footer>
  );
}