import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// The kit is plain JavaScript served from public/; only its pure helpers run here (behaviour needs a browser).
// @ts-expect-error: a .js module without types.
import * as core from "../../public/kit/studio/v1/studio.js";
// @ts-expect-error: a .js module without types.
import * as pro from "../../public/kit/studio/v1/studio-pro.js";
import { agentSystemPrompt } from "@/agent-runtime/loop";
import { getPlan } from "@/core/billing/catalog";
import { resolveEffectivePlan } from "@/core/billing/trial";
import { CORE_NAMES, kitForPrompt, kitTierFor, LOOKS, PRO_LOOKS, PRO_NAMES, STUDIO_KIT_CSS, STUDIO_KIT_JS, STUDIO_KIT_PRO_CSS, STUDIO_KIT_PRO_JS } from "@/core/media/studio-kit";

const dir = path.join(process.cwd(), "public/kit/studio/v1");
const read = (f: string) => readFileSync(path.join(dir, f), "utf8");
const css = { core: read("studio.css"), pro: read("studio-pro.css") };
const js = { core: read("studio.js"), pro: read("studio-pro.js") };
const noComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");

/** The CSS outside every `@media (prefers-reduced-motion: no-preference) { … }` block. */
function outsideMotionBlocks(source: string): string {
  let out = "";
  let i = 0;
  const marker = "@media (prefers-reduced-motion: no-preference)";
  for (;;) {
    const at = source.indexOf(marker, i);
    if (at < 0) return out + source.slice(i);
    out += source.slice(i, at);
    let depth = 0;
    let j = source.indexOf("{", at);
    for (; j < source.length; j++) {
      if (source[j] === "{") depth++;
      else if (source[j] === "}" && --depth === 0) break;
    }
    i = j + 1;
  }
}

describe("Farbaek Studio kit v1 (ADR 0157)", () => {
  it("stays small enough for phones", () => {
    const kb = (f: string) => statSync(path.join(dir, f)).size / 1024;
    expect(kb("studio.css")).toBeLessThan(32);
    expect(kb("studio.js")).toBeLessThan(16);
    expect(kb("studio-pro.css")).toBeLessThan(24);
    expect(kb("studio-pro.js")).toBeLessThan(16);
  });

  it("uses no CSS filters, keeps every animation behind reduced motion, and never listens to scroll", () => {
    for (const [name, source] of Object.entries(css)) {
      const plain = noComments(source);
      // backdrop-filter is a different path and stays allowed (ADR 0055).
      expect(plain.replace(/backdrop-filter\s*:/g, ""), name).not.toMatch(/(?<![-\w])filter\s*:/);
      const outside = outsideMotionBlocks(plain);
      expect(outside, name).not.toMatch(/(?<![-\w])animation(?:-timeline)?\s*:/);
      expect(outside, name).not.toMatch(/scroll-behavior\s*:\s*smooth/);
      // Everything sits in one cascade layer, so a site's own CSS wins.
      expect(plain.trim(), name).toMatch(/^@layer farbaek-studio \{[\s\S]*\}$/);
    }
    for (const [name, source] of Object.entries(js)) expect(source, name).not.toMatch(/addEventListener\(\s*["']scroll["']/);
    expect(js.core).toContain("prefers-reduced-motion: reduce");
  });

  it("names in the agent's reference exist in the kit", () => {
    const has = (source: string, name: string) => {
      if (!name.startsWith("data-")) return new RegExp(`\\.${name}(?![\\w-])`).test(source) || source.includes(`"${name}"`);
      const camel = name.slice(5).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      return source.includes(name) || source.includes(`dataset.${camel}`);
    };
    for (const n of CORE_NAMES) expect(has(css.core + js.core, n), n).toBe(true);
    for (const n of PRO_NAMES) expect(has(css.pro + js.pro, n), n).toBe(true);
    for (const look of Object.keys(LOOKS)) expect(css.core).toContain(`[data-fs-look="${look}"]`);
    for (const look of Object.keys(PRO_LOOKS)) expect(css.pro).toContain(`[data-fs-look="${look}"]`);
  });

  it("counts numbers the way they were written", () => {
    expect(core.parseCount("1,250+")).toEqual({ prefix: "", value: 1250, decimals: 0, grouped: true, suffix: "+" });
    expect(core.parseCount("$4.8M")).toMatchObject({ prefix: "$", value: 4.8, decimals: 1, suffix: "M" });
    expect(core.parseCount("[Your figure]")).toBeNull();
    expect(core.parseCount("")).toBeNull();
    const p = core.parseCount("12,400 km");
    expect(core.formatCount(p, 0)).toBe("0 km");
    expect(core.formatCount(p, 1234.6)).toBe("1,235 km");
    expect(core.formatCount(p, 12400)).toBe("12,400 km");
    expect(core.formatCount(core.parseCount("98.5%"), 50)).toBe("50.0%");
    expect(core.easeOut(0)).toBe(0);
    expect(core.easeOut(1)).toBe(1);
    expect(core.splitWords("Fresh  bread daily")).toEqual(["Fresh", "  ", "bread", " ", "daily"]);
  });

  it("turns and pulls within limits", () => {
    expect(pro.frameAt(0, 12)).toBe(0);
    expect(pro.frameAt(1, 12)).toBe(11);
    expect(pro.frameAt(0.5, 12)).toBe(6);
    expect(pro.frameAt(Number.NaN, 12)).toBe(0);
    expect(pro.frameAt(0.5, 0)).toBe(0);
    expect(pro.magnet(0, 0)).toEqual({ x: 0, y: 0 });
    const far = pro.magnet(300, 400, 10);
    expect(Math.hypot(far.x, far.y)).toBeLessThanOrEqual(10);
  });
});

describe("the kit in the agent's prompt", () => {
  const at = new Date("2026-11-03T12:00:00Z");
  const free = resolveEffectivePlan({ state: "free" }, at);
  const lite = resolveEffectivePlan({ state: "active", paidPlanId: "lite" }, at);
  const max = resolveEffectivePlan({ state: "active", paidPlanId: "max" }, at);

  it("gives every paid plan Studio kit Pro and Free the core kit", () => {
    expect(kitTierFor(free)).toBe("core");
    expect(kitTierFor(null)).toBe("core");
    expect(kitTierFor(lite)).toBe("pro");
    expect(kitTierFor(max)).toBe("pro");
    expect(getPlan("free").features).not.toContain("studio_kit_pro");
    for (const id of ["lite", "maker", "starter", "plus", "pro", "studio", "max", "max_2x", "max_3x"] as const) expect(getPlan(id).features, id).toContain("studio_kit_pro");
  });

  it("tells Free about Pro without letting it use Pro, and keeps each tier's text fixed for caching", () => {
    const coreText = kitForPrompt("core");
    const proText = kitForPrompt("pro");
    for (const text of [coreText, proText]) {
      expect(text).toContain(STUDIO_KIT_CSS);
      expect(text).toContain(STUDIO_KIT_JS);
      expect(text).not.toMatch(/[—–]/);
    }
    expect(coreText).not.toContain(STUDIO_KIT_PRO_CSS);
    expect(coreText).toMatch(/is for paid plans/);
    expect(proText).toContain(STUDIO_KIT_PRO_CSS);
    expect(proText).toContain(STUDIO_KIT_PRO_JS);
    expect(coreText.length).toBeLessThan(7_000);
    expect(proText.length).toBeLessThan(11_000);
    expect(kitForPrompt("core")).toBe(coreText);
    const prompt = agentSystemPrompt("sandboxed_autopilot", "sandbox", [], "pro");
    expect(prompt).toContain(STUDIO_KIT_PRO_JS);
    expect(agentSystemPrompt("sandboxed_autopilot", "sandbox")).not.toContain(STUDIO_KIT_PRO_JS);
  });
});
