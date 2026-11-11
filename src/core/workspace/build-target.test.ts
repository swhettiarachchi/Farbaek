import { describe, expect, it } from "vitest";
import { buildTargets } from "./build-target";

const p = (id: string, at: string, archivedAt: string | null = null) => ({ id, name: `Project ${id}`, createdAt: at, archivedAt });

describe("where a build from the build box goes (stage 176)", () => {
  it("makes a new project while the plan has room, and offers the projects there are", () => {
    const t = buildTargets([p("a", "2026-11-01T00:00:00Z"), p("b", "2026-11-05T00:00:00Z")], 5);
    expect(t.newProject).toBeNull();
    expect(t.projects.map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("says why a new project can't be made once the limit is reached, so the most recent project is used instead", () => {
    const t = buildTargets([p("a", "2026-11-01T00:00:00Z")], 1);
    expect(t.newProject).toBe("Your plan includes 1 project, and it's in use. Build in a project you have, archive one, or choose a bigger plan for a new one.");
    expect(t.projects).toEqual([{ id: "a", name: "Project a" }]);
    // Five projects kept from the trial on a one-project plan: all five can still take work.
    expect(buildTargets(["a", "b", "c", "d", "e"].map((id, i) => p(id, `2026-11-0${i + 1}T00:00:00Z`)), 1).projects).toHaveLength(5);
  });

  it("never offers an archived project, and counts only active ones against the limit", () => {
    const t = buildTargets([p("a", "2026-11-01T00:00:00Z", "2026-11-02T00:00:00Z"), p("b", "2026-11-03T00:00:00Z")], 2);
    expect(t.projects.map((x) => x.id)).toEqual(["b"]);
    expect(t.newProject).toBeNull();
  });

  it("has no limit on a plan without one, and nothing to offer in an empty workspace", () => {
    expect(buildTargets([], 1)).toEqual({ projects: [], newProject: null });
    expect(buildTargets([p("a", "2026-11-01T00:00:00Z")], null).newProject).toBeNull();
  });
});
