/**
 * Human-made, not generated (ADR 0180): the small things that give a generated
 * interface away, caught by a scan. Status is a word, with an icon only for
 * done and failed; no hourglasses, flasks or fingerprints; no drawn status
 * dots; mono only for data people copy, so never on a model's name; and no
 * counter that reads 0:00. What a scan can't judge is in the farbaek-human-made
 * skill, and in review.
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

const hits = (sources: { rel: string; text: string }[], re: RegExp, skip: (rel: string) => boolean = () => false) =>
  sources
    .filter((f) => !skip(f.rel))
    .flatMap((f) =>
      f.text
        .split(/\r?\n/)
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => !/^\s*(\/\/|\*|\/\*)/.test(line) && re.test(line))
        .map(({ n }) => `${f.rel}:${n}`),
    );

const web = read(["src/app", "src/components"], /\.tsx$/);
const desktop = read(["desktop/src/renderer"], /\.tsx$/);
const ios = read(["ios/Farbaek"], /\.swift$/);

/** Sample designs of other people's sites, drawn in container units: their chrome is theirs. */
const MOCKUPS = (rel: string) => rel === "src/components/showcase/mockups.tsx";

describe("human-made, not generated", () => {
  it("draws no hourglass, flask, test tube, fingerprint, circuit or lightning icon", () => {
    const re = /\b(Hourglass\w*|Flask|TestTube|Fingerprint|Circuitry|Lightning)Icon\b/;
    expect(hits([...web, ...desktop], re, MOCKUPS)).toEqual([]);
  });

  it("uses no hourglass symbol in the iPhone app", () => {
    expect(hits(ios, /"hourglass/)).toEqual([]);
  });

  it("draws no status dots: words, a spinner, a check or a warning instead", () => {
    // A tiny filled circle in a status colour, or a drawn bullet. The one exception is the unread marker, as in every mail app.
    // Any size up to 3. A dot that scales in inside a ring when chosen is a radio control, which is a real thing.
    const dot = /^(?!.*\bscale-0\b).*(?:(?:\bsize-(?:1\.5|2\.5|2|3)(?![.\d])|\bh-(?:1\.5|2\.5|2|3) w-(?:1\.5|2\.5|2|3)(?![.\d])).*\brounded-full\b.*\bbg-(?:accent|approval|verified|failed|info|unverified|simulated|ink-3|line-strong)\b|\bbefore:size-\d|\bbefore:rounded-full\b)/;
    expect(hits(web, dot, (rel) => MOCKUPS(rel) || rel === "src/app/app/help/page.tsx")).toEqual([]);
  });

  it("never sets a model's name in monospace", () => {
    expect(hits(web, /font-mono.*(?:\.model\b|\{model\})|(?:\.model\b|\{model\}).*font-mono/)).toEqual([]);
  });

  it("shows no counter with nothing to count", () => {
    expect(hits([...web, ...desktop], /[>"'`\s]0:00[<"'`\s]/, MOCKUPS)).toEqual([]);
  });
});
