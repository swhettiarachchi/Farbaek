/**
 * Farbaek's dark look (stage 211, ADR 0227): every text and control pair meets WCAG 2.2 AA, every colour has a night
 * value, "Match device" is exactly Dark, and it stays one accent with no gold. Light stays the default and lives in
 * tokens.css (contrast.test.ts).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PAGE_COLOR } from "@/core/theme/theme";

const css = readFileSync(path.join(process.cwd(), "src/styles/theme-dark.css"), "utf8");
const lightCss = readFileSync(path.join(process.cwd(), "src/styles/tokens.css"), "utf8");

const HEX = /--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi;
const tokens = (text: string): Record<string, string> => Object.fromEntries([...text.matchAll(HEX)].map((m) => [m[1]!, m[2]!.toLowerCase()]));
const declarations = (text: string): Record<string, string> => Object.fromEntries([...text.matchAll(/(--[\w-]+|color-scheme):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));

/** The declarations of the rule that starts at `selector`, up to its closing brace. */
function body(selector: string): string {
  const at = css.indexOf(selector);
  expect(at, selector).toBeGreaterThanOrEqual(0);
  const open = css.indexOf("{", at);
  return css.slice(open + 1, css.indexOf("}", open));
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

const darkBody = body(':root[data-page-theme="dark"]');
const systemBody = body(':root[data-page-theme="system"]');
const dark = tokens(darkBody);
const light = tokens(lightCss);

const BACKGROUNDS = ["canvas", "canvas-2", "surface", "surface-raised", "surface-sunken"];
const TEXT = ["ink", "ink-2", "ink-3", "accent", "accent-strong", "accent-2", "verified", "approval", "caution", "failed", "info", "unverified", "simulated", "spark-rose", "spark-aqua", "spark-leaf", "spark-ember"];
const GRAPHICS = ["accent", "line-strong", "seal"];

describe("the dark look", () => {
  it("turns a whole page, a page marked by the server, and a piece by itself", () => {
    const head = css.slice(css.indexOf(':root[data-page-theme="dark"]'), css.indexOf("{", css.indexOf(':root[data-page-theme="dark"]')));
    expect(head).toContain(':root[data-page-theme="dark"]');
    expect(head).toContain(':root:has([data-page-theme="dark"])');
    expect(head).toContain('[data-theme="dark"]');
  });

  it("follows the device only when the person chose that", () => {
    const media = css.indexOf("@media (prefers-color-scheme: dark)");
    expect(media).toBeGreaterThan(0);
    // Nothing follows the device by itself: only pages that carry the "system" choice.
    const inMedia = css.slice(media);
    expect(inMedia).toContain(':root[data-page-theme="system"]');
    expect(inMedia).toContain(':root:has([data-page-theme="system"])');
    expect(inMedia).not.toMatch(/^\s*:root\s*\{/m);
  });

  it("matches the device with exactly the same values", () => {
    expect(declarations(systemBody)).toEqual(declarations(darkBody));
    expect(declarations(darkBody)["color-scheme"]).toBe("dark");
  });

  it("gives every colour a night value, except the media frames, which are dark in both looks", () => {
    const missing = Object.keys(light).filter((name) => !name.startsWith("media") && !(name in dark));
    expect(missing).toEqual([]);
    expect(Object.keys(dark).filter((name) => name.startsWith("media"))).toEqual([]);
  });

  it.each(TEXT.flatMap((fg) => BACKGROUNDS.map((bg) => [fg, bg] as const)))("text %s on %s is at least 4.5:1", (fg, bg) => {
    expect(contrast(dark[fg]!, dark[bg]!)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(GRAPHICS.flatMap((fg) => BACKGROUNDS.map((bg) => [fg, bg] as const)))("graphic %s on %s is at least 3:1", (fg, bg) => {
    expect(contrast(dark[fg]!, dark[bg]!)).toBeGreaterThanOrEqual(3);
  });

  it("keeps primary and accent buttons readable", () => {
    expect(contrast(dark["on-primary"]!, dark.primary!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dark["on-accent"]!, dark.accent!)).toBeGreaterThanOrEqual(4.5);
  });

  it("is a second design, not black: surfaces get lighter as they rise", () => {
    expect(dark.canvas).not.toBe("#000000");
    expect(luminance(dark.surface!)).toBeGreaterThan(luminance(dark.canvas!));
    expect(luminance(dark["surface-raised"]!)).toBeGreaterThan(luminance(dark.surface!));
    expect(luminance(dark["surface-sunken"]!)).toBeLessThan(luminance(dark.canvas!));
    expect(dark.ink).not.toBe("#ffffff");
  });

  it("keeps the media frames readable beside a dark page", () => {
    // The frames are darker than the night page, so they still read as frames.
    expect(luminance(light.media!)).toBeLessThan(luminance(dark.canvas!));
  });

  it("stays one accent, with no gold, amber or purple", () => {
    expect(css).not.toMatch(/--gold/);
    expect(dark.approval).toBe(dark.accent);
    for (const [name, hex] of Object.entries(dark)) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const d = max - min;
      const l = (max + min) / 2;
      if (d === 0) continue;
      const sat = d / (1 - Math.abs(2 * l - 1));
      if (sat < 0.3) continue;
      const hue = ((max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4)) + 360) % 360;
      expect(hue >= 30 && hue <= 70, `${name} ${hex} reads as gold or amber`).toBe(false);
      expect(hue >= 255 && hue <= 320, `${name} ${hex} reads as purple`).toBe(false);
    }
  });

  it("gives the logo its paper at night, and none by day", () => {
    expect(dark["logo-paper"]).toBe("#fefefe");
    expect(lightCss).toMatch(/--logo-paper:\s*transparent/);
  });

  it("tells the browser the same page colours the tokens use", () => {
    expect(PAGE_COLOR.dark).toBe(dark.canvas);
    expect(PAGE_COLOR.light).toBe(light.canvas);
  });
});
