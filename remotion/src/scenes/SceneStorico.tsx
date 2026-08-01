import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { C, FONT } from "../theme";
import { Chip } from "../components/Phone";

// deterministic pseudo-random calendar states
const STATES = [0, 0, 0, 1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0];
const COLORS = [C.sage, C.amber, C.clay];

export const SceneStorico: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 } });
  const pdf = spring({ frame: frame - 52, fps, config: { damping: 14, stiffness: 120 } });

  return (
    <AbsoluteFill style={{ fontFamily: FONT, flexDirection: "row", alignItems: "center", padding: "0 150px", gap: 80 }}>
      <div style={{ flex: 1, opacity: enter, transform: `translateX(${interpolate(enter, [0, 1], [-50, 0])}px)` }}>
        <Chip label="Storico & report" color={C.clay} bg={C.claySoft} />
        <div style={{ fontSize: 90, fontWeight: 900, letterSpacing: -3, lineHeight: 1.05, marginTop: 24 }}>
          Tutto lo storico,<br />
          <span style={{ color: C.sage }}>pronto per il medico.</span>
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 34 }}>
          {["7 giorni", "30 giorni", "90 giorni"].map((t, i) => {
            const on = i === 1;
            const s = spring({ frame: frame - 22 - i * 8, fps, config: { damping: 16, stiffness: 160 } });
            return (
              <div
                key={t}
                style={{
                  padding: "16px 30px",
                  borderRadius: 999,
                  fontSize: 30,
                  fontWeight: 900,
                  background: on ? C.sage : C.white,
                  color: on ? C.white : C.inkSoft,
                  boxShadow: "0 24px 50px -40px rgba(0,0,0,.6)",
                  opacity: s,
                  transform: `scale(${interpolate(s, [0, 1], [0.8, 1])})`,
                }}
              >
                {t}
              </div>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 40,
            display: "inline-flex",
            alignItems: "center",
            gap: 20,
            background: C.ink,
            color: C.white,
            padding: "24px 36px",
            borderRadius: 24,
            opacity: pdf,
            transform: `translateY(${interpolate(pdf, [0, 1], [40, 0])}px) scale(${interpolate(pdf, [0, 1], [0.9, 1])})`,
          }}
        >
          <div style={{ fontSize: 34, fontWeight: 900 }}>⤓</div>
          <div style={{ fontSize: 34, fontWeight: 900 }}>Esporta PDF</div>
        </div>
      </div>

      <div
        style={{
          width: 760,
          background: C.white,
          borderRadius: 40,
          padding: 44,
          boxShadow: "0 50px 100px -60px rgba(0,0,0,.6)",
          opacity: spring({ frame: frame - 10, fps, config: { damping: 200 } }),
          transform: `translateY(${interpolate(spring({ frame: frame - 10, fps, config: { damping: 200 } }), [0, 1], [70, 0])}px)`,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 2, color: C.inkSoft }}>ADERENZA MENSILE</div>
          <div style={{ fontSize: 44, fontWeight: 900, color: C.sage, letterSpacing: -2 }}>91%</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 14, marginTop: 28 }}>
          {STATES.map((st, i) => {
            const s = spring({ frame: frame - 16 - i * 1.6, fps, config: { damping: 200 } });
            return (
              <div
                key={i}
                style={{
                  height: 62,
                  borderRadius: 16,
                  background: COLORS[st],
                  opacity: 0.25 + 0.75 * s,
                  transform: `scale(${interpolate(s, [0, 1], [0.4, 1])})`,
                }}
              />
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 30, marginTop: 30 }}>
          {[
            ["Prese", C.sage],
            ["Ritardo", C.amber],
            ["Dimenticate", C.clay],
          ].map(([t, c]) => (
            <div key={t as string} style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ width: 20, height: 20, borderRadius: 6, background: c as string }} />
              <div style={{ fontSize: 26, color: C.inkSoft, fontWeight: 700 }}>{t}</div>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
