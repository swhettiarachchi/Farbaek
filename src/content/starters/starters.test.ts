import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { WORKSPACE_LIMITS } from "@/config/workspace";
import { setupReport } from "@/core/agent/setup-report";
import { reviewSite } from "@/core/agent/site-review";
import { PHOTO_SUBJECTS } from "@/core/media/photos";
import { STUDIO_KIT_CSS, STUDIO_KIT_JS, STUDIO_KIT_PATTERN } from "@/core/media/studio-kit";
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
    expect(TEMPLATE_STARTERS.map((t) => t.id)).toEqual(["landing-page", "saas-site", "portfolio", "local-business", "luxury", "event-page", "blog", "online-store", "booking", "dashboard", "crm"]);
    for (const t of TEMPLATE_STARTERS) {
      const paths = new Set(t.files.map((f) => f.path));
      expect(runProfile([...paths]), t.id).toEqual({ kind: "static" });
      expect(t.examplePrompt, t.id).toBeTruthy();
      for (const f of t.files.filter((x) => x.path.endsWith(".html"))) {
        // Stylesheets, scripts and images come from the project itself or, for templates on the Studio kit (ADR 0158),
        // only from Farbaek's kit and library, Google Fonts and the sorted stand-in photos. Never another host.
        for (const [, url] of f.content.matchAll(/<(?:link|script|img)[^>]+(?:href|src)="((?:https?:)?\/\/[^"]+)"/gi)) {
          expect(url, `${t.id}/${f.path}`).toMatch(/^https:\/\/(?:www\.farbaek\.com\/(?:kit|media)\/|fonts\.googleapis\.com(?:\/|$)|fonts\.gstatic\.com|images\.unsplash\.com\/photo-|picsum\.photos\/id\/)/);
        }
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
      // Templates on the Studio kit (ADR 0158) meet every premium check; their sample photos are placeholder slots by design.
      // The others predate the checks (ADR 0157): no media slots or web fonts, and the app-style ones no 3D moment.
      // Until they're rebuilt a build from them is told to add these. Nothing else may be wrong.
      const onKit = STUDIO_KIT_PATTERN.test(files["index.html"] ?? "");
      const allowed = onKit ? /^\d+ media slots? (?:is|are) still a placeholder/ : /^(?:There's no 3D moment|There are no images or video|Only system fonts)/;
      expect(reviewSite(files).findings.filter((f) => !allowed.test(f.message)), t.id).toEqual([]);
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

  it("use only the sorted stand-in photos, and keep hidden items hidden", () => {
    const sorted = new Set(Object.values(PHOTO_SUBJECTS).flatMap((s) => s.ids.map(String)));
    for (const t of TEMPLATE_STARTERS) {
      const all = t.files.map((f) => f.content).join("\n");
      // A mistyped id is a broken image, so every Unsplash photo must be one that was looked at and sorted (ADR 0158).
      for (const [, unsplash, picsum] of all.matchAll(/images\.unsplash\.com\/photo-([0-9]+-[0-9a-f]+)|picsum\.photos\/id\/(\d+)/g)) {
        expect(sorted.has((unsplash ?? picsum)!), `${t.id}: ${unsplash ?? picsum}`).toBe(true);
      }
      // A filter that sets hidden needs a rule no display value can beat, or the items stay on screen.
      const scripts = t.files.filter((f) => f.path.endsWith(".js")).map((f) => f.content).join("\n");
      const css = t.files.filter((f) => f.path.endsWith(".css")).map((f) => f.content).join("\n");
      if (/\.hidden\s*=/.test(scripts)) expect(css, t.id).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
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
    // Everything a review checks is in place, the premium checks included (ADR 0157); what's left is the copy in
    // brackets and the stand-in media, which the build replaces.
    const left = reviewSite(site).findings.map((f) => f.message);
    expect(left).toHaveLength(2);
    expect(left).toEqual(expect.arrayContaining([expect.stringMatching(/^A placeholder is still in the copy/), expect.stringMatching(/media slots? (?:is|are) still a placeholder/)]));
    expect(site["index.html"]).toContain('class="fs-skip" href="#main"');
    expect(site["index.html"]).toContain(STUDIO_KIT_CSS);
    expect(site["index.html"]).toContain(STUDIO_KIT_JS);
    expect(site["index.html"]).toContain("data-farbaek-scene=");
    expect(() => new Function(site["script.js"]!)).not.toThrow();
    const next = Object.fromEntries(getStarter("nextjs-app")!.files.map((f) => [f.path, f.content]));
    expect(next["app/layout.tsx"]).toContain('href="#main"');
    expect(next["app/page.tsx"]).toContain('id="main"');
  });

  it("use plain copy with no em dashes", () => {
    for (const starter of STARTERS) for (const f of starter.files) expect(f.content, `${starter.id}/${f.path}`).not.toMatch(/[—–]/);
  });

  it("give the REST API starter no dependencies, and tests of its own that pass on Node (ADR 0140)", { timeout: 30_000 }, async () => {
    const api = getStarter("rest-api")!;
    const pkg = JSON.parse(api.files.find((f) => f.path === "package.json")!.content) as Record<string, unknown>;
    expect(pkg.dependencies).toBeUndefined();
    expect(pkg.devDependencies).toBeUndefined();
    expect(Object.keys(pkg.scripts as object)).toEqual(["dev", "start", "test"]);
    expect(runProfile(api.files.map((f) => f.path))).toMatchObject({ kind: "node", port: 3000 });
    const dir = await mkdtemp(path.join(os.tmpdir(), "farbaek-rest-api-"));
    try {
      for (const f of api.files) {
        await mkdir(path.dirname(path.join(dir, f.path)), { recursive: true });
        await writeFile(path.join(dir, f.path), f.content);
      }
      // The starter's own suite: it starts the server on a free port and calls every route.
      const out = execFileSync(process.execPath, ["--test"], { cwd: dir, encoding: "utf8", timeout: 25_000 });
      expect(out).toMatch(/# pass 5|ℹ pass 5/);
      expect(out).toMatch(/# fail 0|ℹ fail 0/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
