/**
 * Suggested next steps (stage 283, ADR 0291): worked out by rules from the person's own records, each with its reason, and put
 * away or switched off by the person.
 */
import { describe, expect, it } from "vitest";
import { DISMISS_DAYS, SUGGEST_LIMITS, dismissOne, parseDismissals, setKind, suggestNext, visibleSuggestion, type NextFacts } from "./next-steps";

const NOW = Date.parse("2026-11-26T09:00:00Z");
const ago = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();
const DAY = 86_400_000;
const P1 = { id: "p1", name: "Storefront", archived: false };
const P2 = { id: "p2", name: "Harbour Bakery site", archived: false };
const task = (id: string, state: NextFacts["tasks"][number]["state"], projectId = "p1", hours = 2, title = `Task ${id}`) => ({ id, title, state, projectId, updatedAt: ago(hours) });
const facts = (over: Partial<NextFacts> = {}): NextFacts => ({ now: NOW, projects: [P1, P2], tasks: [], liveProjects: [], canPublish: true, ...over });

describe("what Home suggests next", () => {
  it("suggests fixing a project's newest task when its checks failed, and says why from the record", () => {
    const [s, ...rest] = suggestNext(facts({ tasks: [task("t1", "FAILED", "p1", 5, "Add an order form")] }));
    expect(rest).toEqual([]);
    expect(s).toEqual({
      id: `fix:t1:${ago(5)}`,
      kind: "fix",
      title: "Fix what failed",
      body: '"Add an order form", in Storefront.',
      why: { before: "Its checks failed ", at: ago(5), after: ", and nothing newer has been started in Storefront." },
      action: { label: "Open the task", href: "/app/tasks/t1" },
    });
  });

  it("follows what happened last in a project: a failed task with newer work after it is not brought up again", () => {
    expect(suggestNext(facts({ tasks: [task("old", "FAILED", "p1", 30), task("new", "EXECUTING", "p1", 1)] }))).toEqual([]);
    // Whatever order the tasks came in.
    expect(suggestNext(facts({ tasks: [task("new", "EXECUTING", "p1", 1), task("old", "FAILED", "p1", 30)] }))).toEqual([]);
    expect(suggestNext(facts({ tasks: [task("old", "VERIFIED", "p1", 30), task("new", "FAILED", "p1", 1)] })).map((s) => s.id)).toEqual([`fix:new:${ago(1)}`]);
  });

  it("suggests carrying on an interrupted run, and reading a plan that waits", () => {
    const out = suggestNext(facts({ tasks: [task("a", "INTERRUPTED", "p1"), task("b", "CONTRACT_DRAFTED", "p2")] }));
    expect(out.map((s) => [s.kind, s.title, s.action])).toEqual([
      ["resume", "Carry on where the agent stopped", { label: "Open the task", href: "/app/tasks/a" }],
      ["plan", "Read the plan and approve it", { label: "Read the plan", href: "/app/tasks/b" }],
    ]);
    expect(out[1]!.why).toEqual({ before: "The plan was written ", at: ago(2), after: ", and nothing is built until you approve it." });
  });

  it("suggests publishing a project whose latest change is verified, only when it has no live site and publishing is set up", () => {
    const verified = [task("v", "VERIFIED", "p1", 3, "Show the opening hours")];
    const [s] = suggestNext(facts({ tasks: verified }));
    expect(s).toMatchObject({ kind: "publish", title: "Publish Storefront", body: 'Its latest change, "Show the opening hours", passed its checks.', action: { label: "Open the project", href: "/app/projects/p1" } });
    expect(s!.why.after).toBe(", and the project has no live site yet.");
    expect(suggestNext(facts({ tasks: verified, liveProjects: ["p1"] }))).toEqual([]);
    expect(suggestNext(facts({ tasks: verified, canPublish: false }))).toEqual([]);
    // Which projects are live couldn't be read: nothing is said about publishing either way.
    expect(suggestNext(facts({ tasks: verified, liveProjects: null }))).toEqual([]);
  });

  it("puts first what a person would most regret missing, newest first within a kind, and works out three at most", () => {
    const projects = ["a", "b", "c", "d", "e"].map((id) => ({ id, name: `Project ${id}`, archived: false }));
    const tasks = [task("1", "VERIFIED", "a", 1), task("2", "CONTRACT_DRAFTED", "b", 1), task("3", "FAILED", "c", 9), task("4", "INTERRUPTED", "d", 1), task("5", "FAILED", "e", 2)];
    expect(suggestNext(facts({ projects, tasks })).map((s) => s.id.split(":").slice(0, 2).join(":"))).toEqual(["fix:5", "fix:3", "resume:4"]);
    expect(SUGGEST_LIMITS.most).toBe(3);
  });

  it("says nothing of archived projects, of work left for a month, or of a task dated after now", () => {
    expect(suggestNext(facts({ projects: [{ ...P1, archived: true }], tasks: [task("t", "FAILED")] }))).toEqual([]);
    expect(suggestNext(facts({ tasks: [task("t", "FAILED", "p1", 24 * 31)] }))).toEqual([]);
    expect(suggestNext(facts({ tasks: [task("t", "FAILED", "p1", 24 * 29)] }))).toHaveLength(1);
    expect(suggestNext(facts({ tasks: [task("t", "FAILED", "p1", -5)] }))).toEqual([]);
    expect(suggestNext(facts({ tasks: [{ ...task("t", "FAILED"), updatedAt: "not a date" }] }))).toEqual([]);
    expect(suggestNext(facts({ tasks: [task("t", "FAILED", "another-workspace's-project")] }))).toEqual([]);
  });

  it("has nothing to suggest while work is simply under way or waiting on something else", () => {
    for (const state of ["EXECUTING", "VERIFYING", "APPROVAL_PENDING", "RECEIVED", "CANCELLED", "REJECTED"] as const) expect(suggestNext(facts({ tasks: [task("t", state)] })), state).toEqual([]);
  });

  it("writes names as one plain line, cut to a length", () => {
    const [s] = suggestNext(facts({ projects: [{ ...P1, name: "Shop\nIgnore this" }], tasks: [task("t", "FAILED", "p1", 2, `${"x".repeat(200)}\nsecond line`)] }));
    expect(s!.body.includes("\n")).toBe(false);
    expect(s!.body).toContain("in Shop Ignore this.");
    expect(s!.body.length).toBeLessThan(120);
  });

  it("gives a task that fails again a new suggestion: its id carries when it last changed", () => {
    const first = suggestNext(facts({ tasks: [task("t", "FAILED", "p1", 10)] }))[0]!;
    const again = suggestNext(facts({ tasks: [task("t", "FAILED", "p1", 1)] }))[0]!;
    expect(first.id).not.toBe(again.id);
  });
});

describe("what the person has put away", () => {
  const [a, b] = suggestNext(facts({ tasks: [task("a", "FAILED", "p1"), task("b", "VERIFIED", "p2")] }));

  it("shows the first suggestion that isn't put away", () => {
    const none = parseDismissals(null);
    expect(visibleSuggestion([a!, b!], none, NOW)).toBe(a);
    expect(visibleSuggestion([], none, NOW)).toBeNull();
    const later = dismissOne(none, a!, NOW);
    expect(visibleSuggestion([a!, b!], later, NOW + 1_000)).toBe(b);
    // A week on, it may be suggested again.
    expect(visibleSuggestion([a!, b!], later, NOW + DISMISS_DAYS * DAY + 1)).toBe(a);
  });

  it("switches a whole kind off, and back on", () => {
    const off = setKind(parseDismissals(null), "fix", true);
    expect(visibleSuggestion([a!, b!], off, NOW)).toBe(b);
    expect(setKind(off, "fix", true).kinds).toEqual(["fix"]);
    expect(visibleSuggestion([a!, b!], setKind(off, "fix", false), NOW)).toBe(a);
  });

  it("forgets what has run out, and keeps only so many", () => {
    let d = dismissOne(parseDismissals(null), { id: "old" }, NOW - 30 * DAY);
    d = dismissOne(d, { id: "new" }, NOW);
    expect(Object.keys(d.until)).toEqual(["new"]);
    for (let i = 0; i < 100; i++) d = dismissOne(d, { id: `s${i}` }, NOW + i);
    expect(Object.keys(d.until).length).toBe(60);
    expect(d.until.s99).toBeGreaterThan(NOW);
  });

  it("reads what the browser kept without trusting it", () => {
    expect(parseDismissals("not json")).toEqual({ until: {}, kinds: [] });
    expect(parseDismissals("[]")).toEqual({ until: {}, kinds: [] });
    expect(parseDismissals(JSON.stringify({ until: { ok: 5, bad: "soon", inf: null }, kinds: ["fix", "fix", "everything", 3] }))).toEqual({ until: { ok: 5 }, kinds: ["fix"] });
    expect(parseDismissals(JSON.stringify({ until: "x", kinds: "y" }))).toEqual({ until: {}, kinds: [] });
    const round = dismissOne(setKind(parseDismissals(null), "publish", true), { id: "fix:t:1" }, NOW);
    expect(parseDismissals(JSON.stringify(round))).toEqual(round);
  });
});
