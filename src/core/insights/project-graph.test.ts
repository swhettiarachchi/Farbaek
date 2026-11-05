import { describe, expect, it } from "vitest";
import { buildLanes, formatDuration, graphAnalytics, type ProjectGraphRecords } from "./project-graph";

const H = 3_600_000;
const T0 = Date.parse("2026-10-20T00:00:00Z");
const at = (hours: number) => new Date(T0 + hours * H).toISOString();
const D = (c: string) => c.repeat(64);

function records(over: Partial<ProjectGraphRecords> = {}): ProjectGraphRecords {
  return {
    projectId: "p1",
    tasks: [],
    contracts: [],
    proposals: [],
    proofpacks: [],
    fileChanges: [],
    deployments: [],
    launches: [],
    incidents: [],
    truncated: false,
    ...over,
  };
}

// A task that went all the way: approved, applied by a person, verified, live.
const shipped = records({
  tasks: [
    { id: "t1", title: "Add order export", state: "VERIFIED", createdAt: at(0) },
    { id: "t2", title: "Upgrade the SDK", state: "BLOCKED", createdAt: at(10) },
  ],
  contracts: [
    { taskId: "t1", version: 1, status: "draft", createdAt: at(1), approvedAt: null },
    { taskId: "t1", version: 2, status: "approved", createdAt: at(1.5), approvedAt: at(2) },
    { taskId: "t2", version: 1, status: "approved", createdAt: at(10.5), approvedAt: at(11) },
  ],
  proposals: [
    { id: "pr1", taskId: "t1", status: "discarded", outcome: "REQUIRE_APPROVAL", createdAt: at(3), decidedAt: at(3.5) },
    { id: "pr2", taskId: "t1", status: "applied", outcome: "REQUIRE_APPROVAL", createdAt: at(4), decidedAt: at(6) },
    { id: "pr3", taskId: "t2", status: "blocked", outcome: "BLOCK", createdAt: at(12), decidedAt: null },
  ],
  proofpacks: [
    { digest: D("a"), taskId: "t1", proposalId: "pr2", status: "unverified", createdAt: at(6), seq: 1 },
    { digest: D("b"), taskId: "t1", proposalId: "pr2", status: "verified", createdAt: at(7), seq: 2 },
  ],
  fileChanges: [
    { path: "src/export.ts", proposalId: "pr2" },
    { path: "src/routes.ts", proposalId: "pr2" },
  ],
  deployments: [
    { number: 3, createdAt: at(8), evidence: "verified", evidenceProofPack: D("b"), overrideReason: null, live: true },
    { number: 2, createdAt: at(5), evidence: "none", evidenceProofPack: null, overrideReason: "The first version, before any agent change.", live: false },
  ],
  launches: [{ id: "l1", status: "ready", authorizedAt: at(9), evidenceProofPack: D("b") }],
});

describe("buildLanes", () => {
  it("follows a task from the ask to what's live, linking each record", () => {
    const { lanes } = buildLanes(shipped);
    const t1 = lanes.find((l) => l.taskId === "t1")!;
    expect(t1.stages.map((s) => [s.key, s.state, s.label])).toEqual([
      ["intent", "reached", "Asked"],
      ["contract", "reached", "Approved"],
      ["change", "reached", "Applied"],
      ["proof", "reached", "Verified"],
      ["live", "reached", "Live"],
    ]);
    expect(t1.stages[2]).toMatchObject({ detail: "2 files. 2 tries in all", href: "/app/tasks/t1#change" });
    expect(t1.stages[3]!.href).toBe(`/app/proofpacks/${D("b")}`);
    expect(t1.stages[1]!.detail).toBe("Version 2");
    expect(t1.stages[4]).toMatchObject({ detail: "Version 3. Launched to Vercel", href: "/app/projects/p1/launch#version-3" });
  });

  it("puts the newest task first, and stops a blocked one at its change", () => {
    const { lanes } = buildLanes(shipped);
    expect(lanes.map((l) => l.taskId)).toEqual(["t2", "t1"]);
    expect(lanes[0]!.stages.map((s) => s.state)).toEqual(["reached", "reached", "stopped", "not_yet", "not_yet"]);
    expect(lanes[0]!.stages[2]).toMatchObject({ label: "Blocked", detail: "By the rules" });
  });

  it("lists versions that went out without verified evidence, with the reason", () => {
    expect(buildLanes(shipped).unverifiedReleases).toEqual([{ number: 2, createdAt: at(5), evidence: "none", reason: "The first version, before any agent change.", live: false }]);
  });

  it("shows failed checks, changes applied on their own, and linked incidents", () => {
    const { lanes } = buildLanes(
      records({
        tasks: [{ id: "t1", title: "Cart rounding", state: "FAILED", createdAt: at(0) }],
        proposals: [{ id: "pr1", taskId: "t1", status: "applied", outcome: "ALLOW_WITHIN_LIMITS", createdAt: at(1), decidedAt: at(1) }],
        proofpacks: [{ digest: D("c"), taskId: "t1", proposalId: "pr1", status: "failed", createdAt: at(2), seq: 1 }],
        incidents: [{ number: 4, title: "Checkout totals wrong", severity: "high", status: "open", proposalId: "pr1", openedAt: at(3) }],
      }),
    );
    expect(lanes[0]!.stages[2]).toMatchObject({ label: "Applied", detail: "On its own" });
    expect(lanes[0]!.stages[3]).toMatchObject({ state: "failed", label: "Failed", detail: "Checks failed" });
    expect(lanes[0]!.incidents).toEqual([{ number: 4, title: "Checkout totals wrong", severity: "high", status: "open" }]);
  });

  it("reads a task's state when no ProofPack exists, and stops a cancelled task at the ask", () => {
    const { lanes } = buildLanes(
      records({
        tasks: [
          { id: "t1", title: "Checking", state: "VERIFYING", createdAt: at(1) },
          { id: "t2", title: "Gone", state: "CANCELLED", createdAt: at(0) },
        ],
      }),
    );
    expect(lanes[0]!.stages[2]).toMatchObject({ state: "reached", label: "Applied", href: "/app/tasks/t1#change" });
    expect(lanes[0]!.stages[3]).toMatchObject({ state: "waiting", label: "Running", detail: "Checks running" });
    expect(lanes[1]!.stages[0]).toMatchObject({ state: "stopped", label: "Cancelled" });
    expect(lanes[1]!.stages.slice(1).every((s) => s.state === "not_yet")).toBe(true);
  });
});

describe("graphAnalytics", () => {
  it("measures from the ask, and counts outcomes, evidence and rework", () => {
    const a = graphAnalytics(shipped);
    expect(a.askToApplied).toEqual({ ms: 6 * H, count: 1 });
    expect(a.askToVerified).toEqual({ ms: 7 * H, count: 1 });
    expect(a.approvalWait).toEqual({ ms: 2 * H, count: 1 });
    expect(a.proof).toEqual({ verified: 1, partially_verified: 0, failed: 0, unverified: 0 });
    expect(a.outcomes).toEqual([
      { outcome: "REQUIRE_APPROVAL", count: 2 },
      { outcome: "BLOCK", count: 1 },
    ]);
    expect(a.releases).toEqual({ total: 2, verified: 1, override: 1 });
    expect(a.rework).toEqual({ tasks: 1, of: 2 });
    expect(a.hotFiles).toEqual([
      { path: "src/export.ts", changes: 1, failed: 0 },
      { path: "src/routes.ts", changes: 1, failed: 0 },
    ]);
  });

  it("counts a file's changes that ended in failed checks, and leaves autonomy out of the approval wait", () => {
    const a = graphAnalytics(
      records({
        tasks: [{ id: "t1", title: "x", state: "FAILED", createdAt: at(0) }],
        proposals: [
          { id: "pr1", taskId: "t1", status: "applied", outcome: "ALLOW_WITHIN_LIMITS", createdAt: at(1), decidedAt: at(1) },
          { id: "pr2", taskId: "t1", status: "applied", outcome: "REQUIRE_APPROVAL", createdAt: at(2), decidedAt: at(5) },
        ],
        proofpacks: [{ digest: D("d"), taskId: "t1", proposalId: "pr1", status: "partially_verified", createdAt: at(1.5), seq: 1 }],
        fileChanges: [
          { path: "src/cart.ts", proposalId: "pr1" },
          { path: "src/cart.ts", proposalId: "pr2" },
        ],
      }),
    );
    expect(a.hotFiles).toEqual([{ path: "src/cart.ts", changes: 2, failed: 1 }]);
    expect(a.approvalWait).toEqual({ ms: 3 * H, count: 1 });
  });

  it("says there's nothing to measure rather than showing zero", () => {
    const a = graphAnalytics(records());
    expect(a.askToApplied).toEqual({ ms: null, count: 0 });
    expect(a.outcomes).toEqual([]);
    expect(a.hotFiles).toEqual([]);
  });
});

describe("formatDuration", () => {
  it("rounds to minutes, hours or days", () => {
    expect(formatDuration(30_000)).toBe("1 min");
    expect(formatDuration(45 * 60_000)).toBe("45 min");
    expect(formatDuration(6 * H)).toBe("6 h");
    expect(formatDuration(72 * H)).toBe("3 days");
  });
});
