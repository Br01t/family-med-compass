import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { C, FONT } from "../theme";
import { Chip } from "../components/Phone";

const stocks = [
  { n: "Metformina 850mg", left: 4, tot: 60, days: "2 giorni", c: C.clay },
  { n: "Lasix 25mg", left: 11, tot: 60, days: "5 giorni", c: C.amber },
  { n: "Eutirox 75", left: 42, tot: 90, days: "21 giorni", c: C.sage },
];

export const SceneScorte: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 } });

  return (
    <AbsoluteFill style={{ fontFamily: FONT, flexDirection: "row", alignItems: "center", padding: "0 150px", gap: 90 }}>
      <div style={{ width: 640, opacity: enter, transform: `translateX(${interpolate(enter, [0, 1], [-60, 0])}px)` }}>
        <Chip label="Scorte" color={C.amber} bg="#f7ecd4" />
        <div style={{ fontSize: 92, fontWeight: 900, letterSpacing: -3, lineHeight: 1.05, marginTop: 24 }}>
          Le pillole<br />
          <span style={{ color: C.clay }}>non finiscono mai</span><br />di sorpresa.
        </div>
        <div style={{ fontSize: 32, color: C.inkSoft, marginTop: 24, lineHeight: 1.35 }}>
          Ogni conferma scala la scorta. Sotto soglia, arriva l'avviso.
        </div>
      </div>

      <div style={{ flex: 1 }}>
        {stocks.map((s, i) => {
          const sp = spring({ frame: frame - 12 - i * 14, fps, config: { damping: 17, stiffness: 130 } });
          const fill = interpolate(
            spring({ frame: frame - 24 - i * 14, fps, config: { damping: 200 } }),
            [0, 1],
            [0, (s.left / s.tot) * 100],
          );
          return (
            <div
              key={s.n}
              style={{
                background: C.white,
                borderRadius: 30,
                padding: 34,
                marginBottom: 26,
                boxShadow: "0 40px 80px -60px rgba(0,0,0,.55)",
                opacity: sp,
                transform: `translateY(${interpolate(sp, [0, 1], [70, 0])}px)`,
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <div style={{ fontSize: 38, fontWeight: 900 }}>{s.n}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: s.c }}>{s.days}</div>
              </div>
              <div style={{ height: 20, borderRadius: 999, background: C.bgDeep, marginTop: 20, overflow: "hidden" }}>
                <div style={{ width: `${fill}%`, height: "100%", borderRadius: 999, background: s.c }} />
              </div>
              <div style={{ fontSize: 24, color: C.inkSoft, marginTop: 12 }}>
                {s.left} compresse rimaste su {s.tot}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
