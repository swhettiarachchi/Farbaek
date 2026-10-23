// Makes the silent loop of every film recording (ADR 0056): an animated WebP
// at <film>/<format>-loop.webp. The players show it wherever a browser won't
// start the video on its own (iOS Low Power Mode, in-app browsers that need a
// tap), so the homepage films keep moving like animation. Animated WebP plays
// in every current browser without a tap, and for screen recordings it stores
// only what changed between frames, so a loop is about half its MP4.
//
//   node scripts/films/loops.mjs              every recording
//   node scripts/films/loops.mjs build proof  some films
//
// Run it after `pnpm films:record`; it rewrites the film manifest at the end.
// Needs ffmpeg (FFMPEG_PATH, @ffmpeg-installer/win32-x64, or ffmpeg on PATH)
// and sharp, which ships with Next.js.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFilmManifest } from "./manifest.mjs";

const require = createRequire(import.meta.url);
const sharp = require(require.resolve("sharp", { paths: [dirname(require.resolve("next/package.json"))] }));
const FILMS_DIR = fileURLToPath(new URL("../../public/films", import.meta.url));

/** Per format: the loop's width, frame rate and WebP quality. Phones show the portrait cut and the clips. */
export const LOOP_SETTINGS = {
  clip: { width: 640, fps: 10, quality: 50 },
  portrait: { width: 480, fps: 10, quality: 45 },
  landscape: { width: 720, fps: 10, quality: 40 },
};

function ffmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    return require.resolve("@ffmpeg-installer/win32-x64/ffmpeg.exe");
  } catch {
    return "ffmpeg";
  }
}

function frames(mp4, dir, { width, fps }) {
  const ff = spawn(ffmpegPath(), ["-y", "-loglevel", "error", "-i", mp4, "-vf", `fps=${fps},scale=${width}:-2:flags=lanczos`, join(dir, "f%05d.png")], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  return new Promise((resolve, reject) => {
    ff.on("error", reject);
    ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });
}

async function makeLoop(film, format) {
  const mp4 = join(FILMS_DIR, film, `${format}.mp4`);
  const out = join(FILMS_DIR, film, `${format}-loop.webp`);
  const settings = LOOP_SETTINGS[format];
  const dir = mkdtempSync(join(tmpdir(), "farbaek-loop-"));
  try {
    await frames(mp4, dir, settings);
    const pngs = readdirSync(dir).filter((f) => f.endsWith(".png")).sort().map((f) => join(dir, f));
    await sharp(pngs, { join: { animated: true } })
      .webp({ quality: settings.quality, effort: 4, loop: 0, delay: Math.round(1000 / settings.fps), smartSubsample: true })
      .toFile(out);
    console.log(`${film}/${format}-loop.webp: ${pngs.length} frames, ${(statSync(out).size / 1e6).toFixed(2)} MB`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const only = process.argv.slice(2);
for (const film of readdirSync(FILMS_DIR).sort()) {
  if (only.length && !only.includes(film)) continue;
  for (const format of Object.keys(LOOP_SETTINGS)) {
    if (existsSync(join(FILMS_DIR, film, `${format}.mp4`))) await makeLoop(film, format);
  }
}
const manifest = writeFilmManifest();
console.log(`Film manifest: ${Object.keys(manifest).length} files.`);
