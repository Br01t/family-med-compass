import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { C, FONT } from "../theme";
import { Chip } from "../components/Phone";

const series = [
  { label: "Pressione", unit: "mmHg", value: "128/78", pts: [140, 136, 133, 131, 129, 128, 128], c: C.sage },
  { label: "Glicemia", unit: "mg/dL", value: "104", pts: [126, 121, 118, 112, 109, 106, 104], c: C.clay },
];

const Spark: React.FC<{ pts: number[]; color: string; delay: number }> = ({ pts, color, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  const w = 520;
  const h = 180;
  const min = Math.min(...pts) - 6;
  const max = Math.max(...pts) + 6;
  const coords = pts.map((v, i) => [
    (i / (pts.length - 1)) * w,
    h - ((v - min) / (max - min)) * h,
  ]);
  const d = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c[0]},${c[1]}`).join(" ");
  const len = 1400;

  return (
    <svg width={w} height={h} style={{ overflow: "visible" }}>
      <path
        d={`${d} L${w},${h} L0,${h} Z`}
        fill={color}
        opacity={0.1 * p}
      />
      <path
        d={d}
        stroke={color}
        strokeWidth={8}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={len}
        strokeDashoffset={len - len * p}
      />
      {coords.map((c, i) => (
        <circle
          key={i}
          cx={c[0]}
          cy={c[1]}
          r={i === coords.length - 1 ? 12 : 7}
          fill={color}
          opacity={p > (i + 0.5) / coords.length ? 1 : 0}
        />
      ))}
    </svg>
  );
};

export const SceneVitals: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 } });

  return (
    <AbsoluteFill style={{ fontFamily: FONT, padding: "80px 150px", justifyContent: "center" }}>
      <div style={{ opacity: enter, transform: `translateY(${interpolate(enter, [0, 1], [30, 0])}px)` }}>
        <Chip label="Parametri vitali" />
        <div style={{ fontSize: 88, fontWeight: 900, letterSpacing: -3, marginTop: 22 }}>
          Non solo farmaci. <span style={{ color: C.sage }}>Anche i numeri.</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 40, marginTop: 46 }}>
        {series.map((s, i) => {
          const sp = spring({ frame: frame - 12 - i * 12, fps, config: { damping: 18, stiffness: 130 } });
          return (
            <div
              key={s.label}
              style={{
                flex: 1,
                background: C.white,
                borderRadius: 34,
                padding: 38,
                boxShadow: "0 40px 80px -60px rgba(0,0,0,.55)",
                opacity: sp,
                transform: `translateY(${interpolate(sp, [0, 1], [60, 0])}px)`,
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 2, color: C.inkSoft }}>
                {s.label.toUpperCase()} · 7 GIORNI
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 6 }}>
                <div style={{ fontSize: 82, fontWeight: 900, letterSpacing: -4, color: s.c }}>{s.value}</div>
                <div style={{ fontSize: 28, color: C.inkSoft }}>{s.unit}</div>
                <div style={{ marginLeft: "auto", fontSize: 26, fontWeight: 900, color: C.sage }}>▼ in calo</div>
              </div>
              <div style={{ marginTop: 20 }}>
                <Spark pts={s.pts} color={s.c} delay={24 + i * 12} />
              </div>
            </div>
          );
        })}

        <div
          style={{
            width: 300,
            background: C.sageDeep,
            color: C.white,
            borderRadius: 34,
            padding: 38,
            opacity: spring({ frame: frame - 40, fps, config: { damping: 200 } }),
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 2, opacity: 0.7 }}>ANCHE</div>
          {["Peso", "Saturazione", "Medie mobili", "Trend settimanali"].map((t, i) => (
            <div
              key={t}
              style={{
                fontSize: 32,
                fontWeight: 800,
                marginTop: 22,
                opacity: interpolate(frame - 46 - i * 8, [0, 12], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              {t}
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
