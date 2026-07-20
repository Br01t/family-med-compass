/**
 * Footer semplicissimo, usato all'interno dell'app dopo il login
 * (dentro AppShell per il caregiver e PatientShell per il paziente).
 * Volutamente senza link: le pagine legali, la guida e i contatti
 * si trovano nella sezione "Informazioni & assistenza" delle Impostazioni.
 */
export function AppFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/60 py-4 px-4 w-full shrink-0">
      <p className="text-center text-[10px] sm:text-xs text-muted-foreground leading-tight">
        © {year} FamilyMed · Uso interno esclusivo. Non distribuire.
      </p>
    </footer>
  );
}