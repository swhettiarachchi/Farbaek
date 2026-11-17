import { describe, expect, it } from "vitest";
import { planPath, readSurface, runPath, workbenchPath } from "./build-surface";

const P = "00000000-0000-4000-8000-00000000a001";
const T = "00000000-0000-4000-8000-00000000b007";
const R = "00000000-0000-4000-8000-00000000c001";

describe("where a build's steps return to", () => {
  it("reads only the one word it knows, and anything else is the ordinary pages", () => {
    expect(readSurface("workbench")).toBe("workbench");
    for (const v of ["page", "", null, undefined, "Workbench", "/app/admin", "https://evil.example", 7, {}]) expect(readSurface(v)).toBe("page");
  });

  it("keeps the ordinary pages exactly as they were", () => {
    expect(planPath("page", { projectId: P, taskId: T })).toBe(`/app/new/${T}`);
    expect(runPath("page", { projectId: P, taskId: T, runId: R })).toBe(`/app/build/${R}`);
  });

  it("returns to the workspace, at the task, from the workspace", () => {
    expect(planPath("workbench", { projectId: P, taskId: T })).toBe(`/app/workbench/${P}?task=${T}`);
    expect(runPath("workbench", { projectId: P, taskId: T, runId: R })).toBe(`/app/workbench/${P}?task=${T}`);
  });

  it("never builds an address from something that isn't an id", () => {
    expect(workbenchPath("../admin")).toBe("/app/workbench");
    expect(workbenchPath("https://evil.example")).toBe("/app/workbench");
    expect(workbenchPath(P, "x&next=//evil.example")).toBe(`/app/workbench/${P}`);
    expect(workbenchPath(P, null)).toBe(`/app/workbench/${P}`);
  });

  it("always stays inside the app", () => {
    for (const s of ["page", "workbench"] as const) {
      expect(planPath(s, { projectId: P, taskId: T }).startsWith("/app/")).toBe(true);
      expect(runPath(s, { projectId: P, taskId: T, runId: R }).startsWith("/app/")).toBe(true);
    }
  });
});
