import { describe, expect, it } from "vitest";
import { PRESENCE_LABELS, agentPresence, firstSentence, groupInbox, inboxLane, type ProposalState } from "./inbox";

describe("inboxLane", () => {
  it("puts a run waiting on an approval in Needs you, and live runs in Working", () => {
    expect(inboxLane("waiting", null)).toBe("needs_you");
    expect(inboxLane("starting", null)).toBe("working");
    expect(inboxLane("working", "pending")).toBe("working");
  });

  it("puts a finished run in Ready for review only while its change is pending", () => {
    expect(inboxLane("finished", "pending")).toBe("review");
    expect(inboxLane("finished", "blocked")).toBe("review");
    expect(inboxLane("finished", "applied")).toBe("done");
    expect(inboxLane("finished", "discarded")).toBe("done");
    expect(inboxLane("finished", null)).toBe("done");
    expect(inboxLane("failed", "pending")).toBe("done");
    expect(inboxLane("interrupted", null)).toBe("done");
  });
});

describe("groupInbox", () => {
  it("keeps the order within each lane and only the latest Done runs", () => {
    const runs = [
      { id: "a", status: "working" as const, proposalId: null },
      { id: "b", status: "finished" as const, proposalId: "p1" },
      { id: "c", status: "waiting" as const, proposalId: null },
      { id: "d", status: "finished" as const, proposalId: "p2" },
      { id: "e", status: "cancelled" as const, proposalId: null },
      { id: "f", status: "failed" as const, proposalId: null },
      { id: "g", status: "finished" as const, proposalId: "gone" },
    ];
    const proposals = new Map<string, ProposalState>([
      ["p1", "pending"],
      ["p2", "applied"],
    ]);
    const lanes = groupInbox(runs, proposals, 2);
    expect(lanes.needs_you.map((r) => r.id)).toEqual(["c"]);
    expect(lanes.working.map((r) => r.id)).toEqual(["a"]);
    expect(lanes.review.map((r) => r.id)).toEqual(["b"]);
    // A proposal that couldn't be read never counts as waiting for review.
    expect(lanes.done.map((r) => r.id)).toEqual(["d", "e"]);
  });
});

describe("agentPresence", () => {
  it("puts a run waiting for a person first, links the only live run, and is idle otherwise", () => {
    expect(agentPresence([])).toEqual({ state: "idle", count: 0, runId: null });
    expect(agentPresence([{ id: "a", status: "finished" }])).toEqual({ state: "idle", count: 0, runId: null });
    expect(agentPresence([{ id: "a", status: "working" }])).toEqual({ state: "working", count: 1, runId: "a" });
    expect(agentPresence([{ id: "a", status: "working" }, { id: "b", status: "starting" }])).toEqual({ state: "working", count: 2, runId: null });
    expect(agentPresence([{ id: "a", status: "working" }, { id: "b", status: "waiting" }])).toEqual({ state: "waiting", count: 2, runId: "b" });
    expect(PRESENCE_LABELS.working(2)).toBe("2 agents working");
  });
});

describe("firstSentence", () => {
  it("returns the first sentence, trimmed to a length", () => {
    expect(firstSentence("Added a section. Also styles.")).toBe("Added a section.");
    expect(firstSentence("  No full stop here  ")).toBe("No full stop here");
    expect(firstSentence("x".repeat(200), 20)).toBe(`${"x".repeat(19)}…`);
    expect(firstSentence("index.html now has a menu. Done.")).toBe("index.html now has a menu.");
    expect(firstSentence("")).toBeNull();
    expect(firstSentence(null)).toBeNull();
  });
});
