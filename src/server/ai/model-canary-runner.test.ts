import { describe, expect, it } from "vitest";
import type { ProposalOutput } from "@/core/realityloop/change-proposal";
import { CANARY_SUITE } from "@/content/canary-suite";
import { IntentContractSchema } from "@/core/realityloop/contract";
import type { CanaryReport } from "@/core/ai/model-canary";
import type { ChangeProposer, ProposalOutcome } from "./change-proposer";
import { briefFor, runCanary, type CanaryRunDeps } from "./model-canary-runner";

const task = CANARY_SUITE.find((t) => t.id === "code-fix")!;
const edit: ProposalOutput = {
  summary: "Reject fractions.",
  steps: ["Check integers"],
  risks: [],
  checks: ["pnpm test"],
  changes: [{ path: "src/lib/cart.ts", kind: "edit", edits: [{ find: "line.quantity < 1", replace: "line.quantity < 1 || !Number.isInteger(line.quantity)" }], content: "", reason: "r" }],
};

function deps(outcomes: Record<string, ProposalOutcome | Error>) {
  const finished: Parameters<CanaryRunDeps["finish"]>[0][] = [];
  const calls: string[] = [];
  let t = 0;
  const d: CanaryRunDeps = {
    proposer: (model): ChangeProposer => ({
      model,
      maxOutputTokens: 16_000,
      async propose() {
        calls.push(model);
        t += model === "claude-opus-5-5" ? 30_000 : 20_000;
        const o = outcomes[model]!;
        if (o instanceof Error) throw o;
        return o;
      },
    }),
    finish: async (i) => {
      finished.push(i);
    },
    now: () => new Date("2026-10-26T10:00:00Z"),
    clock: () => t,
  };
  return { d, finished, calls };
}

const ok = (model: string): ProposalOutcome => ({ ok: true, output: edit, usage: { model, inputTokens: 3_000, outputTokens: 800, cacheWriteTokens: 0, cacheReadTokens: 0 } });

describe("the canary suite", () => {
  it("holds valid contracts, and gives the model only each task's context files", () => {
    for (const t of CANARY_SUITE) {
      expect(IntentContractSchema.safeParse(t.contract).success, t.id).toBe(true);
      expect(t.context.every((p) => t.files.some((f) => f.path === p)), t.id).toBe(true);
    }
    expect(briefFor(task).files.map((f) => f.path)).toEqual(["src/lib/cart.ts", "src/lib/cart.test.ts"]);
  });
});

describe("runCanary", () => {
  it("runs each task on both models in turn, judges them the same way, and records the report with its hash", async () => {
    const { d, finished, calls } = deps({ "claude-sonnet-5-5": ok("claude-sonnet-5-5"), "claude-opus-5-5": ok("claude-opus-5-5") });
    expect(await runCanary(d, { id: "run-1", tier: "standard", current: "claude-sonnet-5-5", candidate: "claude-opus-5-5" }, [task])).toBe("finished");
    expect(calls).toEqual(["claude-sonnet-5-5", "claude-opus-5-5"]);
    const done = finished[0]!;
    expect(done).toMatchObject({ id: "run-1", status: "finished", sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    const report = (done as { report: CanaryReport }).report;
    expect(report.tasks[0]!.current).toMatchObject({ ok: true, files: ["src/lib/cart.ts"], violations: 0, outcome: "REQUIRE_APPROVAL", ms: 20_000 });
    expect(report.tasks[0]!.candidate).toMatchObject({ ok: true, files: ["src/lib/cart.ts"], ms: 30_000 });
    expect(report.differences.join(" ")).toMatch(/cost .*% more at list price/);
  });

  it("records a refusal or a broken call as that side's failure, not the canary's", async () => {
    const { d, finished } = deps({ "claude-sonnet-5-5": ok("claude-sonnet-5-5"), "claude-opus-5-5": { ok: false, failure: "REFUSED", usage: null } });
    await runCanary(d, { id: "run-2", tier: "standard", current: "claude-sonnet-5-5", candidate: "claude-opus-5-5" }, [task]);
    const report = (finished[0] as { report: CanaryReport }).report;
    expect(report.tasks[0]!.candidate).toMatchObject({ ok: false, failure: "The model declined the request.", units: 0 });
    expect(report.differences[0]).toBe("The candidate gave a usable proposal for 0 of 1 tasks; the current model for 1.");

    const thrown = deps({ "claude-sonnet-5-5": new Error("socket hang up"), "claude-opus-5-5": ok("claude-opus-5-5") });
    await runCanary(thrown.d, { id: "run-3", tier: "standard", current: "claude-sonnet-5-5", candidate: "claude-opus-5-5" }, [task]);
    expect((thrown.finished[0] as { report: CanaryReport }).report.tasks[0]!.current).toMatchObject({ ok: false, failure: "The call failed." });
  });

  it("records the run as failed when it can't finish", async () => {
    const { d, finished } = deps({ "claude-sonnet-5-5": ok("claude-sonnet-5-5"), "claude-opus-5-5": ok("claude-opus-5-5") });
    let first = true;
    const failing: CanaryRunDeps = {
      ...d,
      finish: async (i) => {
        if (first) {
          first = false;
          throw new Error("database unavailable");
        }
        finished.push(i);
      },
    };
    expect(await runCanary(failing, { id: "run-4", tier: "standard", current: "claude-sonnet-5-5", candidate: "claude-opus-5-5" }, [task])).toBe("failed");
    expect(finished[0]).toEqual({ id: "run-4", status: "failed", failure: "The canary stopped: database unavailable." });
  });
});
