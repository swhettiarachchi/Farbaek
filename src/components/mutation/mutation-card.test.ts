import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { planMutants } from "@/core/realityloop/mutation";
import type { MutationRunView } from "@/server/mutation/store";

vi.mock("@/app/app/tasks/mutation-actions", () => ({ runMutationAction: async () => ({ status: "idle" }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
const { MutationCard } = await import("./mutation-card");

const planned = planMutants([{ path: "src/limits.ts", content: "export const ok = (n: number) => n > 0 && n <= max;\n", before: null }]);
const done: MutationRunView = {
  id: "m1",
  status: "done",
  command: "npx --no-install vitest related --run --bail=1 src/limits.ts",
  baselineMs: 4000,
  mutants: [
    { ...planned[0]!, result: "killed", durationMs: 3000, failingTest: "src/limits.test.ts > ok > rejects zero" },
    { ...planned[1]!, result: "survived", durationMs: 4000, failingTest: null },
    { ...planned[2]!, result: "not_viable", durationMs: 900, failingTest: null },
  ],
  caught: 1,
  survived: 1,
  judged: 2,
  computeMs: 71_000,
  reason: null,
  startedAt: "2026-10-30T10:00:00.000Z",
  finishedAt: "2026-10-30T10:02:00.000Z",
};
const render = (run: MutationRunView | null, disabledReason: string | null = null, list = planned) =>
  renderToStaticMarkup(createElement(MutationCard, { proposalId: "pr1", taskId: "t1", planned: list, run, disabledReason }));

describe("MutationCard (ADR 0136)", () => {
  it("shows the mistakes it would make, the cost as an estimate, and that no AI is used", () => {
    const html = render(null);
    expect(html).toContain("3 mistakes it would make");
    expect(html).toContain("src/limits.ts:1");
    expect(html).toContain("&gt;=</span> 0");
    expect(html).toContain("No AI is used");
    expect(html).toContain("Estimate");
    expect(html).toContain("Run a mutation trial");
  });

  it("leads with survivors, in words and icons, and says the score isn't overall quality", () => {
    const html = render(done);
    expect(html).toContain("The tests caught 1 of 2 mistakes. 1 survived: no test noticed it.");
    expect(html.indexOf("Survived")).toBeLessThan(html.indexOf("Caught by"));
    expect(html).toContain("Didn&#x27;t load");
    expect(html).toContain("1 min 11 s");
    expect(html).toContain("isn&#x27;t a measure of overall test quality");
    expect(html).toContain("Run it again");
  });

  it("explains a run that couldn't judge anything, and a change with nothing to mutate", () => {
    expect(render({ ...done, status: "failed", mutants: [], reason: "The tests fail without any mutant, so mutants couldn't be judged." })).toContain("fail without any mutant");
    expect(render(null, null, [])).toContain("adds no lines with a comparison");
    expect(render(null, "Viewers can't run mutation trials. Ask a member, admin or owner.")).toContain("disabled");
  });
});
