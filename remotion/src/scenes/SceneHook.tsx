import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { C, FONT } from "../theme";

const lines = ["Ha preso", "la pillola", "delle 8?"];

export const SceneHook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ fontFamily: FONT, padding: "0 160px", justifyContent: "center" }}>
      <div style={{ maxWidth: 1200 }}>
        {lines.map((l, i) => {
          const s = spring({ frame: frame - i * 9, fps, config: { damping: 200 } });
          const blur = interpolate(s, [0, 1], [14, 0]);
          return (
            <div
              key={l}
              style={{
                fontSize: 150,
                lineHeight: 1.02,
                fontWeight: 900,
                letterSpacing: -5,
                color: i === 2 ? C.clay : C.ink,
                opacity: s,
                filter: `blur(${blur}px)`,
                transform: `translateX(${interpolate(s, [0, 1], [-60, 0])}px)`,
              }}
            >
              {l}
            </div>
          );
        })}
        <div
          style={{
            marginTop: 44,
            fontSize: 40,
            color: C.inkSoft,
            fontWeight: 500,
            opacity: interpolate(frame, [55, 80], [0, 1], { extrapolateRight: "clamp" }),
            transform: `translateY(${interpolate(frame, [55, 85], [24, 0], { extrapolateRight: "clamp" })}px)`,
          }}
        >
          Ogni giorno, la stessa ansia. Da oggi no.
        </div>
      </div>
    </AbsoluteFill>
  );
};
