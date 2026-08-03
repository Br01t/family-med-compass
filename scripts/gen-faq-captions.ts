/**
 * Genera i file WebVTT (sottotitoli) per i mini-video FAQ e per il video demo.
 * I tempi derivano direttamente dalla struttura Remotion (30 fps).
 *
 *   bun run scripts/gen-faq-captions.ts
 */
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { FAQ_VIDEOS } from "../remotion/src/faq/data";
const INTRO_FRAMES = 65;
const STEP_FRAMES = 105;
const OUTRO_FRAMES = 75;

const FPS = 30;
const outDir = path.resolve(process.cwd(), "public/faq");
mkdirSync(outDir, { recursive: true });

const ts = (frames: number) => {
  const total = frames / FPS;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${s
    .toFixed(3)
    .padStart(6, "0")}`;
};

type Cue = { from: number; to: number; text: string };

const toVtt = (cues: Cue[]) =>
  ["WEBVTT", "", ...cues.map((c, i) => `${i + 1}\n${ts(c.from)} --> ${ts(c.to)}\n${c.text}\n`)].join(
    "\n",
  );

for (const [id, props] of Object.entries(FAQ_VIDEOS)) {
  const cues: Cue[] = [];
  cues.push({ from: 0, to: INTRO_FRAMES, text: `${props.title} ${props.titleAccent}` });
  props.steps.forEach((step, i) => {
    const from = INTRO_FRAMES + i * STEP_FRAMES;
    const mid = from + Math.round(STEP_FRAMES * 0.42);
    cues.push({ from, to: mid, text: `${step.n}. ${step.caption}` });
    cues.push({ from: mid, to: from + STEP_FRAMES, text: step.detail });
  });
  const outroFrom = INTRO_FRAMES + props.steps.length * STEP_FRAMES;
  cues.push({ from: outroFrom, to: outroFrom + OUTRO_FRAMES, text: props.outro });
  writeFileSync(path.join(outDir, `${id}.vtt`), toVtt(cues), "utf8");
  console.log("scritto", `${id}.vtt`, `${cues.length} cue`);
}

/* ---- video demo (30s) ---- */
const demoScenes: { d: number; lines: string[] }[] = [
  { d: 110, lines: ["FamilyMed: la tranquillità di sapere che prendono le medicine giuste, al momento giusto."] },
  { d: 130, lines: ["Il paziente vede un solo pulsante grande.", "Un tap su «Ho preso la medicina» e la dose è registrata."] },
  { d: 115, lines: ["Promemoria e notifiche arrivano al paziente e a tutta la famiglia."] },
  { d: 130, lines: ["La dashboard del caregiver si aggiorna in tempo reale.", "Timeline delle dosi di ieri, oggi e domani."] },
  { d: 120, lines: ["Se una dose salta oltre il tempo massimo diventa dimenticata:", "alert in dashboard e notifica a tutti."] },
  { d: 105, lines: ["Le scorte si scalano da sole e ti avvisano prima che finiscano."] },
  { d: 120, lines: ["Pressione, glicemia, peso e saturazione con grafici e medie mobili."] },
  { d: 115, lines: ["Storico aderenza e report PDF a 7, 30 o 90 giorni per il medico."] },
  { d: 115, lines: ["FamilyMed — inizia gratis, per la tua famiglia."] },
];
const T = 20;
const demoCues: Cue[] = [];
let start = 0;
for (const scene of demoScenes) {
  const per = scene.d / scene.lines.length;
  scene.lines.forEach((text, i) => {
    demoCues.push({ from: start + i * per, to: start + (i + 1) * per, text });
  });
  start += scene.d - T;
}
writeFileSync(path.join(outDir, "familymed-demo.vtt"), toVtt(demoCues), "utf8");
console.log("scritto familymed-demo.vtt", demoCues.length, "cue");
