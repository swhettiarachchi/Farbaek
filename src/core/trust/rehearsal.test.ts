import { describe, expect, it } from "vitest";
import { summarizeRehearsal, type RehearsalRow } from "./rehearsal";

let n = 0;
const row = (over: Partial<RehearsalRow> & { would?: boolean }): RehearsalRow => {
  n++;
  const { would = true, ...rest } = over;
  return {
    proposalId: `p${n}`,
    taskId: `t${n}`,
    createdAt: "2026-10-25T10:00:00.000Z",
    status: "applied",
    evidence: "verified",
    shadow: would ? { outcome: "ALLOW_WITHIN_LIMITS", reasons: [] } : { outcome: "REQUIRE_APPROVAL", reasons: ["not_verifiable"] },
    ...rest,
  };
};

describe("shadow mode's record", () => {
  it("has nothing to say before the first change", () => {
    expect(summarizeRehearsal([])).toMatchObject({ total: 0, verdict: "nothing_yet", example: null });
  });

  it("counts what level 2 would have done, and what really happened to those changes", () => {
    const s = summarizeRehearsal([
      row({}),
      row({ evidence: "partially_verified" }),
      row({ evidence: "unverified" }),
      row({ status: "pending", evidence: null }),
      row({ would: false }),
      row({ would: false, shadow: { outcome: "REQUIRE_APPROVAL", reasons: ["escalated"] } }),
      row({ would: false, shadow: { outcome: "REQUIRE_APPROVAL", reasons: ["not_verifiable", "too_many_files"] } }),
    ]);
    expect(s).toMatchObject({ total: 7, wouldApply: 4, wouldWait: 3, verdict: "held_up", example: null });
    expect(s.outcomes).toEqual({ verified: 1, partly: 1, failed: 0, unchecked: 1, discarded: 0, pending: 1 });
    expect(s.reasons).toEqual([
      { reason: "not_verifiable", count: 2 },
      { reason: "escalated", count: 1 },
      { reason: "too_many_files", count: 1 },
    ]);
  });

  it("says level 2 would have paused itself when a change it would have applied failed its checks", () => {
    const failed = row({ evidence: "failed" });
    const s = summarizeRehearsal([row({}), row({ status: "discarded", evidence: null }), failed]);
    expect(s.verdict).toBe("would_have_paused");
    expect(s.example).toEqual({ taskId: failed.taskId, kind: "failed" });
  });

  it("flags changes level 2 would have applied that a person discarded", () => {
    const discarded = row({ status: "discarded", evidence: null });
    const s = summarizeRehearsal([row({}), discarded]);
    expect(s).toMatchObject({ verdict: "people_disagreed", example: { taskId: discarded.taskId, kind: "discarded" } });
  });

  it("says so when no change would have applied on its own", () => {
    expect(summarizeRehearsal([row({ would: false }), row({ would: false })])).toMatchObject({ wouldApply: 0, verdict: "none_would_apply" });
  });

  it("never counts a failed check on a change that would have waited against level 2", () => {
    expect(summarizeRehearsal([row({ would: false, evidence: "failed" }), row({})]).verdict).toBe("held_up");
  });
});
