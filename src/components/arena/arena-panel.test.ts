import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ArenaRecord } from "@/server/arena/store";

vi.mock("@/app/app/tasks/arena-actions", () => ({ tryChangeAction: async () => ({ status: "idle" }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
const { ArenaPanel } = await import("./arena-panel");

const base: ArenaRecord = {
  id: "a1",
  proposalId: "pr1",
  status: "done",
  baseline: [
    { name: "npm test", exitCode: 0, durationMs: 4200, failure: null },
    { name: "npm run build", exitCode: 0, durationMs: 9100, failure: null },
  ],
  candidate: [
    { name: "npm test", exitCode: 1, durationMs: 3900, failure: null },
    { name: "npm run build", exitCode: 0, durationMs: 9000, failure: null },
  ],
  failure: null,
  startedBy: "u1",
  startedAt: "2026-10-25T10:00:00.000Z",
  finishedAt: "2026-10-25T10:03:00.000Z",
};
const render = (run: ArenaRecord | null, disabledReason: string | null = null) =>
  renderToStaticMarkup(createElement(ArenaPanel, { proposalId: "pr1", taskId: "t1", checks: ["npm test", "npm run build"], run, disabledReason }));

describe("ArenaPanel", () => {
  it("offers a trial, says nothing is applied, and labels the time as an estimate", () => {
    const html = render(null);
    expect(html).toContain("Nothing is applied");
    expect(html).toContain("never counts as verified");
    expect(html).toContain("Estimate");
    expect(html).toContain("Try it on a copy");
  });

  it("leads with a break, in words and icons, and labels the results as observed", () => {
    const html = render(base);
    expect(html).toContain("This change breaks a check that passes now.");
    expect(html).toContain("Breaks");
    expect(html).toContain("Still passes");
    expect(html).toContain("Observed");
    expect(html).toContain("Try it again");
  });

  it("says a running trial updates by itself, without offering another", () => {
    const html = render({ ...base, status: "running", baseline: null, candidate: null, finishedAt: null });
    expect(html).toContain("Trying it on a copy");
    expect(html).not.toContain("Try it again");
  });

  it("keeps the baseline and the reason when the change couldn't be tried", () => {
    const html = render({ ...base, status: "failed", candidate: null, failure: "src/cart.ts couldn't be written into the sandbox." });
    expect(html).toContain("couldn&#x27;t be written into the sandbox");
    expect(html).toContain("Didn&#x27;t run");
    expect(html).not.toContain("This change breaks");
  });

  it("shows why a trial can't start here", () => {
    expect(render(null, "Viewers can't try changes. Ask a member, admin or owner.")).toContain("Viewers can&#x27;t try changes");
  });
});
