/**
 * Text is sized in rem, so Android's text size setting reaches it (ADR 0171). The film stages are
 * recorded canvases and the showcase mockups draw other people's sites, so their pixels stay.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..");
const SKIP = /components[\\/]films[\\/]stage[\\/]|components[\\/]showcase[\\/]mockups\.tsx$/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(name) && !name.includes(".test.") && !SKIP.test(p) ? [p] : [];
  });
}

describe("text follows the phone's text size", () => {
  it("has no text size in px", () => {
    const found = ["src/app", "src/components"]
      .flatMap((r) => files(path.join(ROOT, r)))
      .flatMap((f) =>
        readFileSync(f, "utf8")
          .split(/\r?\n/)
          .flatMap((line, i) => (/\b(text|leading)-\[\d+(\.\d+)?px\]/.test(line) ? [`${path.relative(ROOT, f)}:${i + 1}`] : [])),
      );
    expect(found).toEqual([]);
  });

  it("asks Chrome to scale the root, and sets no root size of its own", () => {
    expect(readFileSync(path.join(ROOT, "src/app/layout.tsx"), "utf8")).toContain('<meta name="text-scale" content="scale" />');
    const css = readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");
    const html = css.match(/\bhtml\s*\{[^}]*\}/)?.[0] ?? "";
    expect(html).not.toMatch(/font-size/);
  });
});
