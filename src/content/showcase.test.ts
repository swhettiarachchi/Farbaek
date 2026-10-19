import { describe, expect, it } from "vitest";
import { PROMPT_MAX, PROMPT_MIN } from "@/core/agent/prompt-start";
import { FARBAEK_SKILLS } from "./skills";
import { CAPABILITIES, SHOWCASE } from "./showcase";

describe("the homepage showroom", () => {
  it("has eight distinct concepts, one per category", () => {
    expect(SHOWCASE).toHaveLength(8);
    expect(new Set(SHOWCASE.map((c) => c.id)).size).toBe(8);
    expect(new Set(SHOWCASE.map((c) => c.category)).size).toBe(8);
    expect(new Set(SHOWCASE.map((c) => c.name)).size).toBe(8);
  });

  it("names only skills that exist, and prompts the build box accepts", () => {
    const labels = new Set(FARBAEK_SKILLS.map((s) => s.label));
    for (const c of SHOWCASE) {
      for (const s of c.skills) expect(labels.has(s), `${c.id}: ${s}`).toBe(true);
      expect(c.prompt.trim().length, c.id).toBeGreaterThanOrEqual(PROMPT_MIN);
      expect(c.prompt.length, c.id).toBeLessThanOrEqual(PROMPT_MAX);
    }
  });

  it("gives every concept a palette with exactly one accent, in hex", () => {
    for (const c of SHOWCASE) {
      expect(c.palette.length, c.id).toBeGreaterThanOrEqual(4);
      expect(c.palette.length, c.id).toBeLessThanOrEqual(6);
      expect(c.palette.filter((p) => p.role === "accent"), c.id).toHaveLength(1);
      expect(c.palette.filter((p) => p.role === "surface"), c.id).toHaveLength(1);
      expect(c.palette.filter((p) => p.role === "ink"), c.id).toHaveLength(1);
      for (const p of c.palette) expect(p.hex, `${c.id}: ${p.name}`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("only claims what exists", () => {
    // The skills line counts the built-in skills.
    expect(CAPABILITIES.find((c) => c.id === "skills")?.body).toContain(["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight"][FARBAEK_SKILLS.length]);
    // No image generator is connected (ADR 0030), so it isn't offered as working.
    expect(CAPABILITIES.find((c) => c.id === "images")?.status).toBe("not-yet");
    // Publishing and app previews depend on the site domain, so their status is worked out per deployment.
    expect(CAPABILITIES.find((c) => c.id === "publish")?.status).toBe("site-domain");
    expect(CAPABILITIES.find((c) => c.id === "preview")?.status).toBe("app-previews");
  });

  it("uses plain copy with no em dashes", () => {
    const text = JSON.stringify([SHOWCASE, CAPABILITIES]);
    expect(text).not.toMatch(/[—–]/);
  });
});
