// Designed store images for the App Store and Google Play (stage 131): the real app screens,
// each in a phone frame on Farbaek's White Signal canvas, with a headline, one line of text and
// the proof thread, a signal blue to cyan line that runs across every image at the same height,
// so side by side in a store they read as one thread: control at every step.
//
// Sources are the real screens (gitignored):
//   desktop/release/store-ios/iphone-*.png       1320 x 2868, from the simulator's sample tour
//   desktop/release/store-android/real-*.png     1080 x 1920, the web app at 360 x 640, 3x, in the
//     review account (hello@farbaek.com) after a real build: the Ember & Rye project, 2026-11-02
// Output: desktop/release/store-ios/designed/ and desktop/release/store-android/designed/.
//
// Run: node scripts/release/store-images.mjs [ios|android]   (needs Chrome and the network, for Geist)
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(join(root, "package.json"));
const { chromium } = require("playwright-core");
const sharp = require(require.resolve("sharp", { paths: [dirname(require.resolve("next/package.json"))] }));

const TOKENS = { canvas: "#fbfbfc", surface: "#ffffff", ink: "#121317", ink2: "#474c56", ink3: "#636975", line: "#e4e7ec", accent: "#2450f0", accent2: "#0a6e85" };

const dataUri = (file, type) => `data:${type};base64,${readFileSync(join(root, file)).toString("base64")}`;
const LOGO = dataUri("public/brand/farbaek-logo.webp", "image/webp");

const IOS = {
  dir: "desktop/release/store-ios",
  size: { w: 1206, h: 2622 },
  device: "iphone",
  slides: [
    { screen: "iphone-1-today.png", hero: true, title: "Approve what your agent builds.", line: "From idea to verified software, with control at every step." },
    { screen: "iphone-4-build.png", step: "Describe", title: "Start with one sentence.", line: "Farbaek drafts a plan. Nothing runs until you approve it." },
    { screen: "iphone-2-approvals.png", step: "Approve", title: "Every change waits for you.", line: "See what's waiting, and approve it with Face ID." },
    { screen: "iphone-3-review.png", step: "Review", title: "Read the exact change.", line: "Each file as a diff, with its checks and its risk." },
    { screen: "iphone-5-tasks.png", step: "Follow", title: "Follow every task.", line: "From the plan to the proof, in one list." },
    { screen: "iphone-6-you.png", step: "Anywhere", title: "Your workspace, on web and iPhone.", line: "Sign in with Apple, Google or email." },
  ],
};

const ANDROID = {
  dir: "desktop/release/store-android",
  size: { w: 1080, h: 1920 },
  device: "android",
  slides: [
    { screen: "real-1-mission-control.png", hero: true, title: "Approve what your agent builds.", line: "From idea to verified software, with control at every step." },
    { screen: "real-2-plan.png", step: "Describe", title: "Start with one sentence.", line: "Farbaek drafts a plan. Nothing runs until you approve it." },
    { screen: "real-3-agent.png", step: "Build", title: "Watch the agent build.", line: "It works on a copy, in an isolated sandbox." },
    { screen: "real-4-preview.png", step: "Preview", title: "See what it built.", line: "On a phone, a tablet or a desktop, before it's live." },
    { screen: "real-5-approvals.png", step: "Approve", title: "Every change waits for you.", line: "Each approval is bound to the exact change you read." },
    { screen: "real-6-diff.png", step: "Review", title: "Read the exact change.", line: "Every file as a diff, tied to the plan's checks." },
    { screen: "real-7-proof.png", step: "Verify", title: "Proof you can check.", line: "Checked in a sandbox. Anyone can verify the record." },
  ],
};

/** One slide as HTML. All sizes scale from the canvas width, so both stores share one design. */
function slideHtml(set, slide, index) {
  const { w, h } = set.size;
  const u = w / 1206; // 1 unit = 1px on the iPhone canvas
  const n = set.slides.length;
  const screen = dataUri(join(set.dir, slide.screen), "image/png");
  const iphone = set.device === "iphone";
  const ratio = iphone ? 2868 / 1320 : 1920 / 1080;
  const threadY = Math.round(250 * u);
  const textTop = Math.round((slide.hero ? 520 : 360) * u);
  // The first image has the logo and a longer headline, so its phone is a little smaller.
  const phoneW = Math.round((iphone ? (slide.hero ? 760 : 840) : slide.hero ? 660 : 700) * u);
  const bezel = Math.round(16 * u);
  const screenW = phoneW - bezel * 2;
  // The web app has no status bar of its own; Android draws one above the page, where the camera sits.
  const statusH = iphone ? 0 : Math.round(44 * u);
  const screenH = Math.round(screenW * ratio) + statusH;
  const phoneH = screenH + bezel * 2;
  const phoneTop = iphone ? h - phoneH - Math.round(70 * u) : Math.round((slide.hero ? 930 : 800) * u);
  const radius = Math.round((iphone ? 118 : 86) * u);
  // On the first image the thread starts after the wordmark, so it never crosses the logo.
  const threadLeft = slide.hero ? Math.round(770 * u) : 0;
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500&family=Geist+Mono:wght@500&display=block" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${w}px; height: ${h}px; overflow: hidden; background: ${TOKENS.canvas}; }
  body { position: relative; font-family: "Geist", system-ui, sans-serif; color: ${TOKENS.ink}; -webkit-font-smoothing: antialiased; }
  .aurora { position: absolute; inset: 0; background:
      radial-gradient(${Math.round(760 * u)}px ${Math.round(900 * u)}px at 72% ${Math.round(phoneTop + phoneH * 0.38)}px, color-mix(in oklab, ${TOKENS.accent} 13%, transparent), transparent 70%),
      radial-gradient(${Math.round(560 * u)}px ${Math.round(620 * u)}px at 18% ${Math.round(phoneTop + phoneH * 0.78)}px, color-mix(in oklab, ${TOKENS.accent2} 11%, transparent), transparent 70%); }
  /* The proof thread: one gradient across all ${n} images, so it continues from one to the next. */
  .thread { position: absolute; left: ${threadLeft}px; right: 0; top: ${threadY}px; height: ${Math.max(3, Math.round(4 * u))}px;
      background: linear-gradient(90deg, ${TOKENS.accent}, ${TOKENS.accent2}, ${TOKENS.accent});
      background-size: ${n * w}px 100%; background-position: ${-index * w - threadLeft}px 0; opacity: .9; }
  .node { position: absolute; top: ${threadY - Math.round(15 * u)}px; left: ${slide.hero ? threadLeft : Math.round(96 * u)}px; width: ${Math.round(34 * u)}px; height: ${Math.round(34 * u)}px;
      border-radius: 999px; background: ${TOKENS.surface}; border: ${Math.round(7 * u)}px solid ${TOKENS.accent}; }
  .step { position: absolute; top: ${threadY + Math.round(40 * u)}px; left: ${Math.round(96 * u)}px; font: 500 ${Math.round(30 * u)}px/1 "Geist Mono", ui-monospace, monospace;
      color: ${TOKENS.accent}; letter-spacing: .02em; }
  .brand { position: absolute; top: ${Math.round(84 * u)}px; left: ${Math.round(96 * u)}px; display: flex; align-items: center; gap: ${Math.round(26 * u)}px; }
  .brand img { height: ${Math.round(310 * u)}px; width: auto; }
  .brand span { font-weight: 500; font-size: ${Math.round(100 * u)}px; letter-spacing: -0.04em; }
  .copy { position: absolute; left: ${Math.round(96 * u)}px; right: ${Math.round(96 * u)}px; top: ${textTop}px; }
  h1 { font-weight: 500; font-size: ${Math.round((slide.hero ? 112 : 104) * u)}px; line-height: 1.02; letter-spacing: -0.045em; max-width: ${Math.round(1000 * u)}px; }
  p { margin-top: ${Math.round(30 * u)}px; font-size: ${Math.round(44 * u)}px; line-height: 1.32; color: ${TOKENS.ink2}; max-width: ${Math.round(940 * u)}px; letter-spacing: -0.01em; }
  .phone { position: absolute; left: ${Math.round((w - phoneW) / 2 + (slide.hero ? 90 : 60) * u)}px; top: ${phoneTop}px; width: ${phoneW}px; height: ${phoneH}px;
      border-radius: ${radius}px; background: ${TOKENS.ink}; padding: ${bezel}px;
      box-shadow: 0 ${Math.round(2 * u)}px ${Math.round(4 * u)}px rgb(18 19 23 / .06), 0 ${Math.round(60 * u)}px ${Math.round(140 * u)}px -${Math.round(30 * u)}px rgb(36 80 240 / .32), 0 0 0 ${Math.round(2 * u)}px rgb(18 19 23 / .9); }
  .screen { width: ${screenW}px; height: ${screenH}px; border-radius: ${radius - bezel}px; overflow: hidden; background: ${TOKENS.canvas}; position: relative; }
  .screen img { width: 100%; display: block; }
  .status { height: ${statusH}px; background: ${TOKENS.canvas}; }
  .cam { position: absolute; left: 50%; transform: translateX(-50%); background: ${TOKENS.ink}; }
  .island { top: ${Math.round(26 * u)}px; width: ${Math.round(230 * u)}px; height: ${Math.round(66 * u)}px; border-radius: 999px; }
  .punch { top: ${Math.round((44 - 26) / 2 * u)}px; width: ${Math.round(26 * u)}px; height: ${Math.round(26 * u)}px; border-radius: 999px; }
</style></head><body>
  <div class="aurora"></div>
  <div class="thread"></div><div class="node"></div>
  ${slide.hero ? `<div class="brand"><img src="${LOGO}" alt=""><span>Farbaek</span></div>` : `<div class="step">${slide.step}</div>`}
  <div class="copy"><h1>${slide.title}</h1><p>${slide.line}</p></div>
  <div class="phone"><div class="screen">${iphone ? "" : '<div class="status"></div>'}<img src="${screen}" alt=""><div class="cam ${iphone ? "island" : "punch"}"></div></div></div>
</body></html>`;
}

/** Google Play's 1024 x 500 feature graphic: the logo, the line, and the app. */
function featureHtml() {
  const screen = dataUri(join(ANDROID.dir, ANDROID.slides[0].screen), "image/png");
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500&display=block" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1024px; height: 500px; overflow: hidden; background: ${TOKENS.canvas}; font-family: "Geist", system-ui, sans-serif; color: ${TOKENS.ink}; -webkit-font-smoothing: antialiased; }
  .aurora { position: absolute; inset: 0; background:
    radial-gradient(420px 420px at 80% 60%, color-mix(in oklab, ${TOKENS.accent} 14%, transparent), transparent 70%),
    radial-gradient(300px 260px at 56% 100%, color-mix(in oklab, ${TOKENS.accent2} 12%, transparent), transparent 70%); }
  .thread { position: absolute; left: 0; right: 0; top: 70px; height: 3px; background: linear-gradient(90deg, ${TOKENS.accent}, ${TOKENS.accent2}); opacity: .9; }
  .node { position: absolute; left: 56px; top: 61px; width: 21px; height: 21px; border-radius: 999px; background: #fff; border: 5px solid ${TOKENS.accent}; }
  .knight { position: absolute; left: 44px; top: 112px; height: 340px; width: auto; }
  .copy { position: absolute; left: 236px; top: 150px; width: 420px; }
  .brand { font-weight: 500; font-size: 30px; letter-spacing: -0.03em; }
  h1 { margin-top: 14px; font-weight: 500; font-size: 50px; line-height: 1.02; letter-spacing: -0.045em; }
  p { margin-top: 16px; font-size: 19px; line-height: 1.35; color: ${TOKENS.ink2}; }
  .phone { position: absolute; left: 708px; top: 112px; width: 252px; border-radius: 34px; background: ${TOKENS.ink}; padding: 7px;
    box-shadow: 0 30px 70px -20px rgb(36 80 240 / .35), 0 0 0 1px rgb(18 19 23 / .9); }
  .screen { width: 238px; height: 423px; border-radius: 28px; overflow: hidden; }
  .screen img { width: 100%; display: block; }
</style></head><body>
  <div class="aurora"></div><div class="thread"></div><div class="node"></div>
  <img class="knight" src="${LOGO}" alt="">
  <div class="copy"><div class="brand">Farbaek</div><h1>Approve what your agent builds.</h1><p>From idea to verified software, with control at every step.</p></div>
  <div class="phone"><div class="screen"><img src="${screen}" alt=""></div></div>
</body></html>`;
}

/** A phone with a real iPhone screen, for the wide App Store artwork. */
function iphoneFrame(file, width, style = "") {
  const screen = dataUri(join(IOS.dir, file), "image/png");
  const bezel = Math.round(width * 0.02);
  const radius = Math.round(width * 0.14);
  const screenH = Math.round((width - bezel * 2) * (2868 / 1320));
  return `<div style="position:absolute; ${style} width:${width}px; height:${screenH + bezel * 2}px; border-radius:${radius}px; background:${TOKENS.ink}; padding:${bezel}px;
      box-shadow: 0 ${Math.round(width * 0.08)}px ${Math.round(width * 0.2)}px -${Math.round(width * 0.04)}px rgb(36 80 240 / .30), 0 0 0 ${Math.max(2, Math.round(width * 0.003))}px rgb(18 19 23 / .9);">
    <div style="position:relative; width:100%; height:${screenH}px; border-radius:${radius - bezel}px; overflow:hidden;">
      <img src="${screen}" style="width:100%; display:block" alt="">
      <div style="position:absolute; left:50%; top:${Math.round(width * 0.03)}px; transform:translateX(-50%); width:${Math.round(width * 0.27)}px; height:${Math.round(width * 0.08)}px; border-radius:999px; background:${TOKENS.ink}"></div>
    </div></div>`;
}

const WIDE_HEAD = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500&family=Geist+Mono:wght@500&display=block" rel="stylesheet">`;

/**
 * The App Store product page header (21:9, 3840 x 1646). Apple asks for one clear idea and a
 * short phrase, inside a safe area its templates define, so everything that matters sits in the
 * middle third: the logo, the name and the line on the proof thread, with real screens either side.
 */
function headerHtml() {
  const W = 3840, H = 1646, threadY = 640;
  return `${WIDE_HEAD}<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${TOKENS.canvas}; font-family: "Geist", system-ui, sans-serif; color: ${TOKENS.ink}; -webkit-font-smoothing: antialiased; }
  .aurora { position: absolute; inset: 0; background:
    radial-gradient(1300px 900px at 50% 46%, color-mix(in oklab, ${TOKENS.accent} 12%, transparent), transparent 70%),
    radial-gradient(900px 700px at 28% 90%, color-mix(in oklab, ${TOKENS.accent2} 10%, transparent), transparent 70%),
    radial-gradient(900px 700px at 74% 92%, color-mix(in oklab, ${TOKENS.accent2} 9%, transparent), transparent 70%); }
  .thread { position: absolute; top: ${threadY}px; height: 8px; background: linear-gradient(90deg, ${TOKENS.accent}, ${TOKENS.accent2}); opacity: .9; }
  .node { position: absolute; top: ${threadY - 26}px; width: 60px; height: 60px; border-radius: 999px; background: #fff; border: 13px solid ${TOKENS.accent}; }
  .center { position: absolute; left: 50%; top: 210px; transform: translateX(-50%); display: flex; align-items: center; gap: 70px; }
  .center img { height: 860px; width: auto; }
  .name { font-weight: 500; font-size: 200px; letter-spacing: -0.045em; line-height: 1; }
  .line { margin-top: 44px; font-size: 92px; font-weight: 500; letter-spacing: -0.035em; line-height: 1.04; color: ${TOKENS.ink}; max-width: 1180px; }
  .sub { margin-top: 30px; font-size: 52px; color: ${TOKENS.ink2}; letter-spacing: -0.01em; }
  .text { padding-top: 120px; }
</style></head><body>
  <div class="aurora"></div>
  <!-- The thread breaks around the logo and the words, so nothing crosses them. -->
  <div class="thread" style="left: 0; width: 930px"></div><div class="thread" style="left: 2910px; right: 0; transform: scaleX(-1)"></div>
  <div class="node" style="left: 900px"></div><div class="node" style="left: 2880px"></div>
  ${iphoneFrame("iphone-3-review.png", 520, "left: -190px; top: 560px;")}
  ${iphoneFrame("iphone-2-approvals.png", 560, "left: 250px; top: 250px;")}
  ${iphoneFrame("iphone-4-build.png", 520, "right: -190px; top: 560px;")}
  ${iphoneFrame("iphone-1-today.png", 560, "right: 250px; top: 250px;")}
  <div class="center"><img src="${LOGO}" alt=""><div class="text"><div class="name">Farbaek</div><div class="line">Approve what your agent builds.</div><div class="sub">From idea to verified software.</div></div></div>
</body></html>`;
}

/** The App Store search results artwork (3:2, 3840 x 2560): "state the obvious", with the app itself. */
function searchHtml() {
  const W = 3840, H = 2560, threadY = 760;
  const steps = [
    { file: "iphone-4-build.png", label: "Describe", x: 330 },
    { file: "iphone-2-approvals.png", label: "Approve", x: 1430 },
    { file: "iphone-3-review.png", label: "Review", x: 2530 },
  ];
  return `${WIDE_HEAD}<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${TOKENS.canvas}; font-family: "Geist", system-ui, sans-serif; color: ${TOKENS.ink}; -webkit-font-smoothing: antialiased; }
  .aurora { position: absolute; inset: 0; background:
    radial-gradient(1500px 1100px at 50% 75%, color-mix(in oklab, ${TOKENS.accent} 12%, transparent), transparent 70%),
    radial-gradient(1000px 800px at 12% 100%, color-mix(in oklab, ${TOKENS.accent2} 10%, transparent), transparent 70%); }
  h1 { position: absolute; left: 330px; top: 170px; font-weight: 500; font-size: 230px; letter-spacing: -0.05em; line-height: 1; }
  .thread { position: absolute; left: 0; right: 0; top: ${threadY}px; height: 10px; background: linear-gradient(90deg, ${TOKENS.accent}, ${TOKENS.accent2} 50%, ${TOKENS.accent}); opacity: .9; }
  .node { position: absolute; top: ${threadY - 31}px; width: 72px; height: 72px; border-radius: 999px; background: #fff; border: 16px solid ${TOKENS.accent}; }
  .label { position: absolute; top: ${threadY + 70}px; font: 500 64px/1 "Geist Mono", ui-monospace, monospace; color: ${TOKENS.accent}; letter-spacing: .02em; }
</style></head><body>
  <div class="aurora"></div>
  <h1>Approve what your agent builds.</h1>
  <div class="thread"></div>
  ${steps.map((s) => `<div class="node" style="left:${s.x}px"></div><div class="label" style="left:${s.x}px">${s.label}</div>`).join("")}
  ${steps.map((s) => iphoneFrame(s.file, 980, `left: ${s.x}px; top: ${threadY + 200}px;`)).join("")}
</body></html>`;
}

const chromePath = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"].find((p) => existsSync(p));
const browser = await chromium.launch({ executablePath: chromePath, headless: true });

async function render(html, size, out) {
  const page = await browser.newPage({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const font = await page.evaluate(() => document.fonts.check('500 40px "Geist"'));
  if (!font) throw new Error("Geist didn't load, so nothing was written");
  const png = await page.screenshot({ type: "png" });
  await page.close();
  // Opaque 24-bit PNGs: both stores refuse or flatten images with an alpha channel.
  await sharp(png).flatten({ background: TOKENS.canvas }).removeAlpha().png().toFile(out);
  const m = await sharp(out).metadata();
  console.log(out.replace(root, "").replace(/^[\\/]/, ""), `${m.width}x${m.height}`, m.channels === 3 ? "rgb" : `channels=${m.channels}`);
}

const only = process.argv[2]; // "ios" or "android"; both when left out
for (const set of [IOS, ANDROID].filter((s) => !only || (only === "ios" ? s === IOS : s === ANDROID))) {
  const outDir = join(root, set.dir, "designed");
  mkdirSync(outDir, { recursive: true });
  for (const [i, slide] of set.slides.entries()) {
    const name = set.device === "iphone" ? `app-store-${i + 1}.png` : `play-phone-${i + 1}.png`;
    await render(slideHtml(set, slide, i), set.size, join(outDir, name));
  }
}
if (only !== "ios") await render(featureHtml(), { w: 1024, h: 500 }, join(root, ANDROID.dir, "designed", "play-feature-graphic.png"));
if (only !== "android") {
  await render(headerHtml(), { w: 3840, h: 1646 }, join(root, IOS.dir, "designed", "app-store-header.png"));
  await render(searchHtml(), { w: 3840, h: 2560 }, join(root, IOS.dir, "designed", "app-store-search.png"));
}
await browser.close();
