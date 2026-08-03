import { useEffect, useRef, useState } from "react";
import { ChevronDown, FileText, Captions, Volume2, VolumeX } from "lucide-react";
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
 * Player video accessibile ed efficiente:
 * - il tag <video> viene montato solo quando entra nel viewport (lazy loading "intelligente"),
 *   e comunque non scarica nulla finché l'utente non preme play (preload="none").
 * - sottotitoli WebVTT disattivati di default, attivabili con un tap sul pulsante CC.
 * - voce narrante opzionale (Web Speech API del browser) sincronizzata con le cue del
 *   sottotitolo: legge ad alta voce ciò che succede sullo schermo, attivabile con un tap.
 * - trascrizione testuale espandibile per chi preferisce leggere.
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
  const [captionsOn, setCaptionsOn] = useState(false);
  const [narrationOn, setNarrationOn] = useState(false);
  const [narrationSupported, setNarrationSupported] = useState(false);
  const [inView, setInView] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLTrackElement>(null);

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

  // Il video cambia (si passa a un altro tutorial): resetta i toggle e ferma la voce.
  useEffect(() => {
    setCaptionsOn(false);
    setNarrationOn(false);
    window.speechSynthesis?.cancel();
  }, [src]);

  useEffect(() => {
    setNarrationSupported(typeof window !== "undefined" && "speechSynthesis" in window);
  }, []);

  // Sincronizza il pulsante CC con la track dei sottotitoli.
  useEffect(() => {
    const track = trackRef.current?.track;
    if (!track) return;
    track.mode = captionsOn ? "showing" : "hidden";
  }, [captionsOn, inView]);

  // Voce narrante: legge ad alta voce la cue attiva del sottotitolo mentre il video è in play.
  useEffect(() => {
    const video = videoRef.current;
    const track = trackRef.current?.track;
    if (!video || !track || !narrationSupported) return;

    if (!narrationOn) {
      window.speechSynthesis.cancel();
      return;
    }

    const speakActiveCue = () => {
      const activeCue = track.activeCues?.[0] as VTTCue | undefined;
      window.speechSynthesis.cancel();
      if (!activeCue || video.paused) return;
      const utterance = new SpeechSynthesisUtterance(activeCue.text);
      utterance.lang = "it-IT";
      utterance.rate = 1;
      const voices = window.speechSynthesis.getVoices();
      const itVoice = voices.find((v) => v.lang?.toLowerCase().startsWith("it"));
      if (itVoice) utterance.voice = itVoice;
      window.speechSynthesis.speak(utterance);
    };
    const stopSpeaking = () => window.speechSynthesis.cancel();

    track.mode = captionsOn ? "showing" : "hidden";
    speakActiveCue();
    track.addEventListener("cuechange", speakActiveCue);
    video.addEventListener("pause", stopSpeaking);
    video.addEventListener("ended", stopSpeaking);
    video.addEventListener("seeking", stopSpeaking);

    return () => {
      track.removeEventListener("cuechange", speakActiveCue);
      video.removeEventListener("pause", stopSpeaking);
      video.removeEventListener("ended", stopSpeaking);
      video.removeEventListener("seeking", stopSpeaking);
      window.speechSynthesis.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narrationOn, narrationSupported, inView]);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

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
          >
            <track
              ref={trackRef}
              kind="captions"
              src={captions}
              srcLang="it"
              label="Italiano"
            />
          </video>
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
          onClick={() => setCaptionsOn((v) => !v)}
          aria-pressed={captionsOn}
          className={cn(
            "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold transition-colors",
            captionsOn
              ? "border-primary/50 bg-primary-soft text-primary"
              : "border-border/60 text-foreground/80 hover:bg-secondary",
          )}
        >
          <Captions className="size-3.5" aria-hidden="true" />
          {captionsOn ? "Sottotitoli attivi" : "Attiva sottotitoli"}
        </button>

        {narrationSupported && (
          <button
            type="button"
            onClick={() => setNarrationOn((v) => !v)}
            aria-pressed={narrationOn}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold transition-colors",
              narrationOn
                ? "border-primary/50 bg-primary-soft text-primary"
                : "border-border/60 text-foreground/80 hover:bg-secondary",
            )}
          >
            {narrationOn ? (
              <Volume2 className="size-3.5" aria-hidden="true" />
            ) : (
              <VolumeX className="size-3.5" aria-hidden="true" />
            )}
            {narrationOn ? "Voce narrante attiva" : "Attiva voce narrante"}
          </button>
        )}

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