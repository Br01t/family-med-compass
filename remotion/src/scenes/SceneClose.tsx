import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { C, FONT } from "../theme";

const feats = [
  { t: "Parametri vitali", d: "Pressione, glicemia, peso, saturazione" },
  { t: "Report PDF", d: "7, 30 o 90 giorni per il medico" },
  { t: "Gruppo di cura", d: "Più familiari, ruoli e registro attività" },
];

export const SceneClose: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ fontFamily: FONT, padding: "0 150px", justifyContent: "center" }}>
      <div style={{ display: "flex", gap: 30 }}>
        {feats.map((f, i) => {
          const s = spring({ frame: frame - i * 8, fps, config: { damping: 16, stiffness: 120 } });
          return (
            <div
              key={f.t}
              style={{
                flex: 1,
                background: C.white,
                borderRadius: 34,
                padding: 38,
                boxShadow: "0 40px 80px -60px rgba(0,0,0,.5)",
                opacity: s,
                transform: `translateY(${interpolate(s, [0, 1], [70, 0])}px)`,
              }}
            >
              <div style={{ width: 20, height: 20, borderRadius: 999, background: i === 1 ? C.clay : C.sage }} />
              <div style={{ fontSize: 40, fontWeight: 900, marginTop: 22 }}>{f.t}</div>
              <div style={{ fontSize: 26, color: C.inkSoft, marginTop: 8, lineHeight: 1.35 }}>{f.d}</div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 90,
          opacity: interpolate(frame, [40, 70], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          transform: `translateY(${interpolate(frame, [40, 80], [40, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px)`,
        }}
      >
        <div style={{ fontSize: 86, fontWeight: 900, letterSpacing: -3, lineHeight: 1.1, maxWidth: 1400 }}>
          La tranquillità di sapere che i tuoi cari prendono
          <span style={{ color: C.sage }}> le medicine giuste, al momento giusto.</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 24, marginTop: 60 }}>
          <div style={{ width: 92, height: 92, borderRadius: 30, background: C.sage, color: C.white, display: "grid", placeItems: "center", fontSize: 46, fontWeight: 900 }}>
            ✚
          </div>
          <div>
            <div style={{ fontSize: 62, fontWeight: 900, letterSpacing: -2 }}>FamilyMed</div>
            <div style={{ fontSize: 28, color: C.inkSoft }}>Gratis per iniziare · familymed.app</div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
