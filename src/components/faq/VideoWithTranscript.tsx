import { useEffect, useRef, useState } from "react";
import { ChevronDown, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  src: string;
  poster?: string;
  title: string;
  transcript: string[];
  className?: string;
  autoPlay?: boolean;
  /** id univoco per collegare video e trascrizione (a11y) */
  id: string;
};

/**
 * Player video accessibile ed efficiente:
 * - il tag <video> viene montato solo quando entra nel viewport (lazy loading "intelligente"),
 *   e comunque non scarica nulla finché l'utente non preme play (preload="none").
 * - audio: solo musica di sottofondo inclusa nel file video (nessun sottotitolo, nessuna voce).
 * - trascrizione testuale espandibile per chi preferisce leggere.
 */
export function VideoWithTranscript({
  src,
  poster,
  title,
  transcript,
  className,
  autoPlay,
  id,
}: Props) {
  const [open, setOpen] = useState(false);
  const [inView, setInView] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const transcriptId = `${id}-transcript`;

  // Monta il <video> reale solo quando la card si avvicina al viewport,
  // così le pagine con più tutorial non scaricano nulla finché non servono.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={cn("w-full min-w-0", className)} ref={wrapperRef}>
      <div className="overflow-hidden rounded-2xl sm:rounded-3xl border border-border/60 bg-card shadow-lift">
        {inView ? (
          <video
            key={src}
            ref={videoRef}
            className="block w-full aspect-video bg-surface-muted"
            src={src}
            poster={poster}
            controls
            playsInline
            preload="none"
            autoPlay={autoPlay}
            aria-label={title}
            aria-describedby={transcriptId}
          />
        ) : (
          <img
            src={poster}
            alt={`Anteprima del video: ${title}`}
            loading="lazy"
            decoding="async"
            className="block w-full aspect-video object-cover bg-surface-muted"
          />
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={transcriptId}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border/60 px-3 py-1 text-[11px] font-bold text-foreground/80 transition-colors hover:bg-secondary"
        >
          <FileText className="size-3.5" aria-hidden="true" />
          {open ? "Nascondi trascrizione" : "Leggi la trascrizione"}
          <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>
      </div>

      <div
        id={transcriptId}
        hidden={!open}
        className="mt-3 rounded-2xl border border-border/60 bg-surface-muted p-4 text-left"
      >
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Trascrizione · {title}
        </p>
        <ol className="mt-3 space-y-2">
          {transcript.map((line, i) => (
            <li key={i} className="text-sm leading-relaxed text-foreground/85">
              {line}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
