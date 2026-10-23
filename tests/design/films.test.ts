/**
 * The product films (ADR 0034) ship as files in public/films, recorded by
 * `pnpm films:record`. This keeps them honest and light: every film and
 * format has its recording and poster, each recording fits its size budget
 * and starts playing before it has fully downloaded, the captions match
 * src/content/films.ts, the words follow the copy rules, and every URL
 * carries the hash of exactly the file it names (ADR 0051).
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { toVtt } from "@/components/films/timeline";
import FILM_VERSIONS from "@/content/films-manifest.json";
import { filmManifest } from "../../scripts/films/manifest.mjs";
import { FILMS, FILM_BUDGET_BYTES, FILM_LABEL, filmFile, filmTrack, type FilmFormat, type FilmMeta } from "@/content/films";

const PUBLIC = path.resolve(__dirname, "..", "..", "public");
const local = (url: string) => path.join(PUBLIC, ...url.split("?")[0]!.split("/").filter(Boolean));
const films = Object.values(FILMS) as FilmMeta[];
const id = (f: FilmMeta) => f.id as keyof typeof FILMS;
// Git may check text out with CRLF on Windows; the cues are what matter.
const text = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");

describe("product films", () => {
  it("lists the current hash of every recording and track, so a re-recording gets a new URL", () => {
    expect(FILM_VERSIONS, "run node scripts/films/manifest.mjs").toEqual(filmManifest());
    for (const film of films) {
      for (const format of Object.keys(film.formats) as FilmFormat[]) expect(filmFile(id(film), format, "mp4")).toMatch(/\?v=[0-9a-f]{12}$/);
      expect(filmTrack(id(film), "captions")).toMatch(/\?v=[0-9a-f]{12}$/);
    }
  });

  for (const film of films) {
    for (const format of Object.keys(film.formats) as FilmFormat[]) {
      it(`${film.id} has a ${format} recording within budget, ready to stream`, () => {
        const mp4 = local(filmFile(id(film), format, "mp4"));
        expect(existsSync(mp4), `${mp4} is missing: run pnpm films:record ${film.id}`).toBe(true);
        expect(statSync(mp4).size).toBeLessThanOrEqual(FILM_BUDGET_BYTES[format]);
        // faststart: the index comes before the media, so playback starts while it downloads.
        const head = readFileSync(mp4).subarray(0, 256 * 1024).toString("latin1");
        expect(head.slice(4, 8)).toBe("ftyp");
        expect(head.indexOf("moov")).toBeGreaterThan(0);
        expect(existsSync(local(filmFile(id(film), format, "jpg")))).toBe(true);
      });
    }

    it(`${film.id} has captions and chapters that match its script`, () => {
      expect(text(local(filmTrack(id(film), "captions")))).toBe(toVtt(film.chapters, film.durationMs, "caption"));
      expect(text(local(filmTrack(id(film), "chapters")))).toBe(toVtt(film.chapters, film.durationMs, "label"));
    });

    it(`${film.id} has ordered chapters from the start, and its poster inside the film`, () => {
      expect(film.chapters[0]?.start).toBe(0);
      film.chapters.forEach((c, i) => {
        if (i > 0) expect(c.start).toBeGreaterThan(film.chapters[i - 1]!.start);
        expect(c.start).toBeLessThan(film.durationMs);
      });
      expect(film.posterAtMs).toBeGreaterThanOrEqual(0);
      expect(film.posterAtMs).toBeLessThan(film.durationMs);
    });

    it(`${film.id} follows the copy rules`, () => {
      const words = [film.title, film.summary, ...film.chapters.flatMap((c) => [c.label, c.caption, c.tryIt?.label ?? ""])];
      for (const w of words) {
        expect(w).not.toMatch(/—/);
        expect(w).not.toMatch(/\b(first|guaranteed|complete protection)\b/i);
      }
      expect(film.summary.toLowerCase()).toContain("sample");
    });
  }

  it("labels every film as a sample recorded from the product", () => {
    expect(FILM_LABEL).toMatch(/sample/i);
    expect(FILM_LABEL).toMatch(/recorded from Farbaek's interface/);
  });

  it("links each chapter's Try it to a place on the homepage", () => {
    const hrefs = films.flatMap((f) => f.chapters.map((c) => c.tryIt?.href).filter(Boolean));
    for (const h of hrefs) expect(h).toMatch(/^#[a-z-]+$/);
  });
});
