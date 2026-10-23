/**
 * No CSS filters in the interface (ADR 0055). On iOS 26 Safari, a filter on
 * an element below the fold paints a black square at the top left of the
 * screen (WebKit bug 314999); the homepage aurora's blur(28px) did exactly
 * that under the header. Soft light is drawn with gradients that fade out
 * inside their own box instead, which is cheaper on phones too.
 *
 * backdrop-filter is a different path in WebKit and stays allowed. The film
 * stage is exempt: it's only rendered in headless Chrome to record the films.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = ["src/app", "src/components"].map((r) => path.join(process.cwd(), r));
const EXEMPT_PREFIX = "src/components/films/stage/";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.(tsx|css)$/.test(full) ? [full] : [];
  });
}

const sources = ROOTS.flatMap(files)
  .map((full) => ({ rel: path.relative(process.cwd(), full).split(path.sep).join("/"), text: readFileSync(full, "utf8") }))
  .filter((f) => !f.rel.startsWith(EXEMPT_PREFIX));

/** Each line that isn't a comment, with its number. */
const lines = (text: string) => text.split(/\r?\n/).map((line, i) => ({ line, n: i + 1 })).filter(({ line }) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(line));

const RULES: [string, RegExp][] = [
  ["a CSS filter property", /(?<![\w-])filter\s*:\s*(?!none)/],
  ["a Tailwind filter utility", /(?<=^|[\s"'`:])(blur|drop-shadow|brightness|grayscale|hue-rotate|invert|saturate|sepia)-[^\s"'`]+|(?<=[\s:])blur(?=[\s"'`])/],
  ["an arbitrary filter property", /\[filter:/],
];

describe("no CSS filters", () => {
  it("draws soft light with gradients, not filters", () => {
    const found = sources.flatMap((f) =>
      lines(f.text).flatMap(({ line, n }) => RULES.filter(([, re]) => re.test(line)).map(([what]) => `${f.rel}:${n} (${what})`)),
    );
    expect(found).toEqual([]);
  });
});
