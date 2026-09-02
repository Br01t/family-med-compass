import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  src: string;
  poster?: string;
  title: string;
  className?: string;
  autoPlay?: boolean;
  /** id univoco del video (a11y) */
  id: string;
};

const AUDIO_PREF_KEY = "faq-video-audio";

/**
 * Player video minimale: solo i controlli nativi del browser
 * (play, volume, schermo intero, timeline) integrati nel video.
 * Nessun pulsante aggiuntivo, nessuna trascrizione.
 * Il <video> viene montato solo quando entra nel viewport e con preload="none",
 * così le pagine con più tutorial non scaricano nulla finché non servono.
 */
export function VideoPlayer({ src, poster, title, className, autoPlay, id }: Props) {
  const [inView, setInView] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

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

  // Ricorda la preferenza audio dell'utente tra un video e l'altro.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    try {
      const raw = localStorage.getItem(AUDIO_PREF_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { volume?: number; muted?: boolean };
        if (typeof saved.volume === "number") v.volume = Math.min(1, Math.max(0, saved.volume));
        if (typeof saved.muted === "boolean") v.muted = saved.muted;
      }
    } catch {
      /* preferenza non disponibile: valori di default */
    }
  }, [inView, src]);

  const persistAudio = () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      localStorage.setItem(AUDIO_PREF_KEY, JSON.stringify({ volume: v.volume, muted: v.muted }));
    } catch {
      /* storage non disponibile */
    }
  };

  return (
    <div className={cn("w-full min-w-0", className)} ref={wrapperRef} id={id}>
      <div className="overflow-hidden rounded-2xl sm:rounded-3xl border border-border/60 bg-card shadow-lift">
        {inView ? (
          <video
            key={src}
            ref={videoRef}
            className="block w-full aspect-video max-h-[70svh] bg-surface-muted"
            src={src}
            poster={poster}
            controls
            controlsList="nodownload"
            playsInline
            preload="none"
            autoPlay={autoPlay}
            onVolumeChange={persistAudio}
            aria-label={title}
          />
        ) : (
          <img
            src={poster}
            alt={`Anteprima del video: ${title}`}
            loading="lazy"
            decoding="async"
            className="block w-full aspect-video max-h-[70svh] object-cover bg-surface-muted"
          />
        )}
      </div>
    </div>
  );
}
