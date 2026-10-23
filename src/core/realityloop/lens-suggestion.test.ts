import { describe, expect, it } from "vitest";
import { INTENT_CONTRACT_SCHEMA, type IntentContract } from "./contract";
import { lensForChange } from "./intent-lens";
import { acceptSuggestion, hunkId, lensRequest, MAX_SUGGESTION_HUNKS, withSuggestion } from "./lens-suggestion";

const contract: IntentContract = {
  schema: INTENT_CONTRACT_SCHEMA,
  version: 2,
  outcome: "Shoppers can't put fractional quantities in the cart.",
  scope: { organizationId: "o1", projectId: "p1", resources: ["src/lib"] },
  allowedOperations: ["files.edit"],
  forbiddenOperations: [],
  protectedFields: [],
  protectedInvariants: [],
  assumptions: [],
  openQuestions: [],
  acceptanceCriteria: [{ id: "ac-1", statement: "Adding 1.5 of an item is rejected with a clear message.", verification: "test" }],
  approvals: [],
  limits: {},
  requiredChecks: ["pnpm test"],
  recovery: "Restore the previous revision.",
};

const CART = "export function addToCart(lines, product, quantity = 1) {\n  return [...lines, { product, quantity }];\n}\n";
const guarded = CART.replace("{\n", "{\n  if (!Number.isInteger(quantity)) throw new Error(\"Whole numbers only\");\n");
const inScope = { path: "src/lib/cart.ts", kind: "edit" as const, content: guarded, reason: "Guard the quantity." };
const outside = { path: "src/app/page.tsx", kind: "edit" as const, content: "// whole numbers only\n", reason: "Note it." };

function lenses() {
  return [lensForChange(contract, inScope, CART), lensForChange(contract, outside, "// page\n")];
}

describe("lensRequest", () => {
  it("sends the clauses and each hunk with an id, its lines and the exact flags already found", () => {
    const r = lensRequest(contract, lenses(), [inScope, outside]);
    expect(r.clauses.map((c) => c.id)).toEqual(["outcome", "ac-1"]);
    expect(r.hunks.map((h) => h.id)).toEqual([hunkId(0, 0), hunkId(1, 0)]);
    expect(r.hunks[0]).toMatchObject({ path: "src/lib/cart.ts", range: "Line 2", reason: "Guard the quantity.", flags: [] });
    expect(r.hunks[0]!.added[0]).toContain("Number.isInteger");
    expect(r.hunks[1]!.flags[0]).toMatch(/outside/i);
  });

  it("cuts long lines and caps the number of hunks", () => {
    const long = { path: "src/lib/big.ts", kind: "edit" as const, content: `${"x".repeat(1_000)}\n`, reason: "" };
    expect(lensRequest(contract, [lensForChange(contract, long, "y\n")], [long]).hunks[0]!.added[0]!.length).toBeLessThanOrEqual(301);
    const many = Array.from({ length: 200 }, (_, i) => `line ${i}`);
    const spread = { path: "src/lib/many.ts", kind: "edit" as const, content: many.map((l, i) => (i % 2 ? `${l} changed` : l)).join("\n"), reason: "" };
    expect(lensRequest(contract, [lensForChange(contract, spread, many.join("\n"))], [spread]).hunks.length).toBe(MAX_SUGGESTION_HUNKS);
  });
});

describe("acceptSuggestion", () => {
  it("keeps only hunks that were sent and clauses that exist, once each", () => {
    const r = lensRequest(contract, lenses(), [inScope, outside]);
    const kept = acceptSuggestion(r, {
      mappings: [
        { hunk: "f0h0", clause: "AC-1", reason: "  Rejects  1.5. " },
        { hunk: "f0h0", clause: "outcome", reason: "second answer for the same hunk" },
        { hunk: "f9h9", clause: "ac-1", reason: "not sent" },
        { hunk: "f1h0", clause: "ac-7", reason: "no such clause" },
      ],
    });
    expect(kept).toEqual([{ hunk: "f0h0", clause: "ac-1", reason: "Rejects 1.5." }]);
  });

  it("keeps 'none' with its reason", () => {
    const r = lensRequest(contract, lenses(), [inScope, outside]);
    expect(acceptSuggestion(r, { mappings: [{ hunk: "f1h0", clause: "none", reason: "A comment on a page outside the contract." }] })).toEqual([{ hunk: "f1h0", clause: "none", reason: "A comment on a page outside the contract." }]);
  });
});

describe("withSuggestion", () => {
  it("puts the model's view beside each hunk and never removes an exact flag", () => {
    // The model maps the out-of-scope hunk to a criterion: the flag stays (the spec's acceptance).
    const merged = withSuggestion(contract, lenses(), [
      { hunk: "f0h0", clause: "ac-1", reason: "Rejects 1.5." },
      { hunk: "f1h0", clause: "outcome", reason: "Mentions whole numbers." },
    ]);
    expect(merged[0]!.hunks[0]!.ai).toEqual({ clause: "ac-1", label: "AC-1", statement: contract.acceptanceCriteria[0]!.statement, reason: "Rejects 1.5." });
    expect(merged[1]!.hunks[0]!.flags).toEqual([expect.objectContaining({ kind: "outside_paths" })]);
    expect(merged[1]!.hunks[0]!.ai).toMatchObject({ clause: "outcome" });
  });

  it("shows 'none' as no clause, and nothing for hunks the model didn't answer", () => {
    const merged = withSuggestion(contract, lenses(), [{ hunk: "f1h0", clause: "none", reason: "Not part of the contract." }]);
    expect(merged[1]!.hunks[0]!.ai).toEqual({ none: true, reason: "Not part of the contract." });
    expect(merged[0]!.hunks[0]!.ai).toBeNull();
    expect(withSuggestion(contract, lenses(), null)[0]!.hunks[0]!.ai).toBeNull();
  });
});
