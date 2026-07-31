import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { C, FONT } from "../theme";
import { Chip } from "../components/Phone";

const notifs = [
  { icon: "!", title: "Dose dimenticata", body: "Lasix delle 16:00 · Mario", color: C.clay },
  { icon: "✓", title: "Mario ha confermato", body: "Cardioaspirina · 08:02", color: C.sage },
  { icon: "▾", title: "Scorte in esaurimento", body: "Metformina · 4 compresse", color: C.amber },
];

export const SceneAlert: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 } });
  const pulse = 1 + Math.sin(frame / 8) * 0.02;

  return (
    <AbsoluteFill style={{ fontFamily: FONT, flexDirection: "row", alignItems: "center", padding: "0 150px", gap: 100 }}>
      <div style={{ flex: 1, opacity: enter, transform: `translateX(${interpolate(enter, [0, 1], [-50, 0])}px)` }}>
        <Chip label="Nessuna dose scivola via" color={C.clay} bg={C.claySoft} />
        <div style={{ fontSize: 94, fontWeight: 900, letterSpacing: -3, lineHeight: 1.05, marginTop: 26 }}>
          Se salta<br />una dose,<br />
          <span style={{ color: C.clay }}>lo sai subito.</span>
        </div>
        <div style={{ fontSize: 34, color: C.inkSoft, marginTop: 26, maxWidth: 640, lineHeight: 1.35 }}>
          Promemoria, rimando unico, marcatura automatica come dimenticata e alert in dashboard.
        </div>
      </div>

      <div style={{ width: 780 }}>
        {notifs.map((n, i) => {
          const s = spring({ frame: frame - 12 - i * 22, fps, config: { damping: 15, stiffness: 130 } });
          return (
            <div
              key={n.title}
              style={{
                display: "flex",
                gap: 26,
                alignItems: "center",
                background: C.white,
                borderRadius: 30,
                padding: 32,
                marginBottom: 26,
                boxShadow: "0 40px 70px -50px rgba(0,0,0,.5)",
                borderLeft: `12px solid ${n.color}`,
                opacity: s,
                transform: `translateX(${interpolate(s, [0, 1], [140, 0])}px) scale(${i === 0 ? pulse : 1})`,
              }}
            >
              <div style={{ width: 74, height: 74, borderRadius: 999, background: n.color, color: C.white, display: "grid", placeItems: "center", fontSize: 38, fontWeight: 900 }}>
                {n.icon}
              </div>
              <div>
                <div style={{ fontSize: 40, fontWeight: 900 }}>{n.title}</div>
                <div style={{ fontSize: 28, color: C.inkSoft, marginTop: 6 }}>{n.body}</div>
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
