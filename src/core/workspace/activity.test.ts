import { describe, expect, it } from "vitest";
import { ACTIVITY_CATEGORIES, CATEGORY_PREFIXES, activityCsv, activityHref, categoryOf, csvCell, describeActivity, type ActivityEvent } from "./activity";

const TASK = "22222222-2222-4222-8222-222222222222";
const event = (over: Partial<ActivityEvent>): ActivityEvent => ({ id: 1, action: "task.created", target: TASK, metadata: {}, actorId: "u1", occurredAt: "2026-10-30T10:00:00Z", ...over });

describe("activity sentences", () => {
  it("says who did what, with the name the event records", () => {
    expect(describeActivity(event({ metadata: { title: "Reject fractional quantities" } }), "You")).toEqual({
      category: "changes",
      text: "You created a task: Reject fractional quantities.",
      href: `/app/tasks/${TASK}`,
    });
    expect(describeActivity(event({ action: "agent.lease_set", target: "a1", metadata: { name: "Office PC", expires_at: "2027-01-28" } }), "An admin").text).toBe("An admin changed an agent's access: Office PC.");
    expect(describeActivity(event({ action: "farbaek.usage_added", target: null }), "Farbaek")).toMatchObject({ category: "farbaek", text: "Farbaek added AI usage.", href: null });
  });

  it("still shows an action it doesn't know, by its name", () => {
    expect(describeActivity(event({ action: "something.new", target: null }), "You")).toEqual({ category: null, text: "You recorded something.new.", href: null });
  });

  it("links only to pages that exist, for ids", () => {
    expect(activityHref({ action: "contract.approved", target: TASK })).toBe(`/app/tasks/${TASK}`);
    expect(activityHref({ action: "project.created", target: TASK })).toBe(`/app/projects/${TASK}`);
    expect(activityHref({ action: "workflow.finished", target: TASK })).toBe(`/app/workflows/${TASK}`);
    expect(activityHref({ action: "proposal.applied", target: TASK })).toBeNull();
    expect(activityHref({ action: "site.blocked", target: "site" })).toBeNull();
    expect(activityHref({ action: "task.created", target: "../admin" })).toBeNull();
  });

  it("puts every category's actions in that category, and no action in two", () => {
    for (const c of ACTIVITY_CATEGORIES) for (const p of CATEGORY_PREFIXES[c.id]) expect(categoryOf(`${p}x`)).toBe(c.id);
    const all = Object.values(CATEGORY_PREFIXES).flat();
    expect(new Set(all).size).toBe(all.length);
    expect(categoryOf("agents.paused")).toBe("agents");
    expect(categoryOf("agent.paired")).toBe("agents");
  });
});

describe("the CSV download", () => {
  it("keeps cells a spreadsheet would run as formulas as text", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe(`"'=HYPERLINK(""http://evil"")"`);
    for (const lead of ["+", "-", "@", "\t", "\r"]) expect(csvCell(`${lead}1`).startsWith(`"'`)).toBe(true);
    expect(csvCell("Office PC")).toBe('"Office PC"');
  });

  it("writes a header and one quoted row per event", () => {
    const csv = activityCsv([{ occurredAt: "2026-10-30T10:00:00Z", actor: "You", action: "agent.paired", target: null, text: "You paired an agent: =cmd.", metadata: { name: "=cmd" } }]);
    expect(csv).toBe('"occurred_at","actor","action","target","description","details"\r\n"2026-10-30T10:00:00Z","You","agent.paired","","You paired an agent: =cmd.","{""name"":""=cmd""}"\r\n');
  });
});
