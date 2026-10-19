import { describe, expect, it } from "vitest";
import { WORKSPACE_LIMITS } from "@/config/workspace";
import { setupReport } from "@/core/agent/setup-report";
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
    expect(TEMPLATE_STARTERS.map((t) => t.id)).toEqual(["landing-page", "saas-site", "portfolio", "local-business", "event-page", "blog"]);
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

  it("use plain copy with no em dashes", () => {
    for (const starter of STARTERS) for (const f of starter.files) expect(f.content, `${starter.id}/${f.path}`).not.toMatch(/[—–]/);
  });
});
