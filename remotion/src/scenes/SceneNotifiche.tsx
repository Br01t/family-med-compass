import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { C, FONT } from "../theme";
import { Chip } from "../components/Phone";

const patient = [
  { t: "Tra 15 minuti", b: "Cardioaspirina 100mg", c: C.sage },
  { t: "È ora della dose", b: "Conferma con un tap", c: C.amber },
  { t: "Dose registrata", b: "08:02 · ottimo lavoro", c: C.sage },
];

const caregiver = [
  { t: "Mario ha confermato", b: "Cardioaspirina · 08:02", c: C.sage },
  { t: "Mario ha rimandato", b: "Lasix · +15 min", c: C.amber },
  { t: "Dose dimenticata", b: "Lasix 16:00 · contattalo", c: C.clay },
];

const Col: React.FC<{
  label: string;
  chipColor: string;
  chipBg: string;
  items: typeof patient;
  delay: number;
}> = ({ label, chipColor, chipBg, items, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ flex: 1 }}>
      <Chip label={label} color={chipColor} bg={chipBg} />
      <div style={{ marginTop: 26 }}>
        {items.map((n, i) => {
          const s = spring({ frame: frame - delay - i * 14, fps, config: { damping: 16, stiffness: 140 } });
          return (
            <div
              key={n.t}
              style={{
                background: C.white,
                borderRadius: 26,
                padding: "26px 30px",
                marginBottom: 20,
                display: "flex",
                gap: 22,
                alignItems: "center",
                boxShadow: "0 36px 70px -55px rgba(0,0,0,.6)",
                opacity: s,
                transform: `translateY(${interpolate(s, [0, 1], [60, 0])}px)`,
              }}
            >
              <div style={{ width: 16, height: 56, borderRadius: 999, background: n.c }} />
              <div>
                <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: -0.5 }}>{n.t}</div>
                <div style={{ fontSize: 24, color: C.inkSoft, marginTop: 4 }}>{n.b}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const SceneNotifiche: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 } });

  return (
    <AbsoluteFill style={{ fontFamily: FONT, padding: "80px 140px", justifyContent: "center" }}>
      <div style={{ opacity: enter, transform: `translateY(${interpolate(enter, [0, 1], [30, 0])}px)` }}>
        <div style={{ fontSize: 86, fontWeight: 900, letterSpacing: -3, lineHeight: 1.05 }}>
          Centro notifiche <span style={{ color: C.sage }}>condiviso.</span>
        </div>
        <div style={{ fontSize: 32, color: C.inkSoft, marginTop: 14 }}>
          Ogni evento della terapia, dalla parte giusta.
        </div>
      </div>
      <div style={{ display: "flex", gap: 60, marginTop: 46 }}>
        <Col label="Paziente" chipColor={C.sage} chipBg={C.sageSoft} items={patient} delay={10} />
        <Col label="Caregiver" chipColor={C.clay} chipBg={C.claySoft} items={caregiver} delay={26} />
      </div>
    </AbsoluteFill>
  );
};
