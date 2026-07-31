import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { C, FONT } from "../theme";
import { Chip } from "../components/Phone";

const rows = [
  { t: "08:00", n: "Cardioaspirina", s: "Presa", c: C.sage },
  { t: "12:30", n: "Metformina", s: "Presa", c: C.sage },
  { t: "16:00", n: "Lasix", s: "In attesa", c: C.amber },
  { t: "20:00", n: "Eutirox", s: "Programmata", c: C.inkSoft },
];

export const SceneCaregiver: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 } });
  const adherence = Math.round(interpolate(frame, [20, 90], [0, 94], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));

  return (
    <AbsoluteFill style={{ fontFamily: FONT, padding: "90px 140px", justifyContent: "center" }}>
      <div style={{ opacity: enter, transform: `translateY(${interpolate(enter, [0, 1], [30, 0])}px)` }}>
        <Chip label="Vista caregiver" color={C.clay} bg={C.claySoft} />
        <div style={{ fontSize: 92, fontWeight: 900, letterSpacing: -3, marginTop: 22 }}>
          Tu lo sai <span style={{ color: C.sage }}>in tempo reale.</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 34, marginTop: 54 }}>
        <div
          style={{
            width: 460,
            background: C.white,
            borderRadius: 36,
            padding: 40,
            boxShadow: "0 40px 80px -50px rgba(0,0,0,.45)",
            opacity: spring({ frame: frame - 14, fps, config: { damping: 200 } }),
            transform: `translateY(${interpolate(spring({ frame: frame - 14, fps, config: { damping: 200 } }), [0, 1], [50, 0])}px)`,
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 2, color: C.inkSoft }}>ADERENZA 7 GIORNI</div>
          <div style={{ fontSize: 150, fontWeight: 900, color: C.sage, letterSpacing: -8, lineHeight: 1.1 }}>{adherence}%</div>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", height: 150, marginTop: 16 }}>
            {[62, 78, 90, 71, 96, 88, 100].map((h, i) => {
              const s = spring({ frame: frame - 26 - i * 5, fps, config: { damping: 16, stiffness: 130 } });
              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: h * s,
                    borderRadius: 12,
                    background: i === 6 ? C.clay : C.sage,
                    opacity: 0.85,
                  }}
                />
              );
            })}
          </div>
        </div>

        <div style={{ flex: 1, background: C.white, borderRadius: 36, padding: 40, boxShadow: "0 40px 80px -50px rgba(0,0,0,.45)" }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 2, color: C.inkSoft }}>TIMELINE DI OGGI · MARIO</div>
          {rows.map((r, i) => {
            const s = spring({ frame: frame - 30 - i * 12, fps, config: { damping: 18, stiffness: 140 } });
            return (
              <div
                key={r.n}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 26,
                  marginTop: 22,
                  padding: "20px 24px",
                  borderRadius: 22,
                  background: C.bgDeep,
                  opacity: s,
                  transform: `translateX(${interpolate(s, [0, 1], [70, 0])}px)`,
                }}
              >
                <div style={{ fontSize: 40, fontWeight: 900, width: 130, color: C.ink }}>{r.t}</div>
                <div style={{ flex: 1, fontSize: 36, fontWeight: 700 }}>{r.n}</div>
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 900,
                    color: C.white,
                    background: r.c,
                    padding: "10px 22px",
                    borderRadius: 999,
                  }}
                >
                  {r.s}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
