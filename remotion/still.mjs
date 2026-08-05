import { bundle } from "@remotion/bundler";
import { selectComposition, renderStill, openBrowser } from "@remotion/renderer";
import path from "path";
const bundled = await bundle({ entryPoint: path.resolve("src/index.ts"), webpackOverride: (c)=>c });
const browser = await openBrowser("chrome", { browserExecutable: process.env.PUPPETEER_EXECUTABLE_PATH ?? "/bin/chromium", chromiumOptions:{args:["--no-sandbox","--disable-gpu","--disable-dev-shm-usage"]}, chromeMode:"chrome-for-testing" });
for (const [id, frame, out] of [["faq-crea-terapia", 65+2*105+80, "/tmp/f1.png"],["faq-crea-terapia", 65+4*105+90, "/tmp/f2.png"],["faq-report-pdf", 65+2*105+80, "/tmp/f3.png"]]) {
  const composition = await selectComposition({ serveUrl: bundled, id, puppeteerInstance: browser });
  await renderStill({ composition, serveUrl: bundled, output: out, frame, puppeteerInstance: browser });
  console.log("ok", out);
}
await browser.close({ silent: false });
