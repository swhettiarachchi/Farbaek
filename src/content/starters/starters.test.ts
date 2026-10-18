import { describe, expect, it } from "vitest";
import { WORKSPACE_LIMITS } from "@/config/workspace";
import { setupReport } from "@/core/agent/setup-report";
import { screenFile } from "@/core/workspace/files";
import { STARTERS, getStarter, runProfile } from "./index";
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

  it("use plain copy with no em dashes", () => {
    for (const starter of STARTERS) for (const f of starter.files) expect(f.content, `${starter.id}/${f.path}`).not.toMatch(/[—–]/);
  });
});
