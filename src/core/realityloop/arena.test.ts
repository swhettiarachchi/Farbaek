import { describe, expect, it } from "vitest";
import { compareArena, touchesDependencies, type ArenaCheck } from "./arena";

const check = (name: string, exitCode: number | null): ArenaCheck => ({ name, exitCode, durationMs: exitCode === null ? null : 1200, failure: exitCode === null ? "control_plane_interrupted" : null });

describe("the Future-State Arena", () => {
  it("leads with a check the change breaks", () => {
    const r = compareArena([check("npm test", 0), check("npm run build", 1)], [check("npm test", 1), check("npm run build", 0)]);
    expect(r.rows.map((x) => x.change)).toEqual(["breaks", "fixes"]);
    expect(r.verdict).toBe("breaks_checks");
  });

  it("says when a change keeps every check passing", () => {
    expect(compareArena([check("a", 0), check("b", 0)], [check("a", 0), check("b", 0)]).verdict).toBe("keeps_passing");
  });

  it("credits a fix only when nothing else still fails", () => {
    expect(compareArena([check("a", 1)], [check("a", 0)]).verdict).toBe("fixes_checks");
    expect(compareArena([check("a", 1), check("b", 1)], [check("a", 0), check("b", 2)]).verdict).toBe("still_failing");
  });

  it("calls a run incomplete when a check didn't run on either side, and never guesses its result", () => {
    const r = compareArena([check("a", 0), check("b", null)], [check("a", 0), check("b", 0)]);
    expect(r.rows[1]).toEqual({ name: "b", before: "not_run", after: "passed", change: "not_run" });
    expect(r.verdict).toBe("incomplete");
    expect(compareArena([], []).verdict).toBe("incomplete");
    // A missing result on one side counts as not run.
    expect(compareArena([check("a", 0)], []).rows[0]).toMatchObject({ after: "not_run", change: "not_run" });
  });

  it("knows when packages must be installed again for the change", () => {
    expect(touchesDependencies(["src/app.ts", "package.json"])).toBe(true);
    expect(touchesDependencies(["web/pnpm-lock.yaml"])).toBe(true);
    expect(touchesDependencies(["src/package.json.md", "README.md"])).toBe(false);
  });
});
