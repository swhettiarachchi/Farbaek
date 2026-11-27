import { describe, expect, it } from "vitest";
import { INTENT_CONTRACT_SCHEMA, IntentContractSchema, type IntentContract } from "@/core/realityloop/contract";
import { planWords } from "./plan-words";

const plan = (over: Partial<IntentContract> = {}): IntentContract =>
  IntentContractSchema.parse({
    schema: INTENT_CONTRACT_SCHEMA,
    version: 1,
    outcome: "Show stock levels on product cards",
    scope: { organizationId: "org-1", projectId: "project-1", resources: ["src/components/product-card.tsx"] },
    allowedOperations: ["files.update"],
    forbiddenOperations: [],
    protectedFields: ["price"],
    protectedInvariants: [],
    assumptions: ["Stock comes from the existing products file", "  ", "Out of stock is zero"],
    openQuestions: ["Should low stock be a colour or a word?"],
    acceptanceCriteria: [
      { id: "a1", statement: "Each card shows how many are left", verification: "test" },
      { id: "a2", statement: "A sold-out card says so", verification: "manual" },
    ],
    approvals: [],
    limits: {},
    requiredChecks: ["pnpm test", "pnpm build"],
    recovery: "Undo restores the cards as they were.",
    ...over,
  });

describe("what Build's workspace says of a plan (stage 286, ADR 0294)", () => {
  it("says every part a person approves: nothing is approved that was not shown", () => {
    const words = planWords(plan(), ["price"]);
    expect(words.outcome).toBe("Show stock levels on product cards");
    expect(words.resources).toEqual(["src/components/product-card.tsx"]);
    expect(words.checks).toEqual(["Each card shows how many are left", "A sold-out card says so"]);
    expect(words.requiredChecks).toEqual(["pnpm test", "pnpm build"]);
    expect(words.kept).toEqual(["price"]);
    expect(words.recovery).toBe("Undo restores the cards as they were.");
    expect(words.assumptions).toEqual(["Stock comes from the existing products file", "Out of stock is zero"]);
    expect(words.questions).toEqual(["Should low stock be a colour or a word?"]);
    expect(words.changes.length).toBeGreaterThan(0);
  });

  it("covers every part of a plan that has words for a person, so a new one can't be left out unseen", () => {
    // The parts of a plan, each either said by planWords or named here with why it isn't.
    const said: Record<keyof IntentContract, string> = {
      schema: "the format's own name, not a term of the plan",
      version: "shown with the approval, which is bound to it",
      outcome: "outcome",
      scope: "resources",
      allowedOperations: "changes",
      forbiddenOperations: "kept, through the plan card",
      protectedFields: "kept, through the plan card",
      protectedInvariants: "kept, through the plan card",
      assumptions: "assumptions",
      openQuestions: "questions",
      acceptanceCriteria: "checks",
      approvals: "who must approve is decided by the workspace's rules, shown where approval is asked",
      limits: "shown with the approval's own choices",
      requiredChecks: "requiredChecks",
      recovery: "recovery",
    };
    expect(Object.keys(plan()).sort()).toEqual(Object.keys(said).sort());
    const words = planWords(plan(), []);
    for (const part of ["outcome", "changes", "resources", "checks", "requiredChecks", "kept", "recovery", "assumptions", "questions"] as const) expect(words, part).toHaveProperty(part);
  });

  it("says so when a plan allows no changes, and leaves out empty lines", () => {
    const words = planWords({ ...plan(), allowedOperations: [], requiredChecks: [" "], assumptions: [] }, []);
    expect(words.changes).toBe("Nothing yet: the plan allows no changes.");
    expect(words.requiredChecks).toEqual([]);
    expect(words.assumptions).toEqual([]);
  });

  it("copies what stays untouched, so the card's own list is never changed from here", () => {
    const kept = ["price"];
    const words = planWords(plan(), kept);
    words.kept.push("stock");
    expect(kept).toEqual(["price"]);
  });
});
