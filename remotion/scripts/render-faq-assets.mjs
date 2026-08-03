/**
 * Renderizza TUTTI i video del sito (i 6 tutorial FAQ + il demo da 30s) con lo
 * stesso stile (stesso tema/telefono/backdrop, già condivisi in remotion/src)
 * e le stesse impostazioni di encoding ottimizzate per il web, scrivendo i file
 * reali (mp4 + jpg di copertina) dentro src/assets — così Vite li importa come
 * asset con fingerprint per il cache-busting, esattamente come già avveniva per
 * il video demo.
 *
 * Uso:
 *   cd remotion
 *   bun install
 *   bun run render:faq
 *
 * Richiede Chrome headless in locale: se non è già installato, Remotion lo
 * scarica da solo al primo avvio. Se il download è bloccato (proxy aziendale):
 *   bunx remotion browser ensure
 */
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition, openBrowser } from "@remotion/renderer";
import { mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { FAQ_VIDEOS } from "../src/faq/data.ts";
import { INTRO_FRAMES } from "../src/faq/Tutorial.tsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const faqOutDir = path.resolve(__dirname, "../../src/assets/faq");
const rootAssetsDir = path.resolve(__dirname, "../../src/assets");
mkdirSync(faqOutDir, { recursive: true });

// Impostazioni di encoding condivise da tutti i video del sito: qualità
// visivamente pulita per grafica flat/UI (non serve crf altissimo come per
// riprese reali) + scale 0.75 per contenere la risoluzione di output
// (1920x1080 -> 1440x810) mantenendo intatto il layout. Risultato: file
// significativamente più leggeri, stesso aspetto nitido nel player del sito.
const RENDER_OPTS = {
    codec: "h264",
    crf: 24,
    scale: 0.75,
    pixelFormat: "yuv420p",
    x264Preset: "slow",
    muted: true,
    concurrency: 2,
};

const faqIds = Object.keys(FAQ_VIDEOS);

console.log(`Bundling composizioni Remotion (${faqIds.length} tutorial FAQ + 1 demo)...`);
const bundled = await bundle({
    entryPoint: path.resolve(__dirname, "../src/index.ts"),
    webpackOverride: (config) => config,
});

const browser = await openBrowser("chrome", {
    browserExecutable: process.env.PUPPETEER_EXECUTABLE_PATH,
    chromiumOptions: { args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] },
    chromeMode: "chrome-for-testing",
});

async function renderOne({ id, mp4Out, jpgOut, posterFrame }) {
    const composition = await selectComposition({ serveUrl: bundled, id, puppeteerInstance: browser });

    console.log(`-> rendering ${path.basename(mp4Out)} ...`);
    await renderMedia({
        composition,
        serveUrl: bundled,
        outputLocation: mp4Out,
        puppeteerInstance: browser,
        ...RENDER_OPTS,
    });
    console.log("  fatto:", mp4Out);

    const frame = Math.min(posterFrame, composition.durationInFrames - 1);
    console.log(`-> rendering ${path.basename(jpgOut)} (frame ${frame}) ...`);
    await renderStill({
        composition,
        serveUrl: bundled,
        output: jpgOut,
        frame,
        puppeteerInstance: browser,
        imageFormat: "jpeg",
        jpegQuality: 90,
        scale: RENDER_OPTS.scale,
    });
    console.log("  fatto:", jpgOut);
}

// 1. I 6 tutorial FAQ
for (const id of faqIds) {
    await renderOne({
        id,
        mp4Out: path.join(faqOutDir, `${id}.mp4`),
        jpgOut: path.join(faqOutDir, `${id}.jpg`),
        // metà del primo step, quando l'animazione di ingresso si è già assestata
        posterFrame: INTRO_FRAMES + 45,
    });
}

// 2. Il video demo da 30s (composizione "main"), stesso trattamento
await renderOne({
    id: "main",
    mp4Out: path.join(rootAssetsDir, "familymed-demo.mp4"),
    jpgOut: path.join(rootAssetsDir, "familymed-demo-poster.jpg"),
    posterFrame: 60,
});

await browser.close({ silent: false });
console.log(`\nCompletato: ${faqIds.length} tutorial FAQ + 1 demo renderizzati con stile e encoding uniformi.`);
