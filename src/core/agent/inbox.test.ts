import { describe, expect, it } from "vitest";
import { PRESENCE_LABELS, agentPresence, firstSentence, groupInbox, inboxLane, type ProposalState, laneSummary } from "./inbox";

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

describe("laneSummary", () => {
  const base = { status: "working" as const, steps: 0, outcome: null, finish: null };

  it("says what a run waits for, what it is doing, and how it ended", () => {
    expect(laneSummary("needs_you", { ...base, status: "waiting" }, null)).toBe("Waiting for you to approve a command before it carries on.");
    expect(laneSummary("working", base, null)).toBe("Getting ready.");
    expect(laneSummary("working", { ...base, steps: 7 }, null)).toBe("Working, step 7.");
    expect(laneSummary("done", { ...base, status: "failed", outcome: "The build broke. More detail." }, null)).toBe("The build broke.");
    expect(laneSummary("done", { ...base, status: "cancelled" }, null)).toBe("Cancelled");
    expect(laneSummary("done", { ...base, status: "finished", finish: { summary: "Added opening hours. And a map." } }, "applied")).toBe("Added opening hours.");
    expect(laneSummary("done", { ...base, status: "finished" }, "applied")).toBe("Applied to the project.");
  });

  it("says a change is ready for review in the run's own words, and says so when the plan's checks stopped it", () => {
    expect(laneSummary("review", { ...base, status: "finished", finish: { summary: "Added opening hours. And a map." } }, "pending")).toBe("Added opening hours.");
    expect(laneSummary("review", { ...base, status: "finished" }, "pending")).toBe("The change is ready for your review.");
    expect(laneSummary("review", { ...base, status: "finished", finish: { summary: "Added opening hours." } }, "blocked")).toBe("Its change was stopped by the plan's checks. Open it to see why.");
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
