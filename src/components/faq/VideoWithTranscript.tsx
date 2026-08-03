import { useState } from "react";
import { ChevronDown, FileText, Subtitles } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  src: string;
  poster?: string;
  captions: string;
  title: string;
  transcript: string[];
  className?: string;
  autoPlay?: boolean;
  /** id univoco per collegare video e trascrizione (a11y) */
  id: string;
};

/**
 * Player video accessibile: sottotitoli WebVTT attivi di default
 * + trascrizione testuale espandibile.
 */
export function VideoWithTranscript({
  src,
  poster,
  captions,
  title,
  transcript,
  className,
  autoPlay,
  id,
}: Props) {
  const [open, setOpen] = useState(false);
  const transcriptId = `${id}-transcript`;

  return (
    <div className={cn("w-full min-w-0", className)}>
      <div className="overflow-hidden rounded-2xl sm:rounded-3xl border border-border/60 bg-card shadow-lift">
        <video
          key={src}
          className="block w-full aspect-video bg-surface-muted"
          src={src}
          poster={poster}
          controls
          playsInline
          preload="none"
          autoPlay={autoPlay}
          aria-label={title}
          aria-describedby={transcriptId}
        >
          <track
            kind="captions"
            src={captions}
            srcLang="it"
            label="Italiano"
            default
          />
        </video>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-bold text-foreground/70">
          <Subtitles className="size-3.5" aria-hidden="true" />
          Sottotitoli in italiano
        </span>
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
