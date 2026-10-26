import { describe, expect, it } from "vitest";
import { reserveUnits } from "../billing/rate-card";
import { CANARY_MAX_OUTPUT_TOKENS, compareRuns, estimateCanary, pricedModel, type CanarySide, type CanaryTaskReport } from "./model-canary";

const side = (over: Partial<CanarySide> = {}): CanarySide => ({
  model: "claude-sonnet-5-5",
  answeredBy: "claude-sonnet-5-5",
  ok: true,
  failure: null,
  files: ["src/a.ts"],
  violations: 0,
  outcome: "REQUIRE_APPROVAL",
  inputTokens: 10_000,
  outputTokens: 2_000,
  units: 400,
  ms: 20_000,
  ...over,
});
const task = (id: string, current: Partial<CanarySide>, candidate: Partial<CanarySide>): CanaryTaskReport => ({
  taskId: id,
  title: id,
  current: side(current),
  candidate: side({ model: "claude-opus-5-5", answeredBy: "claude-opus-5-5", ...candidate }),
});
const compare = (tasks: CanaryTaskReport[]) => compareRuns({ tier: "standard", current: "claude-sonnet-5-5", candidate: "claude-opus-5-5", tasks, startedAt: "a", finishedAt: "b" });

describe("the canary", () => {
  it("only switches to models Farbaek has a price for", () => {
    expect(pricedModel("claude-opus-5-5")).toBe("claude-opus-5-5");
    expect(pricedModel("claude-sonnet-5-6")).toBeNull();
    expect(pricedModel("claude-sonnet-5-5-20260901")).toBeNull();
  });

  it("estimates the most it could cost, both models, every task at full output", () => {
    const est = estimateCanary([10_000, 20_000], "claude-sonnet-5-5", "claude-opus-5-5");
    const expected = [10_000, 20_000].reduce((n, p) => n + reserveUnits("claude-sonnet-5-5", p, CANARY_MAX_OUTPUT_TOKENS) + reserveUnits("claude-opus-5-5", p, CANARY_MAX_OUTPUT_TOKENS), 0);
    expect(est.units).toBe(expected);
    expect(est.usd).toBeCloseTo(expected * 0.0001);
    // An unpriced candidate is priced as the most expensive model, so the estimate never runs low.
    expect(estimateCanary([10_000], "claude-sonnet-5-5", "claude-sonnet-9").units).toBe(estimateCanary([10_000], "claude-sonnet-5-5", "claude-fable-5-1").units);
  });

  it("says what differed, in sentences", () => {
    const r = compare([
      task("a", {}, { files: ["src/a.ts", "src/b.ts"], units: 900, ms: 10_000 }),
      task("b", {}, { ok: false, failure: "The model declined the request.", files: [] }),
      task("c", {}, { violations: 2, outcome: "BLOCK" }),
    ]);
    expect(r.totals.candidate.valid).toBe(2);
    expect(r.differences).toEqual([
      "The candidate gave a usable proposal for 2 of 3 tasks; the current model for 3.",
      "On 1 task, the candidate changed different files.",
      "The candidate's proposals broke the contract 2 times; the current model's 0.",
      "On 1 task, the policy decided differently about the candidate's proposal.",
      "The candidate cost 42% more at list price.",
      "The candidate took 17% less time.",
    ]);
  });

  it("says so when nothing worth noting differed", () => {
    expect(compare([task("a", {}, {})]).differences).toEqual([
      "No difference worth noting: the same usable proposals, files, contract checks and policy outcomes, at about the same cost and time.",
    ]);
  });
});
