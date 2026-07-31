import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { C } from "../theme";

export const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 90) * 40;
  const drift2 = Math.cos(frame / 120) * 60;
  const hueShift = interpolate(frame, [0, 900], [0, 12]);

  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(1200px 800px at ${20 + drift / 6}% 15%, ${C.sageSoft} 0%, transparent 60%)`,
          opacity: 0.9,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(900px 700px at ${85 - drift2 / 8}% 85%, ${C.claySoft} 0%, transparent 62%)`,
          opacity: 0.85,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 120 + drift,
          top: 660 + drift2 / 2,
          width: 260,
          height: 260,
          borderRadius: 999,
          border: `2px solid ${C.sage}`,
          opacity: 0.08,
          transform: `rotate(${hueShift}deg)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 180 - drift,
          top: 120 + drift2 / 3,
          width: 180,
          height: 180,
          borderRadius: 48,
          border: `2px solid ${C.clay}`,
          opacity: 0.1,
        }}
      />
    </AbsoluteFill>
  );
};
