// Writes src/content/films-manifest.json: a short content hash for every film
// recording and caption track in public/films (ADR 0051). The players add it
// to each URL (`?v=`), so phones can keep a recording for a year and still
// fetch a new one the moment it's re-recorded. `pnpm films:record` runs this
// at the end; run it on its own after replacing a file by hand:
//
//   node scripts/films/manifest.mjs
//
// Caption tracks are hashed with Unix line endings, so a Windows checkout and
// the Linux server agree.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const FILMS_DIR = join(ROOT, "public", "films");
const OUT = join(ROOT, "src", "content", "films-manifest.json");

/** The hash a file is published under: 12 hex characters of SHA-256. */
export function filmHash(name, bytes) {
  const content = name.endsWith(".vtt") ? Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n"), "utf8") : bytes;
  return createHash("sha256").update(content).digest("hex").slice(0, 12);
}

/** Every recording and track, as "<film>/<file>" → hash, sorted. */
export function filmManifest(dir = FILMS_DIR) {
  const entries = {};
  for (const film of readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    for (const file of readdirSync(join(dir, film)).filter((f) => f.endsWith(".mp4") || f.endsWith(".vtt")).sort()) {
      entries[`${film}/${file}`] = filmHash(file, readFileSync(join(dir, film, file)));
    }
  }
  return entries;
}

export function writeFilmManifest() {
  const manifest = filmManifest();
  writeFileSync(OUT, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const m = writeFilmManifest();
  console.log(`Film manifest: ${Object.keys(m).length} files written to src/content/films-manifest.json.`);
}
