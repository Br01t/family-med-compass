import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { C, FONT } from "../theme";
import { Phone, Chip } from "../components/Phone";

export const ScenePatient: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 18, stiffness: 120 } });
  const tap = frame > 95;
  const tapS = spring({ frame: frame - 95, fps, config: { damping: 12, stiffness: 220 } });
  const press = tap ? interpolate(Math.min(tapS, 1), [0, 0.4, 1], [1, 0.94, 1]) : 1;
  const breathe = 1 + Math.sin(frame / 14) * 0.012;

  return (
    <AbsoluteFill style={{ fontFamily: FONT, flexDirection: "row", alignItems: "center", padding: "0 150px", gap: 110 }}>
      <div style={{ flex: 1, opacity: enter, transform: `translateY(${interpolate(enter, [0, 1], [40, 0])}px)` }}>
        <Chip label="Vista paziente" />
        <div style={{ fontSize: 96, fontWeight: 900, letterSpacing: -3, lineHeight: 1.05, marginTop: 28 }}>
          Un pulsante.<br />
          <span style={{ color: C.sage }}>Nient'altro.</span>
        </div>
        <div style={{ fontSize: 36, color: C.inkSoft, marginTop: 26, maxWidth: 620, lineHeight: 1.35 }}>
          Testo grande, sveglia sonora, un tap per confermare. Anche a 85 anni.
        </div>
        <div
          style={{
            marginTop: 40,
            display: "inline-flex",
            alignItems: "center",
            gap: 14,
            opacity: interpolate(frame - 100, [0, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          <div style={{ width: 46, height: 46, borderRadius: 999, background: C.sage, color: C.white, display: "grid", placeItems: "center", fontSize: 26, fontWeight: 900 }}>✓</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: C.sage }}>Dose registrata alle 08:02</div>
        </div>
      </div>

      <Phone style={{ transform: `translateY(${interpolate(enter, [0, 1], [80, 0])}px) scale(${0.92 * breathe})` }}>
        <div style={{ fontSize: 30, color: C.inkSoft }}>Buongiorno,</div>
        <div style={{ fontSize: 72, fontWeight: 900, letterSpacing: -2, marginTop: 2 }}>Mario</div>

        <div style={{ marginTop: 30, background: C.bgDeep, borderRadius: 28, padding: 28 }}>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 2, color: C.inkSoft }}>PROSSIMO FARMACO</div>
          <div style={{ fontSize: 88, fontWeight: 900, color: C.sage, letterSpacing: -3 }}>08:00</div>
        </div>

        <div style={{ marginTop: 26, borderLeft: `10px solid ${C.clay}`, borderRadius: 24, padding: 26, boxShadow: "0 20px 40px -24px rgba(0,0,0,.3)" }}>
          <div style={{ fontSize: 34, fontWeight: 900 }}>Cardioaspirina</div>
          <div style={{ fontSize: 24, color: C.inkSoft, marginTop: 4 }}>100mg · 1 compressa</div>
          <div
            style={{
              marginTop: 24,
              height: 96,
              borderRadius: 22,
              background: tap && tapS > 0.35 ? C.sageDeep : C.sage,
              color: C.white,
              display: "grid",
              placeItems: "center",
              fontSize: 30,
              fontWeight: 900,
              transform: `scale(${press})`,
            }}
          >
            {tap && tapS > 0.35 ? "✓ Presa!" : "Ho preso la medicina"}
          </div>
        </div>
      </Phone>
    </AbsoluteFill>
  );
};
