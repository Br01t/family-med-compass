import { useState } from "react";
import { cn } from "@/lib/utils";
import { FAQ_VIDEOS } from "@/data/faq-videos";
import { VideoPlayer } from "./VideoPlayer";

/**
 * Libreria dei mini-video tutorial: un player unico in alto e
 * un elenco ordinato e compatto di capitoli sotto (niente griglia caotica).
 */
export function FaqVideoLibrary({ className }: { className?: string }) {
  const [activeId, setActiveId] = useState(FAQ_VIDEOS[0]!.id);
  const [autoPlay, setAutoPlay] = useState(false);
  const active = FAQ_VIDEOS.find((v) => v.id === activeId) ?? FAQ_VIDEOS[0]!;

  return (
    <section id="faq-video" className={cn("scroll-mt-20 w-full min-w-0", className)}>
      <VideoPlayer
        id={active.id}
        src={active.src}
        poster={active.poster}
        title={active.title}
        autoPlay={autoPlay}
      />

      <p className="mt-3 text-sm font-black tracking-tight sm:text-base">{active.title}</p>
      <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{active.short}</p>

      <p className="mt-6 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
        Capitoli
      </p>

      <ul className="mt-3 divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-card">
        {FAQ_VIDEOS.map((v, i) => {
          const isActive = v.id === active.id;
          return (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => {
                  setActiveId(v.id);
                  setAutoPlay(true);
                  document
                    .getElementById("faq-video")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                aria-current={isActive}
                className={cn(
                  "flex w-full min-w-0 items-center gap-3 px-3 py-3 text-left transition-colors sm:px-4",
                  isActive ? "bg-primary-soft/60" : "hover:bg-secondary/60",
                )}
              >
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-xl text-[11px] font-black tabular-nums",
                    isActive ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground/70",
                  )}
                >
                  {i + 1}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-bold tracking-tight">{v.title}</span>
                  <span className="truncate text-xs text-muted-foreground">{v.category}</span>
                </span>
                <span className="shrink-0 text-[11px] font-bold tabular-nums text-muted-foreground">
                  {v.duration}s
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
