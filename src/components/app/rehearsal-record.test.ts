import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { summarizeRehearsal, type RehearsalRow } from "@/core/trust/rehearsal";
import { RehearsalRecord } from "./rehearsal-record";

const SINCE = "2026-10-20T09:00:00.000Z";
const row = (over: Partial<RehearsalRow>): RehearsalRow => ({
  proposalId: "p",
  taskId: "t1",
  createdAt: SINCE,
  status: "applied",
  evidence: "verified",
  shadow: { outcome: "ALLOW_WITHIN_LIMITS", reasons: [] },
  ...over,
});
const render = (rows: RehearsalRow[]) => renderToStaticMarkup(createElement(RehearsalRecord, { summary: summarizeRehearsal(rows), since: SINCE }));

describe("RehearsalRecord", () => {
  it("marks every decision as simulated", () => {
    expect(render([])).toContain("Simulated decisions");
    expect(render([])).toContain("No changes yet");
  });

  it("sets what level 2 would have done against what really happened", () => {
    const html = render([row({}), row({ status: "pending", evidence: null }), row({ shadow: { outcome: "REQUIRE_APPROVAL", reasons: ["escalated"] } })]);
    expect(html).toContain("none failed its checks and none was discarded");
    expect(html).toContain("passed their checks");
    expect(html).toContain("still waiting for review");
    expect(html).toContain("it needed an owner or admin");
  });

  it("labels a replay as predicted from past changes, and says what it assumed", () => {
    const html = renderToStaticMarkup(
      createElement(RehearsalRecord, { summary: summarizeRehearsal([row({})]), since: SINCE, replay: { assumption: "It assumes a test space was connected when each change was made, as one is now.", leftOut: 2 } }),
    );
    expect(html).toContain("Replay of the last 30 days");
    expect(html).toContain("Predicted from past changes");
    expect(html).toContain("assumes a test space was connected");
    expect(html).toContain("2 changes from the desktop agent are left out");
    expect(html).not.toContain("Rehearsing since");
  });

  it("leads with a failed check, and links to the change", () => {
    const html = render([row({}), row({ taskId: "t9", evidence: "failed" })]);
    expect(html).toContain("This setting would have paused itself");
    expect(html).toContain('href="/app/tasks/t9"');
    expect(html).toContain("See the change that failed");
  });
});
