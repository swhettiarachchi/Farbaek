/**
 * Natural type (ADR 0049): small text reads like a calm product, not like
 * generated UI. No code-comment labels ("// verify"), no type under 11px and
 * 11px only for tab-bar labels and count badges, at most one middot per
 * line, and no tracked-capital eyebrows. Mono is for data, which a scan can't
 * judge, so that rule lives in review and in the design guide.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = ["src/app", "src/components"].map((r) => path.join(process.cwd(), r));
/** Sample designs of other people's sites, drawn in container units: their type is theirs. */
const EXEMPT = new Set(["src/components/showcase/mockups.tsx"]);
/** Tab-bar labels and count badges may be 11px, as on every phone. */
const ELEVEN_PX_ALLOWED = new Set(["src/components/app/app-nav.tsx", "src/components/office/office-nav.tsx"]);
/** The film stage is a canvas recorded at two or more device pixels per CSS pixel (scripts/films/record.mjs), so its px sizes aren't screen sizes. */
const SIZE_EXEMPT_PREFIX = "src/components/films/stage/";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

const sources = ROOTS.flatMap(files)
  .map((full) => ({ rel: path.relative(process.cwd(), full).split(path.sep).join("/"), text: readFileSync(full, "utf8") }))
  .filter((f) => !EXEMPT.has(f.rel));

/** Each line that isn't a code comment, with its number. */
const lines = (text: string) => text.split(/\r?\n/).map((line, i) => ({ line, n: i + 1 })).filter(({ line }) => !/^\s*(\/\/|\*|\/\*)/.test(line));

describe("natural type", () => {
  it("has no code-comment labels in the interface", () => {
    const found = sources.flatMap((f) => lines(f.text).filter(({ line }) => /\{\s*["'`]\/\/ |>\s*\/\/ [A-Za-z0-9]/.test(line)).map(({ n }) => `${f.rel}:${n}`));
    expect(found).toEqual([]);
  });

  it("keeps type at 12px or more, with 11px only for tab labels and count badges", () => {
    const found = sources
      .filter((f) => !f.rel.startsWith(SIZE_EXEMPT_PREFIX))
      .flatMap((f) =>
      lines(f.text).flatMap(({ line, n }) =>
        [...line.matchAll(/text-\[(?:min\()?(\d*\.?\d+)(px|rem)\b/g)]
          .map((m) => (m[2] === "rem" ? Number(m[1]) * 16 : Number(m[1])))
          .filter((px) => px < 11 || (px < 12 && !ELEVEN_PX_ALLOWED.has(f.rel)))
          .map((px) => `${f.rel}:${n} (${px}px)`),
      ),
    );
    expect(found).toEqual([]);
  });

  it("uses at most one middot per line", () => {
    const found = sources.flatMap((f) => lines(f.text).filter(({ line }) => (line.match(/·/g) ?? []).length > 1).map(({ n }) => `${f.rel}:${n}`));
    expect(found).toEqual([]);
  });

  it("has no tracked-capital eyebrows", () => {
    const found = sources.flatMap((f) => lines(f.text).filter(({ line }) => /\buppercase\b[^"]*\btracking-\[|\btracking-\[[^"]*\buppercase\b/.test(line)).map(({ n }) => `${f.rel}:${n}`));
    expect(found).toEqual([]);
  });
});
