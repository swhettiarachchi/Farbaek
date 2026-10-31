import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { suggestFailureFutures } from "@/core/realityloop/failure-futures";
import type { FailureTrialView } from "@/server/failure-futures/store";

vi.mock("@/app/app/tasks/failure-actions", () => ({ tryFailureAction: async () => ({ status: "idle" }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
const { FailureFuturesCard } = await import("./failure-futures-card");

const futures = suggestFailureFutures([
  { path: "src/app/api/webhooks/route.ts", content: 'const sig = req.headers.get("webhook-signature");\nawait fetch(url);\n', before: null },
]);
const trial: FailureTrialView = {
  id: "f1",
  kind: "duplicate_delivery",
  evidence: futures[0]!.evidence,
  status: "reproduced",
  testPath: "src/app/api/webhooks/route.failure-duplicate-delivery.test.ts",
  test: "it('processes a duplicate once', () => {});\n",
  testSha256: "a".repeat(64),
  expects: "The second delivery is ignored.",
  command: "npx --no-install vitest run src/app/api/webhooks/route.failure-duplicate-delivery.test.ts",
  exitCode: 1,
  durationMs: 4200,
  output: "AssertionError: expected 2 to be 1",
  reason: "The test simulated the failure and the code didn't behave as expected.",
  model: "claude-sonnet-5-5",
  startedAt: "2026-10-30T10:00:00.000Z",
  finishedAt: "2026-10-30T10:02:00.000Z",
};
const render = (trials: FailureTrialView[], disabledReason: string | null = null, list = futures) =>
  renderToStaticMarkup(createElement(FailureFuturesCard, { proposalId: "pr1", taskId: "t1", futures: list, trials, disabledReason }));

describe("FailureFuturesCard (ADR 0135)", () => {
  it("shows each scenario as hypothetical with the line that suggested it, and the cost as an estimate", () => {
    const html = render([]);
    expect(html).toContain("The same webhook arrives twice");
    expect(html).toContain("Hypothetical");
    expect(html).toContain("src/app/api/webhooks/route.ts:1");
    expect(html).toContain("Try this failure");
    expect(html).toContain("Estimate");
    expect(html).toContain("Nothing is applied");
  });

  it("shows a trial's outcome in words, with the AI-written test, command, exit code and output", () => {
    const html = render([trial]);
    expect(html).toContain("Reproduced");
    expect(html).toContain("The test, written by AI");
    expect(html).toContain("processes a duplicate once");
    expect(html).toContain("npx --no-install vitest run");
    expect(html).toContain("AssertionError");
    expect(html).toContain("Try it again");
  });

  it("disables trials with the reason, and says plainly when the change suggests nothing", () => {
    const html = render([], "Viewers can't try failures. Ask a member, admin or owner.");
    expect(html).toContain("disabled");
    expect(html).toContain("Viewers can&#x27;t try failures");
    expect(render([], null, [])).toContain("adds no lines that suggest a failure");
  });
});

describe("a scenario from a past incident (ADR 0145)", () => {
  it("says which incident, how it is linked, and links to it", () => {
    const [first, ...rest] = futures;
    const exact = render([], null, [{ ...first!, incident: { number: 12, title: "Charged twice", exact: true } }, ...rest]);
    expect(exact).toContain("This happened before");
    expect(exact).toContain('href="/app/incidents/12"');
    expect(exact).toContain("incident #12");
    const loose = render([], null, [{ ...first!, incident: { number: 3, title: "Charged twice", exact: false } }]);
    expect(loose).toContain("opened within a day of a change");
    expect(render([])).not.toContain("incident #");
  });
});
