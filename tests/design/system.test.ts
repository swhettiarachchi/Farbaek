import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The system holds (ADR 0184): fields come from one helper, sizes that have a name use it, and page titles come
 * from the four title styles. The film studio is drawn at fixed pixel sizes and mockups are other people's sites.
 */
function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) files(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

const EXEMPT = /[\\/](films[\\/]stage|showcase[\\/](mockups|art)|content[\\/]starters)[\\/]?/;
const sources = [...files(path.join(process.cwd(), "src/app")), ...files(path.join(process.cwd(), "src/components"))]
  .filter((f) => !EXEMPT.test(f))
  .map((f) => ({ rel: path.relative(process.cwd(), f).split(path.sep).join("/"), text: readFileSync(f, "utf8") }));

const hits = (re: RegExp) =>
  sources.flatMap((f) =>
    f.text
      .split(/\r?\n/)
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => re.test(line))
      .map(({ n }) => `${f.rel}:${n}`),
  );

describe("one system (ADR 0184)", () => {
  it("styles fields through inputClasses and textareaClasses, not local class strings", () => {
    expect(hits(/\bconst (?:field|input|fieldClass|inputClass)\s*=\s*["'`]/)).toEqual([]);
  });

  it("uses the named step for a size that has one", () => {
    // 13px is text-label, 15px text-body, 17px text-title-4; Tailwind names 12, 14, 16, 18, 20 and 24.
    expect(hits(/text-\[(?:0\.75|0\.8125|0\.875|0\.9375|1|1\.0625|1\.125|1\.25|1\.5)rem\]/)).toEqual([]);
  });

  it("gives every page title one of the four title styles, apart from the home and pricing heroes", () => {
    const HEROES = new Set(["src/app/(site)/pricing/page.tsx", "src/components/marketing/hero.tsx"]);
    const literal = hits(/<h1\b[^>]*\bclassName="/).filter((h) => !HEROES.has(h.slice(0, h.lastIndexOf(":"))));
    expect(literal).toEqual([]);
  });

  it("has no half-step sizes nobody would choose", () => {
    expect(hits(/text-\[(?:0\.78125|0\.84375|0\.90625|0\.96875)rem\]|text-\[\d+\.5px\]/)).toEqual([]);
  });
});
