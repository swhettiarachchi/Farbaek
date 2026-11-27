import { describe, expect, it } from "vitest";
import { BUILD_START, buildStartPath, olderBuildStart, planPath, readSurface, runPath, workbenchPath } from "./build-surface";

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
    expect(workbenchPath("../admin")).toBe("/app/build");
    expect(workbenchPath("https://evil.example")).toBe("/app/build");
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

describe("where every build starts (stage 286, ADR 0294)", () => {
  it("is one page in the app", () => {
    expect(BUILD_START).toBe("/app/build");
    expect(buildStartPath()).toBe("/app/build");
    expect(buildStartPath({})).toBe("/app/build");
  });

  it("carries what an older address carried: a template, a kept prompt, a share", () => {
    expect(buildStartPath({ template: "blog" })).toBe("/app/build?template=blog");
    expect(buildStartPath({ resume: "1" })).toBe("/app/build?resume=1");
    expect(buildStartPath({ title: "A page", text: "Make this & that", url: "https://a.example/x?y=1" })).toBe(
      "/app/build?title=A+page&text=Make+this+%26+that&url=https%3A%2F%2Fa.example%2Fx%3Fy%3D1",
    );
    // A name given twice counts once.
    expect(buildStartPath({ template: ["blog", "shop"] })).toBe("/app/build?template=blog");
  });

  it("keeps only the names it knows, and never lets an address choose where it leads", () => {
    expect(buildStartPath({ next: "https://evil.example", redirect: "//evil.example", surface: "workbench", template: "blog" })).toBe("/app/build?template=blog");
    expect(buildStartPath({ template: "", text: undefined })).toBe("/app/build");
    for (const odd of ["https://evil.example", "//evil.example", "/admin", "../admin", "x#y", "a&next=/admin"]) {
      const path = buildStartPath({ template: odd, text: odd, url: odd });
      expect(path.startsWith("/app/build?"), odd).toBe(true);
      // Whatever was sent is a value, never part of the path or a second name.
      expect(new URL(path, "https://farbaek.example").pathname, odd).toBe("/app/build");
      expect([...new URLSearchParams(path.split("?")[1]).keys()].sort(), odd).toEqual(["template", "text", "url"]);
    }
    expect(buildStartPath(JSON.parse('{"__proto__":{"template":"x"}}'))).toBe("/app/build");
  });

  it("cuts a value that is too long to carry", () => {
    const path = buildStartPath({ text: "a".repeat(9_000) });
    expect(new URLSearchParams(path.split("?")[1]).get("text")).toHaveLength(4_000);
  });
});

describe("the two older ways into Build (stage 286, ADR 0294)", () => {
  const from = (address: string) => {
    const url = new URL(address, "https://farbaek.example");
    return olderBuildStart(url.pathname, url.searchParams);
  };

  it("lead to Build's start, with what the New build page's address carried", () => {
    expect(from("/app/new")).toBe("/app/build");
    expect(from("/app/workbench")).toBe("/app/build");
    expect(from("/app/new?template=blog")).toBe("/app/build?template=blog");
    expect(from("/app/new?resume=1")).toBe("/app/build?resume=1");
    expect(from("/app/new?title=A%20page&text=Make%20this%20%26%20that&url=https%3A%2F%2Fa.example%2Fx")).toBe("/app/build?title=A+page&text=Make+this+%26+that&url=https%3A%2F%2Fa.example%2Fx");
    // A name given twice counts once, the first.
    expect(from("/app/new?template=blog&template=shop")).toBe("/app/build?template=blog");
  });

  it("leave every other page alone: a plan's own page, a project's workspace, a run", () => {
    for (const path of ["/app/new/00000000-0000-4000-8000-00000000b007", "/app/workbench/00000000-0000-4000-8000-00000000a001", "/app/build", "/app/build/run-1", "/app", "/app/newer", "/app/workbenches", "/new", "/app/new/"]) {
      expect(from(path), path).toBeNull();
    }
  });

  it("never carry anything but the five names, and never lead anywhere else", () => {
    expect(from("/app/new?next=https%3A%2F%2Fevil.example&template=blog&surface=workbench")).toBe("/app/build?template=blog");
    expect(from("/app/workbench?task=x&template=blog")).toBe("/app/build");
    for (const odd of ["https://evil.example", "//evil.example", "/admin", "a&next=/admin", "x#y"]) {
      const path = from("/app/new?text=" + encodeURIComponent(odd))!;
      expect(new URL(path, "https://farbaek.example").origin + new URL(path, "https://farbaek.example").pathname, odd).toBe("https://farbaek.example/app/build");
      expect(new URLSearchParams(path.split("?")[1]).get("text"), odd).toBe(odd);
    }
  });
});
