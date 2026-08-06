import { useEffect, useRef, useState } from "react";
import { ChevronDown, FileText, Volume2, Volume1, VolumeX, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";

type FullscreenVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitRequestFullscreen?: () => Promise<void> | void;
};

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
  // Volume della musica di sottofondo: preferenza ricordata tra un video e l'altro.
  const [volume, setVolume] = useState(0.5);
  const [muted, setMuted] = useState(false);

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

  // Ricorda la preferenza audio dell'utente tra un tutorial e l'altro.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("faq-video-audio");
      if (!raw) return;
      const saved = JSON.parse(raw) as { volume?: number; muted?: boolean };
      if (typeof saved.volume === "number") setVolume(Math.min(1, Math.max(0, saved.volume)));
      if (typeof saved.muted === "boolean") setMuted(saved.muted);
    } catch {
      /* preferenza non disponibile: si usano i valori di default */
    }
  }, []);

  // Applica volume/mute al player (anche quando si cambia video).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
    v.muted = muted || volume === 0;
    try {
      localStorage.setItem("faq-video-audio", JSON.stringify({ volume, muted }));
    } catch {
      /* storage non disponibile */
    }
  }, [volume, muted, inView, src]);


  // Avvia la riproduzione a schermo intero (con fallback iOS/Safari).
  const handleFullscreen = async () => {
    setInView(true);
    // se il <video> non è ancora montato, aspetta il prossimo frame di render
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const v = videoRef.current as FullscreenVideo | null;
    if (!v) return;
    try {
      if (typeof v.requestFullscreen === "function") {
        await v.requestFullscreen();
      } else if (typeof v.webkitRequestFullscreen === "function") {
        await v.webkitRequestFullscreen();
      } else if (typeof v.webkitEnterFullscreen === "function") {
        // iPhone: il fullscreen è supportato solo dall'elemento video nativo
        v.webkitEnterFullscreen();
      }
    } catch {
      /* fullscreen negato dal browser: il video resta inline */
    }
    try {
      await v.play();
    } catch {
      /* autoplay bloccato: l'utente premerà play */
    }
  };

  return (
    <div className={cn("w-full min-w-0", className)} ref={wrapperRef}>
      <div className="overflow-hidden rounded-2xl sm:rounded-3xl border border-border/60 bg-card shadow-lift">
        {inView ? (
          <video
            key={src}
            ref={videoRef}
            className="block w-full aspect-video max-h-[60svh] bg-surface-muted"
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
            className="block w-full aspect-video max-h-[60svh] object-cover bg-surface-muted"
          />
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleFullscreen}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1 text-[11px] font-bold text-foreground/80 transition-colors hover:bg-secondary"
        >
          <Maximize2 className="size-3.5" aria-hidden="true" />
          Schermo intero
        </button>

        <div className="inline-flex min-h-9 items-center gap-2 rounded-full border border-border/60 px-2.5 py-1 sm:px-3">
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-pressed={muted}
            aria-label={muted ? "Riattiva la musica di sottofondo" : "Silenzia la musica di sottofondo"}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-foreground/80 transition-colors hover:text-primary"
          >

            {muted || volume === 0 ? (
              <VolumeX className="size-3.5" aria-hidden="true" />
            ) : volume < 0.5 ? (
              <Volume1 className="size-3.5" aria-hidden="true" />
            ) : (
              <Volume2 className="size-3.5" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">{muted || volume === 0 ? "Musica off" : "Musica"}</span>
          </button>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={muted ? 0 : Math.round(volume * 100)}
            onChange={(e) => {
              const next = Number(e.target.value) / 100;
              setVolume(next);
              setMuted(next === 0);
            }}
            aria-label="Volume musica di sottofondo"
            className="h-1.5 w-16 cursor-pointer appearance-none rounded-full bg-border accent-primary sm:w-32"
          />
          <span className="w-8 text-right text-[10px] font-bold tabular-nums text-muted-foreground">
            {muted ? 0 : Math.round(volume * 100)}%
          </span>
        </div>


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
