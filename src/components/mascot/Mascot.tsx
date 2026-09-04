import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export type MascotMood =
  | "neutral"
  | "happy"
  | "encouraging"
  | "concerned"
  | "celebrating";

const mascotSvg = cva("shrink-0 text-primary", {
  variants: {
    size: {
      sm: "size-8",
      md: "size-16",
      lg: "size-28",
    },
  },
  defaultVariants: { size: "md" },
});

export interface MascotProps extends VariantProps<typeof mascotSvg> {
  mood?: MascotMood;
  /** Testo opzionale mostrato accanto a Sana. */
  message?: string;
  className?: string;
}

/** Corpo a goccia paffuta, pieno, di un solo colore. */
const BODY_PATH =
  "M50 12c3 0 5 1.6 7 4.2 6.6 8.4 13.6 17.6 18.4 26.4 4.3 8 6.6 15.4 6.6 22.9 0 20-14.2 34.5-32 34.5S18 85.5 18 65.5c0-7.5 2.3-14.9 6.6-22.9 4.8-8.8 11.8-18 18.4-26.4C45 13.6 47 12 50 12z";

function Face({ mood }: { mood: MascotMood }) {
  const smiling = mood === "happy" || mood === "celebrating" || mood === "encouraging";

  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={3}>
      {/* occhi */}
      {smiling ? (
        <>
          <path d="M36 60c2.2-3.6 6.2-3.6 8.4 0" className="stroke-background" />
          <path d="M55.6 60c2.2-3.6 6.2-3.6 8.4 0" className="stroke-background" />
        </>
      ) : (
        <>
          <circle cx={40} cy={60} r={4.6} className="fill-background stroke-none" />
          <circle cx={60} cy={60} r={4.6} className="fill-background stroke-none" />
          <circle cx={40} cy={60.5} r={2} className="fill-primary stroke-none" />
          <circle cx={60} cy={60.5} r={2} className="fill-primary stroke-none" />
        </>
      )}

      {/* sopracciglia (solo preoccupato) */}
      {mood === "concerned" && (
        <>
          <path d="M33.5 51.5 44 48.5" className="stroke-background" strokeWidth={2.6} />
          <path d="M66.5 51.5 56 48.5" className="stroke-background" strokeWidth={2.6} />
        </>
      )}

      {/* bocca */}
      {mood === "concerned" ? (
        <path d="M43 78c2.4-3.4 11.6-3.4 14 0" className="stroke-background" />
      ) : mood === "celebrating" ? (
        <path
          d="M42 72c0 6 3.6 9.6 8 9.6s8-3.6 8-9.6z"
          className="fill-background stroke-none"
        />
      ) : (
        <path d="M42 73c3 5.4 13 5.4 16 0" className="stroke-background" />
      )}
    </g>
  );
}

function Limbs({ mood }: { mood: MascotMood }) {
  const raised = mood === "happy";
  const both = mood === "celebrating" || mood === "encouraging";

  return (
    <g className="fill-current" opacity={0.92}>
      {/* braccio sinistro */}
      <ellipse
        cx={17}
        cy={both || raised ? 58 : 74}
        rx={6.4}
        ry={9.2}
        transform={
          both || raised ? "rotate(-32 17 58)" : "rotate(-12 17 74)"
        }
      />
      {/* braccio destro */}
      <ellipse
        cx={83}
        cy={both ? 58 : 74}
        rx={6.4}
        ry={9.2}
        transform={both ? "rotate(32 83 58)" : "rotate(12 83 74)"}
      />
      {/* gambe tozze */}
      <ellipse cx={40} cy={102} rx={8} ry={6.4} />
      <ellipse cx={60} cy={102} rx={8} ry={6.4} />
    </g>
  );
}

export function Mascot({
  mood = "neutral",
  size,
  message,
  className,
}: MascotProps) {
  const svg = (
    <svg
      viewBox="0 0 100 112"
      aria-hidden="true"
      focusable="false"
      className={cn(mascotSvg({ size }), !message && className)}
    >
      <Limbs mood={mood} />
      <path d={BODY_PATH} className="fill-current" />
      {/* riflesso lucido */}
      <ellipse
        cx={37}
        cy={36}
        rx={7.5}
        ry={11}
        transform="rotate(-22 37 36)"
        className="fill-background"
        opacity={0.35}
      />
      <Face mood={mood} />
      {mood === "celebrating" && (
        <g className="fill-accent">
          <circle cx={12} cy={26} r={3} />
          <circle cx={88} cy={30} r={2.4} />
          <circle cx={78} cy={14} r={1.8} />
          <circle cx={22} cy={12} r={1.8} />
        </g>
      )}
    </svg>
  );

  if (!message) return svg;

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {svg}
      <p className="rounded-2xl rounded-bl-sm border border-border/60 bg-card px-3.5 py-2 text-sm leading-snug text-foreground shadow-sm">
        {message}
      </p>
    </div>
  );
}

export default Mascot;
