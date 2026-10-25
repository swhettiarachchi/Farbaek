import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { WatchView } from "@/server/launch/watch-store";

vi.mock("@/app/app/projects/[projectId]/launch/watch-actions", () => ({ setOutcomeWatchAction: async () => ({ status: "idle" }) }));
const { OutcomeWatch } = await import("./outcome-watch");

const base: WatchView = { state: "ok", enabledBy: "u1", createdAt: "2026-10-25T08:00:00.000Z", breachedAt: null, lastCheckedAt: "2026-10-25T10:00:00.000Z", lastDetail: "Answering (200) in 120 ms.", history: [] };
const render = (watch: WatchView | null, reason: string | null = null) => renderToStaticMarkup(createElement(OutcomeWatch, { projectId: "p1", watch, disabledReason: reason }));

describe("OutcomeWatch", () => {
  it("offers to watch, and says what it checks and who hears", () => {
    const html = render(null);
    expect(html).toContain("Off");
    expect(html).toContain("Watch it every hour");
    expect(html).toContain("Two failed checks in a");
  });

  it("waits for the first check", () => {
    expect(render({ ...base, state: "unknown", lastCheckedAt: null })).toContain("Waiting for the first check");
  });

  it("sums up the last checks in words, oldest on the left", () => {
    const history = [
      { at: "2026-10-25T10:00:00.000Z", ok: true, detail: "Answering." },
      { at: "2026-10-25T09:00:00.000Z", ok: false, detail: "It answered 503." },
      { at: "2026-10-25T08:00:00.000Z", ok: true, detail: "Answering." },
    ];
    const html = render({ ...base, history });
    expect(html).toContain("Answering");
    expect(html).toContain("2 of the last 3 checks answered");
    expect(html).toContain("Stop watching");
    // The failed check is striped, not only red.
    expect(html).toContain("repeating-linear-gradient");
  });

  it("says since when it has needed a look", () => {
    expect(render({ ...base, state: "breached", breachedAt: "2026-10-25T09:00:00.000Z" })).toContain("Needs a look since");
  });

  it("shows why it can't be changed", () => {
    expect(render(null, "The demo workspace is read-only.")).toContain("The demo workspace is read-only.");
  });
});
