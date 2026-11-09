/**
 * Enforces WCAG 2.2 AA contrast for the design tokens by parsing
 * src/styles/tokens.css. Text pairs need 4.5:1; UI graphics such as focus
 * rings, input borders and the Proof Thread need 3:1.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../src/styles/tokens.css", import.meta.url), "utf8");
const t: Record<string, string> = Object.fromEntries(
  [...css.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1]!, m[2]!.toLowerCase()]),
);

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const BACKGROUNDS = ["canvas", "canvas-2", "surface", "surface-raised", "surface-sunken"];
const TEXT = ["ink", "ink-2", "ink-3", "accent", "accent-strong", "accent-2", "verified", "approval", "caution", "failed", "info", "unverified", "simulated"];
const GRAPHICS = ["accent", "line-strong", "seal"];
const MEDIA_TEXT = ["media-ink", "media-ink-2", "media-ink-3", "media-accent", "media-cyan", "media-green", "media-caution", "media-red"];

describe("White Signal tokens", () => {
  it("is a single light theme with no gold accent", () => {
    expect(css).not.toMatch(/prefers-color-scheme/);
    expect(css).not.toMatch(/--gold/);
    expect(css).toMatch(/color-scheme:\s*light/);
  });

  it("defines every token the checks need", () => {
    for (const key of [...BACKGROUNDS, ...TEXT, ...GRAPHICS, ...MEDIA_TEXT, "media", "primary", "on-primary", "on-accent"]) {
      expect(t[key], key).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it.each(TEXT.flatMap((fg) => BACKGROUNDS.map((bg) => [fg, bg] as const)))("text %s on %s is at least 4.5:1", (fg, bg) => {
    expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(GRAPHICS.flatMap((fg) => BACKGROUNDS.map((bg) => [fg, bg] as const)))("graphic %s on %s is at least 3:1", (fg, bg) => {
    expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(3);
  });

  it.each(MEDIA_TEXT)("media text %s on the media panel is at least 4.5:1", (fg) => {
    expect(contrast(t[fg]!, t.media!)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps primary and accent buttons readable", () => {
    expect(contrast(t["on-primary"]!, t.primary!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t["on-accent"]!, t.accent!)).toBeGreaterThanOrEqual(4.5);
  });

  it("has no gold, amber or purple colour anywhere in the palette (ADR 0183)", () => {
    const hueSat = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;
      const d = max - min;
      if (d === 0) return { hue: 0, sat: 0 };
      const sat = d / (1 - Math.abs(2 * l - 1));
      const hue = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
      return { hue: (hue + 360) % 360, sat };
    };
    for (const [name, hex] of Object.entries(t)) {
      const { hue, sat } = hueSat(hex);
      if (sat < 0.3) continue;
      expect(hue >= 30 && hue <= 70, `${name} ${hex} reads as gold or amber`).toBe(false);
      expect(hue >= 255 && hue <= 320, `${name} ${hex} reads as purple`).toBe(false);
    }
  });

  it("gives the person's turn the brand's blue, and keeps caution for warnings", () => {
    expect(t.approval).toBe(t.accent);
    expect(t.caution).not.toBe(t.approval);
    expect(t.caution).not.toBe(t.failed);
  });
});
