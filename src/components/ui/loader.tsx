import { cn } from "@/lib/utils";

/**
 * Spinner personalizzato FamilyMed: tre "pillole" che pulsano in sequenza.
 * Decorativo: il testo accanto resta leggibile dagli screen reader.
 */
export function Loader({
  size = "md",
  className,
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dot =
    size === "sm" ? "h-2 w-1" : size === "lg" ? "h-5 w-2.5" : "h-3.5 w-1.5";

  return (
    <span
      role="status"
      aria-label="Caricamento in corso"
      className={cn("inline-flex items-center gap-1", className)}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden="true"
          className={cn("fm-dot rounded-full bg-primary", dot)}
          style={{ animationDelay: `${i * 0.14}s` }}
        />
      ))}
    </span>
  );
}

/** Schermata di caricamento a piena pagina, coerente con lo stile pubblico. */
export function FullPageLoader({ label = "Un attimo…" }: { label?: string }) {
  return (
    <div className="grid min-h-[60vh] w-full place-items-center px-6">
      <div className="fm-reveal flex flex-col items-center gap-4 text-center">
        <Loader size="lg" />
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

/** Blocco di caricamento inline (dentro card e liste). */
export function InlineLoader({
  label = "Caricamento…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3 py-6", className)}>
      <Loader size="sm" />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

export default Loader;
