import { describe, expect, it } from "vitest";
import { summarizeRehearsal } from "./rehearsal";
import { replayLimits, type ReplayChange } from "./replay";

let n = 0;
const change = (over: Partial<ReplayChange> = {}): ReplayChange => ({
  proposalId: `p${++n}`,
  taskId: `t${n}`,
  createdAt: "2026-10-20T10:00:00.000Z",
  status: "applied",
  files: [{ path: "src/a.ts", kind: "edit" }],
  violations: 0,
  fromAgent: false,
  hasChecks: true,
  evidence: "verified",
  ...over,
});

describe("counterfactual policy replay", () => {
  it("judges each past change as level 2 would have, with the limits being considered", async () => {
    const changes = [
      change(),
      change({ files: [{ path: "a.ts", kind: "edit" }, { path: "b.ts", kind: "edit" }, { path: "c.ts", kind: "edit" }] }),
      change({ files: [{ path: "package.json", kind: "edit" }] }),
      change({ violations: 1 }),
      change({ hasChecks: false }),
    ];
    const strict = await replayLimits(changes, { maxFiles: 2, allowCreates: false }, true, null);
    expect(strict.rows.map((r) => r.shadow.outcome)).toEqual(["ALLOW_WITHIN_LIMITS", "REQUIRE_APPROVAL", "REQUIRE_APPROVAL", "REQUIRE_APPROVAL", "REQUIRE_APPROVAL"]);
    expect(strict.rows.map((r) => r.shadow.reasons)).toEqual([[], ["too_many_files"], ["escalated"], ["blocked"], ["not_verifiable"]]);
    // A looser file limit lets the three-file change through.
    const loose = await replayLimits(changes, { maxFiles: 3, allowCreates: false }, true, null);
    expect(loose.rows[1]!.shadow.outcome).toBe("ALLOW_WITHIN_LIMITS");
  });

  it("says nothing could have been checked when no verified sandbox is connected", async () => {
    const r = await replayLimits([change()], { maxFiles: 3, allowCreates: false }, false, null);
    expect(r.rows[0]!.shadow.reasons).toEqual(["not_verifiable"]);
  });

  it("leaves the desktop agent's changes out, since level 2 never applies them", async () => {
    const r = await replayLimits([change({ fromAgent: true }), change()], { maxFiles: 3, allowCreates: false }, true, null);
    expect(r).toMatchObject({ leftOut: 1 });
    expect(r.rows).toHaveLength(1);
  });

  it("sets what level 2 would have done against what really happened", async () => {
    const r = await replayLimits([change({ evidence: "failed" }), change()], { maxFiles: 3, allowCreates: false }, true, null);
    expect(summarizeRehearsal(r.rows)).toMatchObject({ wouldApply: 2, verdict: "would_have_paused" });
  });
});
