// Records Farbaek's product films (ADR 0034). Run against a server started
// with FARBAEK_FILM_STAGE=1 (pnpm start, or the "farbaek-films-prod" launch
// config). For each film and format it opens /film-stage/<id> in headless
// Chrome, steps the film's timeline frame by frame, screenshots each frame
// to a temporary folder, then encodes them with ffmpeg to an H.264 MP4. A
// file over its size budget is re-encoded from the same frames at a higher
// CRF, so the size is tuned without filming again. It also writes the poster
// and the WebVTT captions and chapters. Then run `pnpm films:loops` for each
// film's silent loop (ADR 0056).
//
//   pnpm films:record                      every film
//   pnpm films:record build proof          some films
//   pnpm films:record build --format=portrait
//   pnpm films:record build --stills=5200,15000 --out=<folder>   still frames only, for review
//
// Needs Chrome (CHROME_PATH, or the usual install folders) and ffmpeg
// (FFMPEG_PATH, @ffmpeg-installer/win32-x64, or ffmpeg on PATH).
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { writeFilmManifest } from "./manifest.mjs";

const require = createRequire(import.meta.url);
const FILMS = ["build", "proof", "clip-plan", "clip-agent", "clip-check", "clip-live"];
const FPS = 30;
// The size limits in src/content/films.ts (FILM_BUDGET_BYTES), repeated here for a script that can't import TypeScript.
const BUDGET = { landscape: 12_000_000, portrait: 8_000_000, clip: 2_500_000 };
// Where each format's CRF starts (lower is sharper): near-transparent quality for interface text (ADR 0057).
const START_CRF = { landscape: 20, portrait: 18, clip: 18 };
const MAX_CRF = 26;

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const ids = args.filter((a) => !a.startsWith("--"));
const base = flag("base") ?? "http://localhost:3000";
const onlyFormat = flag("format");
const stills = flag("stills")?.split(",").map(Number).filter((n) => Number.isFinite(n));
const stillsOut = flag("out");
const crfFlag = flag("crf");

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

function encode(frames, out, quality) {
  const ff = spawn(
    ffmpegPath(),
    ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(frames, "f%05d.png"), "-c:v", "libx264", "-preset", "slow", "-tune", "animation", "-crf", String(quality), "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", out],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  return new Promise((resolve, reject) => {
    ff.on("error", reject);
    ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });
}

async function openStage(browser, id, format) {
  // Sizes come from the stage itself, so this script never drifts from src/content/films.ts.
  const probe = await browser.newPage();
  await probe.goto(`${base}/film-stage/${id}?format=${format}`, { waitUntil: "networkidle" });
  await probe.waitForFunction(() => window.__film?.ready === true, null, { timeout: 60_000 });
  const meta = await probe.evaluate(() => {
    const f = window.__film;
    return { durationMs: f.durationMs, posterAtMs: f.posterAtMs, size: f.size, captionsVtt: f.captionsVtt, chaptersVtt: f.chaptersVtt, format: f.format };
  });
  await probe.close();
  const context = await browser.newContext({
    viewport: { width: meta.size.cssWidth, height: meta.size.cssHeight },
    deviceScaleFactor: meta.size.width / meta.size.cssWidth,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  // Anything the page complains about while it's filmed is worth knowing.
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") console.warn(`[${id} ${format}] ${msg.type()}: ${msg.text().slice(0, 300)}`);
  });
  page.on("pageerror", (err) => console.warn(`[${id} ${format}] page error: ${err.message}`));
  await page.goto(`${base}/film-stage/${id}?format=${format}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__film?.ready === true, null, { timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
  const clip = { x: 0, y: 0, width: meta.size.cssWidth, height: meta.size.cssHeight };
  // Frames are lossless PNG, so the only compression is the film's own (ADR 0057); stills and posters are JPEG.
  const shot = async (ms, quality) => {
    await page.evaluate((t) => window.__film.seek(t), ms);
    return quality ? page.screenshot({ type: "jpeg", quality, clip }) : page.screenshot({ type: "png", clip });
  };
  return { meta, shot, close: () => context.close() };
}

async function formatsOf(browser, id) {
  const page = await browser.newPage();
  await page.goto(`${base}/film-stage/${id}`, { waitUntil: "networkidle" });
  // The stage renders the first format by default; ask it which formats exist by trying each.
  const formats = [];
  for (const f of ["landscape", "portrait", "clip"]) {
    await page.goto(`${base}/film-stage/${id}?format=${f}`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.__film?.ready === true, null, { timeout: 60_000 });
    if ((await page.evaluate(() => window.__film.format)) === f) formats.push(f);
  }
  await page.close();
  return formats;
}

const browser = await chromium.launch({ executablePath: chromePath(), headless: true, args: ["--force-color-profile=srgb", "--hide-scrollbars"] });
try {
  for (const id of ids.length ? ids : FILMS) {
    const formats = (await formatsOf(browser, id)).filter((f) => !onlyFormat || f === onlyFormat);
    for (const format of formats) {
      const stage = await openStage(browser, id, format);
      if (stills) {
        const out = stillsOut ?? join("films-stills", id);
        mkdirSync(out, { recursive: true });
        for (const ms of stills) {
          writeFileSync(join(out, `${format}-${ms}.jpg`), await stage.shot(ms, 88));
          console.log(`still ${id} ${format} ${ms}ms`);
        }
        await stage.close();
        continue;
      }
      const dir = join("public", "films", id);
      mkdirSync(dir, { recursive: true });
      const frames = Math.round((stage.meta.durationMs / 1000) * FPS);
      const out = join(dir, `${format}.mp4`);
      const started = Date.now();
      const tmp = mkdtempSync(join(tmpdir(), `farbaek-film-${id}-${format}-`));
      try {
        for (let i = 0; i < frames; i += 1) {
          writeFileSync(join(tmp, `f${String(i).padStart(5, "0")}.png`), await stage.shot((i * 1000) / FPS));
          if (i % 150 === 0) console.log(`${id} ${format}: frame ${i}/${frames}`);
        }
        writeFileSync(join(dir, `${format}.jpg`), await stage.shot(stage.meta.posterAtMs, 92));
        writeFileSync(join(dir, "captions.vtt"), stage.meta.captionsVtt);
        writeFileSync(join(dir, "chapters.vtt"), stage.meta.chaptersVtt);
        await stage.close();
        let crf = Number(crfFlag ?? START_CRF[format]);
        for (;;) {
          await encode(tmp, out, crf);
          const bytes = statSync(out).size;
          console.log(`${out}: ${(bytes / 1e6).toFixed(2)} MB at CRF ${crf}, ${frames} frames, ${Math.round((Date.now() - started) / 1000)} s`);
          if (bytes <= BUDGET[format]) break;
          if (crfFlag || crf >= MAX_CRF) {
            console.error(`${out} is over its budget of ${(BUDGET[format] / 1e6).toFixed(1)} MB.`);
            process.exitCode = 1;
            break;
          }
          crf += 2;
        }
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    }
  }
} finally {
  await browser.close();
}

// New recordings get new URLs, so phones that cached the old ones fetch these (ADR 0051).
if (!stills) console.log(`Film manifest: ${Object.keys(writeFilmManifest()).length} files.`);
