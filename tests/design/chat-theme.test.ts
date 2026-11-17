/**
 * Farbaek Chat's dark theme (stage 199, ADR 0213): every text and control pair meets WCAG 2.2 AA, the "Match device" copy is the
 * same as Dark, and it stays one accent with no gold. Light stays the default and lives in tokens.css (contrast.test.ts).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.join(process.cwd(), "src/styles/chat-theme.css"), "utf8");

function block(selector: string): Record<string, string> {
  const at = css.indexOf(selector);
  expect(at, selector).toBeGreaterThanOrEqual(0);
  const body = css.slice(css.indexOf("{", at) + 1, css.indexOf("}", at));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1]!, m[2]!.toLowerCase()]));
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

const dark = block('.chat-root[data-chat-theme="dark"]');
const system = block('.chat-root[data-chat-theme="system"]');

describe("the chat's dark theme", () => {
  it("reads at AA: body text 4.5:1 on every surface", () => {
    for (const fg of ["ink", "ink-2", "ink-3"]) {
      for (const bg of ["canvas", "canvas-2", "surface", "surface-raised", "surface-sunken"]) {
        expect(contrast(dark[fg]!, dark[bg]!), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps the accent, buttons and states readable", () => {
    for (const bg of ["canvas", "surface", "surface-raised"]) {
      for (const fg of ["accent", "verified", "failed", "caution", "info"]) expect(contrast(dark[fg]!, dark[bg]!), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      // The spectrum at night (stage 202): the spaces' colours in Chat's sidebar and under an answer.
      for (const fg of ["spark-rose", "spark-aqua", "spark-leaf", "spark-ember"]) expect(contrast(dark[fg]!, dark[bg]!), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(dark["on-accent"]!, dark.accent!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dark["on-primary"]!, dark.primary!)).toBeGreaterThanOrEqual(4.5);
    // A control's edge: 3:1 against the surface it sits on.
    expect(contrast(dark["line-strong"]!, dark.surface!)).toBeGreaterThanOrEqual(3);
  });

  it("matches the device with exactly the same values", () => {
    expect(system).toEqual(dark);
  });

  it("stays one accent, with no gold", () => {
    expect(css).not.toMatch(/--gold/);
    expect(dark.approval).toBe(dark.accent);
  });
});
