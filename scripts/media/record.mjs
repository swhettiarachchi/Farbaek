// Records the Farbaek media library (ADR 0156): seamless video loops and stills
// rendered from Farbaek Scenes (public/kit/scenes/v1/scenes.js), so every
// file is Farbaek's own and free to use in any site Farbaek builds.
//
// It serves public/ and a stage page itself (no Farbaek server needed), opens
// each scene in headless Chrome, steps the loop frame by frame, encodes an
// H.264 MP4 with ffmpeg (re-encoding at a higher CRF until it fits the
// budget) and saves WebP stills with sharp. Then it writes the manifest the
// catalogue's test reads (src/content/media-library.json).
//
//   node scripts/media/record.mjs                     every item
//   node scripts/media/record.mjs aurora-signal       some items
//   node scripts/media/record.mjs --stills-only       stills, no video
//
// Needs Chrome (CHROME_PATH or the usual install folders), ffmpeg (FFMPEG_PATH,
// @ffmpeg-installer/win32-x64, or ffmpeg on PATH) and network access to
// cdn.jsdelivr.net for three.js. Never re-record into v1: published sites use
// these files, and they're cached as immutable. A new look goes into v2.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const require = createRequire(import.meta.url);
const sharp = require(require.resolve("sharp", { paths: [dirname(require.resolve("next/package.json"))] }));
const PUBLIC = fileURLToPath(new URL("../../public", import.meta.url));
const OUT = join(PUBLIC, "media", "v1");
const MANIFEST = fileURLToPath(new URL("../../src/content/media-library.json", import.meta.url));

// The loop: 10 s at 24 fps, one full turn of every scene's phase, so frame 240 would equal frame 0.
const FPS = 24;
const SECONDS = 10;
const VIDEO = { width: 1280, height: 720 };
const STILLS = { "16x9": { width: 1600, height: 900 }, "4x5": { width: 1080, height: 1350 } };
const STILL_AT = 3.4;
const VIDEO_BUDGET = 1_650_000;
const STILL_BUDGET = 240_000;
const START_CRF = 24;
const MAX_CRF = 34;

/** Colourways: the stage's background, tone and three colours. Repeated in src/content/media-library.ts. */
const COLOURWAYS = {
  signal: { tone: "dark", base: "#0a0f1f", palette: "#2450f0,#22d3ee,#e8eefc" },
  ember: { tone: "dark", base: "#140b10", palette: "#ff8a3d,#ff4d6d,#ffe9d6" },
  pearl: { tone: "light", base: "#f4f6fa", palette: "#5b7bd5,#7cc6dc,#1d2433" },
};
const SCENES = ["aurora", "glass", "particles", "horizon", "orb"];
const ITEMS = SCENES.flatMap((scene) => Object.keys(COLOURWAYS).map((colourway) => ({ id: `${scene}-${colourway}`, scene, colourway })));

const args = process.argv.slice(2);
const only = args.filter((a) => !a.startsWith("--"));
const stillsOnly = args.includes("--stills-only");

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  const found = candidates.find((p) => p && existsSync(p));
  if (!found) throw new Error("Chrome wasn't found. Set CHROME_PATH.");
  return found;
}

function ffmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    return require.resolve("@ffmpeg-installer/win32-x64/ffmpeg.exe");
  } catch {
    return "ffmpeg";
  }
}

function encode(frames, out, crf) {
  // aq-mode 3 keeps dark gradients from banding; the loop has no audio.
  const ff = spawn(
    ffmpegPath(),
    ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(frames, "f%05d.png"), "-c:v", "libx264", "-preset", "slow", "-tune", "film", "-x264-params", "aq-mode=3", "-crf", String(crf), "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", out],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  return new Promise((resolve, reject) => {
    ff.on("error", reject);
    ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });
}

const STAGE = (q) => {
  const c = COLOURWAYS[q.get("colourway")] ?? COLOURWAYS.signal;
  const scene = q.get("scene") ?? "aurora";
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:${c.base}}#s{position:fixed;inset:0}</style></head>
<body><div id="s" data-farbaek-scene="${scene}" data-palette="${c.palette}" data-tone="${c.tone}" data-backdrop="solid" style="background:${c.base}"></div>
<script>window.FARBAEK_SCENES_MANUAL = true;</script>
<script type="module">
const m = await import("/kit/scenes/v1/scenes.js");
const ctrl = await m.mount(document.getElementById("s"), { manual: true, force: true, pixelRatio: 1, period: ${SECONDS} });
await ctrl.ready;
window.__stage = { renderAt: (t) => ctrl.renderAt(t), state: ctrl.state, reason: ctrl.reason };
</script></body></html>`;
};

const TYPES = { ".js": "text/javascript", ".html": "text/html" };
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://stage");
  if (url.pathname === "/__stage") {
    res.writeHead(200, { "content-type": "text/html" });
    return res.end(STAGE(url.searchParams));
  }
  const path = normalize(join(PUBLIC, decodeURIComponent(url.pathname)));
  if (!path.startsWith(normalize(PUBLIC)) || !existsSync(path)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
  res.end(readFileSync(path));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  executablePath: chromePath(),
  headless: true,
  args: ["--force-color-profile=srgb", "--hide-scrollbars", "--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--use-angle=d3d11", "--enable-unsafe-swiftshader"],
});

async function openStage(item, size) {
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on("pageerror", (err) => console.warn(`[${item.id}] page error: ${err.message}`));
  page.on("console", (msg) => msg.type() === "error" && console.warn(`[${item.id}] ${msg.text().slice(0, 300)}`));
  await page.goto(`${base}/__stage?scene=${item.scene}&colourway=${item.colourway}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__stage, null, { timeout: 120_000 });
  const state = await page.evaluate(() => window.__stage.state);
  if (state !== "running") throw new Error(`${item.id}: the scene didn't start (${await page.evaluate(() => window.__stage.reason)})`);
  const shot = async (t, type = "png") => {
    await page.evaluate((s) => window.__stage.renderAt(s), t);
    return page.screenshot({ type, clip: { x: 0, y: 0, ...size } });
  };
  return { shot, close: () => context.close() };
}

const sha = (path) => createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 12);
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {};

try {
  const probe = await browser.newPage();
  await probe.goto(`${base}/__stage?scene=aurora&colourway=signal`, { waitUntil: "load" });
  const gpu = await probe.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
  });
  await probe.close();
  console.log(`rendering with ${gpu}`);

  for (const item of ITEMS.filter((i) => !only.length || only.includes(i.id))) {
    const dir = join(OUT, item.id);
    mkdirSync(dir, { recursive: true });
    const files = {};
    for (const [ratio, size] of Object.entries(STILLS)) {
      const stage = await openStage(item, size);
      const png = await stage.shot(STILL_AT);
      await stage.close();
      const out = join(dir, `still-${ratio}.webp`);
      let quality = 82;
      do {
        await sharp(png).webp({ quality, effort: 6 }).toFile(out);
        quality -= 6;
      } while (statSync(out).size > STILL_BUDGET && quality >= 50);
      files[`still-${ratio}.webp`] = { bytes: statSync(out).size, sha: sha(out), width: size.width, height: size.height };
      console.log(`${item.id} still ${ratio}: ${(statSync(out).size / 1e3).toFixed(0)} KB`);
    }
    if (!stillsOnly) {
      const frames = mkdtempSync(join(tmpdir(), `farbaek-media-${item.id}-`));
      const started = Date.now();
      try {
        const stage = await openStage(item, VIDEO);
        const total = FPS * SECONDS;
        for (let f = 0; f < total; f++) {
          writeFileSync(join(frames, `f${String(f).padStart(5, "0")}.png`), await stage.shot(f / FPS));
          if (f % 48 === 0) console.log(`${item.id} frame ${f}/${total}`);
        }
        await stage.close();
        const out = join(dir, "loop.mp4");
        let crf = START_CRF;
        for (;;) {
          await encode(frames, out, crf);
          const bytes = statSync(out).size;
          console.log(`${item.id} loop: ${(bytes / 1e6).toFixed(2)} MB at CRF ${crf}, ${Math.round((Date.now() - started) / 1000)} s`);
          if (bytes <= VIDEO_BUDGET || crf >= MAX_CRF) break;
          crf += 2;
        }
        files["loop.mp4"] = { bytes: statSync(out).size, sha: sha(out), width: VIDEO.width, height: VIDEO.height, seconds: SECONDS, fps: FPS };
      } finally {
        rmSync(frames, { recursive: true, force: true });
      }
    } else if (manifest[item.id]?.["loop.mp4"]) {
      files["loop.mp4"] = manifest[item.id]["loop.mp4"];
    }
    manifest[item.id] = files;
    writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  }
} finally {
  await browser.close();
  server.close();
}
