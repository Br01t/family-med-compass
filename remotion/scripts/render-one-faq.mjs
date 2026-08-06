/**
 * Renderizza UN singolo tutorial FAQ (mp4 + poster jpg) dentro src/assets/faq,
 * con le stesse impostazioni di encoding degli altri video del sito.
 *
 * Uso: bun run scripts/render-one-faq.mjs faq-installa-app
 */
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition, openBrowser } from "@remotion/renderer";
import path from "path";
import { fileURLToPath } from "url";
import { INTRO_FRAMES } from "../src/faq/Tutorial.tsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../../src/assets/faq");
const id = process.argv[2];
if (!id) throw new Error("Specifica l'id della composizione");

const bundled = await bundle({
  entryPoint: path.resolve(__dirname, "../src/index.ts"),
  webpackOverride: (c) => c,
});

const browser = await openBrowser("chrome", {
  browserExecutable: process.env.PUPPETEER_EXECUTABLE_PATH ?? "/bin/chromium",
  chromiumOptions: { args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] },
  chromeMode: "chrome-for-testing",
});

const composition = await selectComposition({ serveUrl: bundled, id, puppeteerInstance: browser });

await renderMedia({
  composition,
  serveUrl: bundled,
  outputLocation: path.join(outDir, `${id}.mp4`),
  puppeteerInstance: browser,
  codec: "h264",
  crf: 24,
  scale: 0.75,
  pixelFormat: "yuv420p",
  x264Preset: "slow",
  muted: true,
  concurrency: 2,
});

await renderStill({
  composition,
  serveUrl: bundled,
  output: path.join(outDir, `${id}.jpg`),
  frame: Math.min(INTRO_FRAMES + 45, composition.durationInFrames - 1),
  puppeteerInstance: browser,
  imageFormat: "jpeg",
  jpegQuality: 90,
  scale: 0.75,
});

await browser.close({ silent: false });
console.log("fatto", id);
