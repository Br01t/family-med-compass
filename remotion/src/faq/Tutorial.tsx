import React from "react";
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { C, FONT } from "../theme";
import { Backdrop } from "../components/Backdrop";
import { Phone, Chip } from "../components/Phone";

export type Row = {
  label: string;
  sub?: string;
  tone?: "plain" | "sage" | "clay" | "amber";
  /** true = questa riga viene evidenziata / toccata */
  target?: boolean;
};

export type Screen = {
  header: string;
  sub?: string;
  bigValue?: string;
  bigLabel?: string;
  rows?: Row[];
  cta?: string;
  /** il tap avviene sulla CTA invece che su una riga */
  tapCta?: boolean;
};

export type Step = {
  n: number;
  caption: string;
  detail: string;
  screen: Screen;
};

export type TutorialProps = {
  chip: string;
  title: string;
  titleAccent: string;
  steps: Step[];
  outro: string;
};

export const STEP_FRAMES = 105;
export const INTRO_FRAMES = 65;
export const OUTRO_FRAMES = 75;

export const totalFrames = (steps: number) =>
  INTRO_FRAMES + steps * STEP_FRAMES + OUTRO_FRAMES;

const toneColor = (tone: Row["tone"]) =>
  tone === "sage" ? C.sage : tone === "clay" ? C.clay : tone === "amber" ? C.amber : C.ink;

const toneBg = (tone: Row["tone"]) =>
  tone === "sage" ? C.sageSoft : tone === "clay" ? C.claySoft : tone === "amber" ? "#f8ecd4" : C.bgDeep;

/* ---------------- Intro ---------------- */

const Intro: React.FC<{ chip: string; title: string; titleAccent: string }> = ({
  chip,
  title,
  titleAccent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 18, stiffness: 110 } });
  const out = interpolate(frame, [INTRO_FRAMES - 14, INTRO_FRAMES], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        fontFamily: FONT,
        justifyContent: "center",
        padding: "0 170px",
        opacity: out,
      }}
    >
      <div style={{ opacity: s, transform: `translateY(${interpolate(s, [0, 1], [50, 0])}px)` }}>
        <Chip label={chip} />
        <div
          style={{
            fontSize: 108,
            fontWeight: 900,
            letterSpacing: -4,
            lineHeight: 1.03,
            marginTop: 30,
            maxWidth: 1400,
          }}
        >
          {title}
          <br />
          <span style={{ color: C.sage }}>{titleAccent}</span>
        </div>
        <div
          style={{
            marginTop: 34,
            height: 10,
            width: interpolate(s, [0, 1], [0, 420]),
            borderRadius: 999,
            background: C.clay,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

/* ---------------- Cursore ---------------- */

const Cursor: React.FC<{ x: number; y: number; pressed: boolean; visible: number }> = ({
  x,
  y,
  pressed,
  visible,
}) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: 62,
      height: 62,
      marginLeft: -31,
      marginTop: -31,
      borderRadius: 999,
      background: pressed ? "rgba(63,107,85,0.35)" : "rgba(34,32,28,0.16)",
      border: `3px solid ${pressed ? C.sage : "rgba(34,32,28,0.35)"}`,
      transform: `scale(${pressed ? 0.8 : 1})`,
      opacity: visible,
    }}
  />
);

/* ---------------- Step ---------------- */

const StepScene: React.FC<{ step: Step; total: number }> = ({ step, total }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 20, stiffness: 120 } });
  const breathe = 1 + Math.sin(frame / 16) * 0.008;

  const tapAt = 62;
  const pressed = frame >= tapAt && frame < tapAt + 12;
  const done = frame >= tapAt + 8;
  const cursorIn = interpolate(frame, [26, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const travel = interpolate(frame, [30, tapAt], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const rows = step.screen.rows ?? [];
  const targetIdx = rows.findIndex((r) => r.target);
  const tapCta = step.screen.tapCta ?? targetIdx < 0;

  // coordinate locali al telefono (padding 34)
  const rowsTop =
    34 + 50 + (step.screen.sub ? 34 : 0) + (step.screen.bigValue ? 178 : 0) + 24;
  const rowHeight = (r: Row) => (r.sub ? 100 : 70);
  const rowY = (idx: number) =>
    rowsTop +
    rows.slice(0, idx).reduce((acc, r) => acc + rowHeight(r) + 16, 0) +
    rowHeight(rows[idx]!) / 2;
  const rowsHeight = rows.reduce((acc, r) => acc + rowHeight(r) + 16, 0);
  const cursorTargetY = tapCta ? rowsTop + rowsHeight + 30 + 46 : rowY(targetIdx);
  const cursorX = interpolate(travel, [0, 1], [400, 250]);
  const cursorY = interpolate(travel, [0, 1], [820, cursorTargetY]);


  return (
    <AbsoluteFill
      style={{
        fontFamily: FONT,
        flexDirection: "row",
        alignItems: "center",
        padding: "0 130px",
        gap: 90,
      }}
    >
      <div
        style={{
          flex: 1,
          opacity: enter,
          transform: `translateX(${interpolate(enter, [0, 1], [-60, 0])}px)`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 86,
              height: 86,
              borderRadius: 26,
              background: C.sage,
              color: C.white,
              display: "grid",
              placeItems: "center",
              fontSize: 44,
              fontWeight: 900,
            }}
          >
            {step.n}
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 2, color: C.inkSoft }}>
            PASSAGGIO {step.n} DI {total}
          </div>
        </div>

        <div
          style={{
            fontSize: 74,
            fontWeight: 900,
            letterSpacing: -2.5,
            lineHeight: 1.08,
            marginTop: 30,
            maxWidth: 780,
          }}
        >
          {step.caption}
        </div>
        <div style={{ fontSize: 34, color: C.inkSoft, marginTop: 22, maxWidth: 720, lineHeight: 1.35 }}>
          {step.detail}
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 46 }}>
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={i}
              style={{
                width: i + 1 === step.n ? 74 : 30,
                height: 10,
                borderRadius: 999,
                background: i + 1 === step.n ? C.clay : "rgba(34,32,28,0.15)",
              }}
            />
          ))}
        </div>
      </div>

      <div style={{ position: "relative" }}>
        <Phone
          style={{
            transform: `translateY(${interpolate(enter, [0, 1], [70, 0])}px) scale(${0.9 * breathe})`,
          }}
        >
          <div style={{ fontSize: 40, fontWeight: 900, letterSpacing: -1.2 }}>
            {step.screen.header}
          </div>
          {step.screen.sub && (
            <div style={{ fontSize: 25, color: C.inkSoft, marginTop: 6 }}>{step.screen.sub}</div>
          )}

          {step.screen.bigValue && (
            <div style={{ marginTop: 26, background: C.bgDeep, borderRadius: 26, padding: 26 }}>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 2, color: C.inkSoft }}>
                {step.screen.bigLabel}
              </div>
              <div style={{ fontSize: 72, fontWeight: 900, color: C.sage, letterSpacing: -2.5 }}>
                {step.screen.bigValue}
              </div>
            </div>
          )}

          <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
            {rows.map((r, i) => {
              const app = spring({
                frame: frame - 12 - i * 6,
                fps,
                config: { damping: 22, stiffness: 140 },
              });
              const hot = r.target && done;
              return (
                <div
                  key={r.label}
                  style={{
                    borderRadius: 22,
                    padding: "20px 22px",
                    background: hot ? C.sageSoft : toneBg(r.tone),
                    border: `2px solid ${hot ? C.sage : "transparent"}`,
                    opacity: app,
                    transform: `translateY(${interpolate(app, [0, 1], [26, 0])}px) scale(${
                      r.target && pressed ? 0.97 : 1
                    })`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 30,
                      fontWeight: 800,
                      color: hot ? C.sageDeep : toneColor(r.tone),
                    }}
                  >
                    {hot ? `✓ ${r.label}` : r.label}
                  </div>
                  {r.sub && (
                    <div style={{ fontSize: 22, color: C.inkSoft, marginTop: 4 }}>{r.sub}</div>
                  )}
                </div>
              );
            })}
          </div>

          {step.screen.cta && (
            <div
              style={{
                marginTop: 30,
                height: 92,
                borderRadius: 24,
                background: tapCta && done ? C.sageDeep : C.sage,
                color: C.white,
                display: "grid",
                placeItems: "center",
                fontSize: 30,
                fontWeight: 900,
                transform: `scale(${tapCta && pressed ? 0.96 : 1})`,
              }}
            >
              {tapCta && done ? "✓ Fatto" : step.screen.cta}
            </div>
          )}
        </Phone>

        <Cursor
          x={cursorX - phoneLeft + 230}
          y={cursorY - phoneTop - 40}
          pressed={pressed}
          visible={cursorIn}
        />
      </div>
    </AbsoluteFill>
  );
};

/* ---------------- Outro ---------------- */

const Outro: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 17, stiffness: 110 } });
  return (
    <AbsoluteFill
      style={{
        fontFamily: FONT,
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        padding: "0 200px",
      }}
    >
      <div style={{ opacity: s, transform: `scale(${interpolate(s, [0, 1], [0.9, 1])})` }}>
        <div
          style={{
            width: 130,
            height: 130,
            borderRadius: 999,
            background: C.sage,
            color: C.white,
            display: "grid",
            placeItems: "center",
            fontSize: 68,
            fontWeight: 900,
            margin: "0 auto 34px",
          }}
        >
          ✓
        </div>
        <div style={{ fontSize: 82, fontWeight: 900, letterSpacing: -3, lineHeight: 1.1 }}>
          {text}
        </div>
        <div style={{ fontSize: 34, color: C.inkSoft, marginTop: 24, fontWeight: 700 }}>
          FamilyMed · familymed.app
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ---------------- Composizione ---------------- */

export const Tutorial: React.FC<TutorialProps> = ({
  chip,
  title,
  titleAccent,
  steps,
  outro,
}) => (
  <AbsoluteFill>
    <Backdrop />
    <Sequence durationInFrames={INTRO_FRAMES}>
      <Intro chip={chip} title={title} titleAccent={titleAccent} />
    </Sequence>
    {steps.map((st, i) => (
      <Sequence
        key={st.n}
        from={INTRO_FRAMES + i * STEP_FRAMES}
        durationInFrames={STEP_FRAMES}
      >
        <StepScene step={st} total={steps.length} />
      </Sequence>
    ))}
    <Sequence from={INTRO_FRAMES + steps.length * STEP_FRAMES} durationInFrames={OUTRO_FRAMES}>
      <Outro text={outro} />
    </Sequence>
  </AbsoluteFill>
);
