import { describe, expect, it } from "vitest";
import { WORKSPACE_LIMITS } from "@/config/workspace";
import { setupReport } from "@/core/agent/setup-report";
import { reviewSite } from "@/core/agent/site-review";
import { screenFile } from "@/core/workspace/files";
import { STARTERS, TEMPLATE_STARTERS, getStarter, runProfile } from "./index";
import { NEXTJS_DEPENDENCIES } from "./nextjs-app";

describe("starters", () => {
  it("pass the same file screening as any import", () => {
    for (const starter of STARTERS) {
      for (const f of starter.files) {
        const r = screenFile(f.path, f.content, new TextEncoder().encode(f.content).length, WORKSPACE_LIMITS.maxFileBytes);
        expect(r, `${starter.id}/${f.path}`).toMatchObject({ ok: true });
      }
      expect(new Set(starter.files.map((f) => f.path)).size).toBe(starter.files.length);
    }
  });

  it("pin every dependency exactly and run no install scripts", () => {
    const next = getStarter("nextjs-app")!;
    const pkg = JSON.parse(next.files.find((f) => f.path === "package.json")!.content) as { scripts: Record<string, string>; dependencies: Record<string, string>; devDependencies: Record<string, string> };
    for (const v of [...Object.values(pkg.dependencies), ...Object.values(pkg.devDependencies)]) expect(v).toMatch(/^\d+\.\d+\.\d+$/);
    expect(Object.keys(pkg.scripts)).toEqual(["dev", "build", "start"]);
    expect(pkg.dependencies).toEqual(NEXTJS_DEPENDENCIES.dependencies);
    const report = setupReport(next.files.map((f) => f.path), (p) => next.files.find((f) => f.path === p)?.content ?? null);
    expect(report.risks.filter((r) => /runs on install/.test(r))).toEqual([]);
    expect(next.run?.install).toContain("--ignore-scripts");
  });

  it("know how each one runs", () => {
    expect(runProfile(getStarter("static-website")!.files.map((f) => f.path))).toEqual({ kind: "static" });
    expect(runProfile(getStarter("nextjs-app")!.files.map((f) => f.path))).toMatchObject({ kind: "node", port: 3000 });
    expect(runProfile(["main.py"])).toEqual({ kind: "unknown" });
    expect(getStarter("nope")).toBeNull();
  });

  it("give the gallery templates that preview instantly, link only to their own pages and fetch nothing", () => {
    expect(TEMPLATE_STARTERS.map((t) => t.id)).toEqual(["landing-page", "saas-site", "portfolio", "local-business", "event-page", "blog", "online-store", "booking", "dashboard"]);
    for (const t of TEMPLATE_STARTERS) {
      const paths = new Set(t.files.map((f) => f.path));
      expect(runProfile([...paths]), t.id).toEqual({ kind: "static" });
      expect(t.examplePrompt, t.id).toBeTruthy();
      for (const f of t.files.filter((x) => x.path.endsWith(".html"))) {
        // Stylesheets, scripts and images come from the project itself, never another host.
        expect(f.content, `${t.id}/${f.path}`).not.toMatch(/<(?:link|script|img)[^>]+(?:href|src)="(?:https?:)?\/\//i);
        for (const [, href] of f.content.matchAll(/href="([^"#:?]+\.html)/g)) expect(paths.has(href!), `${t.id}/${f.path} links to ${href}`).toBe(true);
        // Sample content is labelled as sample where it's shown.
        expect(f.content.toLowerCase(), `${t.id}/${f.path}`).toContain("sample");
      }
    }
  });

  it("meet the Studio standard: a design plan, a clean site review, reduced motion and scripts that run", () => {
    for (const t of TEMPLATE_STARTERS) {
      const files = Object.fromEntries(t.files.map((f) => [f.path, f.content]));
      expect(files["DESIGN.md"], t.id).toMatch(/## Palette[\s\S]*## Type[\s\S]*## Layout[\s\S]*## Signature[\s\S]*## Motion/);
      expect(files["script.js"], t.id).toBeTruthy();
      expect(reviewSite(files).findings, t.id).toEqual([]);
      const css = t.files.filter((f) => f.path.endsWith(".css")).map((f) => f.content.replace(/\/\*[\s\S]*?\*\//g, "")).join("\n");
      expect(css, t.id).toContain("prefers-reduced-motion: reduce");
      // No CSS filters: on iOS 26 they paint a black square (ADR 0055). backdrop-filter is a different path and stays allowed.
      expect(css.replace(/backdrop-filters*:/g, ""), t.id).not.toMatch(/(^|[s;{])filters*:/);
      // Content hidden for an entrance waits for script.js to say it's running (the .js class), so a page without scripts, like a gallery thumbnail, shows everything.
      for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const s = selector!.trim();
        if (/^(from|to|\d+%)/.test(s) || !/opacity:\s*0[;\s]/.test(`${body};`) || /\binput\b/.test(s)) continue;
        expect(s, `${t.id}: ${s}`).toMatch(/^\.js\b/);
      }
      for (const f of t.files.filter((x) => x.path.endsWith(".js"))) expect(() => new Function(f.content), `${t.id}/${f.path}`).not.toThrow();
    }
  });

  it("give the plain starters the Studio standard's bones: a plan to write, and only placeholders left to fix", () => {
    for (const id of ["static-website", "nextjs-app"] as const) {
      const files = Object.fromEntries(getStarter(id)!.files.map((f) => [f.path, f.content]));
      expect(files["DESIGN.md"], id).toMatch(/isn't written yet[\s\S]*## Palette[\s\S]*## Type[\s\S]*## Layout[\s\S]*## Signature[\s\S]*## Motion/);
      const css = Object.entries(files).filter(([p]) => p.endsWith(".css")).map(([, c]) => c).join("\n");
      expect(css, id).toContain("prefers-reduced-motion");
      expect(css, id).toContain(":focus-visible");
    }
    const site = Object.fromEntries(getStarter("static-website")!.files.map((f) => [f.path, f.content]));
    // Everything a review checks is in place; what's left is the copy in brackets, which the build replaces.
    expect(reviewSite(site).findings.map((f) => f.message)).toEqual([expect.stringMatching(/^A placeholder is still in the copy/)]);
    expect(site["index.html"]).toContain('class="skip" href="#main"');
    expect(site["styles.css"]).toMatch(/\.js \.reveal \{\s*opacity: 0/);
    expect(() => new Function(site["script.js"]!)).not.toThrow();
    const next = Object.fromEntries(getStarter("nextjs-app")!.files.map((f) => [f.path, f.content]));
    expect(next["app/layout.tsx"]).toContain('href="#main"');
    expect(next["app/page.tsx"]).toContain('id="main"');
  });

  it("use plain copy with no em dashes", () => {
    for (const starter of STARTERS) for (const f of starter.files) expect(f.content, `${starter.id}/${f.path}`).not.toMatch(/[—–]/);
  });
});
