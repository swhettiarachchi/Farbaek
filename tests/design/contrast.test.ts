/**
 * Enforces WCAG 2.2 AA contrast for the design tokens in both themes, by
 * parsing src/styles/tokens.css. Text pairs need 4.5:1; UI graphics such as
 * focus rings, input borders and the Proof Thread need 3:1.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../src/styles/tokens.css", import.meta.url), "utf8");

function tokens(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1]!, m[2]!.toLowerCase()]));
}

const darkStart = css.indexOf("@media (prefers-color-scheme: dark)");
const themes = {
  light: tokens(css.slice(0, darkStart)),
  dark: tokens(css.slice(darkStart)),
};

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

const BACKGROUNDS = ["canvas", "surface", "surface-sunken"];
const TEXT = ["ink", "ink-2", "ink-3", "gold-ink", "verified", "approval", "failed", "info", "unverified", "simulated"];
const GRAPHICS = ["gold", "line-strong", "seal"];

describe.each(Object.entries(themes))("%s theme tokens", (_name, t) => {
  it("defines every token the checks need", () => {
    for (const key of [...BACKGROUNDS, ...TEXT, ...GRAPHICS, "primary", "on-primary"]) expect(t[key], key).toMatch(/^#[0-9a-f]{6}$/);
  });

  it.each(TEXT.flatMap((fg) => BACKGROUNDS.map((bg) => [fg, bg] as const)))("text %s on %s is at least 4.5:1", (fg, bg) => {
    expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(GRAPHICS.flatMap((fg) => BACKGROUNDS.map((bg) => [fg, bg] as const)))("graphic %s on %s is at least 3:1", (fg, bg) => {
    expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(3);
  });

  it("keeps primary buttons readable", () => {
    expect(contrast(t["on-primary"]!, t.primary!)).toBeGreaterThanOrEqual(4.5);
  });
});
