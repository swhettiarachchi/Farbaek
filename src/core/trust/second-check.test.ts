import { describe, expect, it } from "vitest";
import { resolveEffectivePlan } from "@/core/billing/trial";
import { INTENT_CONTRACT_SCHEMA, type IntentContract } from "@/core/realityloop/contract";
import { MAX_DIFF_CHARS, acceptSecondCheck, checkerModel, secondCheckRecommended, secondCheckRequest } from "./second-check";

const NOW = new Date("2026-10-30T12:00:00Z");
const contract: IntentContract = {
  schema: INTENT_CONTRACT_SCHEMA,
  version: 2,
  outcome: "Reject fractional quantities in the cart.",
  scope: { organizationId: "o1", projectId: "p1", resources: ["src/lib/cart.ts"] },
  allowedOperations: ["files.edit"],
  forbiddenOperations: ["files.delete"],
  protectedFields: [],
  protectedInvariants: [{ id: "inv-1", statement: "Prices never change." }],
  assumptions: [],
  openQuestions: [],
  acceptanceCriteria: [{ id: "ac-1", statement: "Adding 1.5 items is refused.", verification: "test" }],
  approvals: [],
  limits: {},
  requiredChecks: ["pnpm test"],
  recovery: "Restore cart.ts.",
};
const plan = { summary: "Validate quantity.", steps: ["Check integers"], risks: [], checks: ["pnpm test"] };

describe("what the second model reads", () => {
  it("sends the contract, the plan, the policy and each file's diff", () => {
    const { request, truncated } = secondCheckRequest(
      contract,
      {
        plan,
        policy: { outcome: "REQUIRE_APPROVAL", findings: [] },
        violations: [],
        changes: [
          { path: "src/lib/cart.ts", kind: "edit", baseRevision: 3, content: "export const add = (q: number) => {\n  if (!Number.isInteger(q)) throw new Error('whole');\n};\n", sha256: "a", reason: "Validate" },
          { path: "src/lib/cart.test.ts", kind: "create", baseRevision: 0, content: "test('x', () => {});\n", sha256: "b", reason: "Test" },
        ],
      },
      ["export const add = (q: number) => {\n};\n", ""],
    );
    expect(truncated).toEqual([]);
    expect(request.contract).toMatchObject({ outcome: contract.outcome, protectedInvariants: ["Prices never change."], acceptanceCriteria: ["Adding 1.5 items is refused."] });
    expect(request.changes[0]!.diff).toBe("@@ -2,0 +2,1 @@\n+  if (!Number.isInteger(q)) throw new Error('whole');");
    expect(request.changes[1]!.diff).toBe("@@ -1,0 +1,1 @@\n+test('x', () => {});");
  });

  it("sends a file too big for the budget as its path only, and says so", () => {
    const big = "x\n".repeat(MAX_DIFF_CHARS);
    const { request, truncated } = secondCheckRequest(
      contract,
      { plan, policy: null, violations: [], changes: [{ path: "big.txt", kind: "create", baseRevision: 0, content: big, sha256: "c", reason: "r" }] },
      [""],
    );
    expect(truncated).toEqual(["big.txt"]);
    expect(request.changes[0]!.diff).toBeNull();
  });

  it("keeps findings only on files that were sent", () => {
    const { request } = secondCheckRequest(contract, { plan, policy: null, violations: [], changes: [{ path: "a.ts", kind: "create", baseRevision: 0, content: "x\n", sha256: "d", reason: "r" }] }, [""]);
    const out = acceptSecondCheck(request, {
      verdict: "concerns",
      summary: "One risk.",
      findings: [
        { topic: "risk", severity: "concern", path: "a.ts", detail: "Real file." },
        { topic: "scope", severity: "serious", path: "/etc/passwd", detail: "Invented file." },
      ],
      uncertainty: "",
    });
    expect(out.findings.map((f) => f.path)).toEqual(["a.ts", null]);
  });
});

describe("who checks", () => {
  const pro = resolveEffectivePlan({ state: "active", paidPlanId: "pro" }, NOW);
  const free = resolveEffectivePlan({ state: "free" }, NOW);

  it("uses a different model from the one that wrote the change", () => {
    const usual = checkerModel(pro, "anthropic", null);
    expect(usual.independent).toBe(true);
    const other = checkerModel(pro, "anthropic", usual.model);
    expect(other.model).not.toBe(usual.model);
    expect(other.independent).toBe(true);
  });

  it("says so when the plan has only the model that wrote it", () => {
    const only = checkerModel(free, "anthropic", null).model;
    expect(checkerModel(free, "anthropic", only)).toEqual({ model: only, independent: false });
  });

  it("recommends a second look for changes sent to an owner or admin", () => {
    expect(secondCheckRecommended({ outcome: "ESCALATE", findings: [] })).toBe(true);
    expect(secondCheckRecommended({ outcome: "REQUIRE_APPROVAL", findings: [{ outcome: "ESCALATE" }] })).toBe(true);
    expect(secondCheckRecommended({ outcome: "REQUIRE_APPROVAL", findings: [{ outcome: "REQUIRE_APPROVAL" }] })).toBe(false);
    expect(secondCheckRecommended(null)).toBe(false);
  });
});
