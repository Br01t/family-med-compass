import { useState } from "react";
import { PlayCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { FAQ_VIDEOS } from "@/data/faq-videos";
import { VideoWithTranscript } from "./VideoWithTranscript";

/** Libreria di mini-video tutorial con anteprime, player e trascrizioni. */
export function FaqVideoLibrary({ className }: { className?: string }) {
  const [activeId, setActiveId] = useState(FAQ_VIDEOS[0]!.id);
  const [autoPlay, setAutoPlay] = useState(false);
  const active = FAQ_VIDEOS.find((v) => v.id === activeId)!;

  return (
    <section id="faq-video" className={cn("scroll-mt-20 w-full min-w-0", className)}>
      <VideoWithTranscript
        id={active.id}
        src={active.src}
        poster={active.poster}
        title={active.title}
        transcript={active.transcript}
        autoPlay={autoPlay}
      />

      <p className="mt-6 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
        Tutti i video tutorial
      </p>

      <div className="mt-3 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {FAQ_VIDEOS.map((v) => {
          const isActive = v.id === active.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => {
                setActiveId(v.id);
                setAutoPlay(true);
                document.getElementById("faq-video")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              aria-current={isActive}
              className={cn(
                "group flex flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-card transition-all hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive ? "border-primary/50 ring-1 ring-primary/25" : "border-border/60",
              )}
            >
              <span className="relative block w-full">
                <img
                  src={v.poster}
                  alt={`Anteprima del video: ${v.title}`}
                  loading="lazy"
                  className="block aspect-video w-full object-cover"
                />
                <span className="absolute inset-0 grid place-items-center bg-foreground/10 opacity-0 transition-opacity group-hover:opacity-100">
                  <PlayCircle className="size-10 text-primary-foreground drop-shadow" aria-hidden="true" />
                </span>
                <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-foreground/80 px-2 py-0.5 text-[10px] font-bold text-background">
                  <Clock className="size-3" aria-hidden="true" />
                  {v.duration}s
                </span>
              </span>

              <span className="flex min-w-0 flex-1 flex-col p-4">
                <span className="flex items-center gap-2">
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                    <v.icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="truncate text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {v.category}
                  </span>
                </span>
                <span className="mt-2 text-sm font-black tracking-tight">{v.title}</span>
                <span className="mt-1 text-xs leading-relaxed text-muted-foreground">{v.short}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
