/**
 * Icons say what a control does (ADR 0153). Sparkles, robots, magic wands and
 * brains are the stock picture of "AI" and read as generated UI; they also
 * say nothing about the action. Building uses the hammer, drafting the pen
 * nib, mapping the tree, an inbox the tray, steering the agent the wheel.
 * The native apps follow the same rule with SF Symbols.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full, ext);
    return ext.test(full) ? [full] : [];
  });
}

const read = (roots: string[], ext: RegExp) =>
  roots
    .map((r) => path.join(process.cwd(), r))
    .flatMap((r) => files(r, ext))
    .map((full) => ({ rel: path.relative(process.cwd(), full).split(path.sep).join("/"), text: readFileSync(full, "utf8") }));

const TROPE_ICONS = /\b(Sparkle|MagicWand|Robot|Brain|ShootingStar|Rocket\w*|Skull)Icon\b/;
const TROPE_SYMBOLS = /systemImage:\s*"(sparkles?|wand\.and\.(stars|rays)(\.inverse)?|brain(\.head\.profile)?)"|(\(\s*|return\s+)"(sparkles?|wand\.and\.stars|brain(\.head\.profile)?)"/;

const hits = (sources: { rel: string; text: string }[], re: RegExp) =>
  sources.flatMap((f) =>
    f.text
      .split(/\r?\n/)
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => !/^\s*(\/\/|\*|\/\*)/.test(line) && re.test(line))
      .map(({ n }) => `${f.rel}:${n}`),
  );

describe("plain icons", () => {
  it("uses no stock AI icons in the web interface", () => {
    expect(hits(read(["src/app", "src/components"], /\.tsx$/), TROPE_ICONS)).toEqual([]);
  });

  it("uses no stock AI symbols in the iPhone app", () => {
    expect(hits(read(["ios/Farbaek"], /\.swift$/), TROPE_SYMBOLS)).toEqual([]);
  });
});
