import { describe, expect, it } from "vitest";
import { ContractDraftSchema, draftToForm, type ContractDraft } from "./contract-draft";
import { contractFromForm } from "./contract-form";

const draft: ContractDraft = {
  outcome: "Rewrite 100 product descriptions in the house style.",
  resources: ["products"],
  allowedOperations: ["products.update"],
  forbiddenOperations: ["products.delete", "products.publish"],
  protectedFields: ["price", "stock"],
  protectedInvariants: ["Prices are unchanged."],
  acceptanceCriteria: [
    { statement: "All descriptions are under 160 characters.", verification: "test" },
    { statement: "Saved text reads back exactly.", verification: "read_back" },
  ],
  requiredChecks: ["pnpm test"],
  assumptions: ["The house style guide is the one in the project docs."],
  openQuestions: ["Should draft products be included?"],
  recovery: "Restore the previous descriptions from the snapshot.",
  maxRecords: 100,
};

const scope = { organizationId: "org_1", projectId: "prj_1" };

describe("draftToForm", () => {
  it("fills every editor field, and the result saves as a valid contract", () => {
    const form = draftToForm(draft);
    expect(form).toMatchObject({
      resources: "products",
      allowed: "products.update",
      forbidden: "products.delete\nproducts.publish",
      protectedFields: "price, stock",
      acceptance: "All descriptions are under 160 characters.\nread_back: Saved text reads back exactly.",
      maxRecords: "100",
      maxRetries: "",
    });
    const built = contractFromForm(form, scope, 1);
    expect(built.ok).toBe(true);
    if (built.ok) expect(built.contract.acceptanceCriteria[1]).toMatchObject({ verification: "read_back" });
  });

  it("keeps an operation forbidden when the draft also allows it", () => {
    const form = draftToForm({ ...draft, allowedOperations: ["products.update", "products.delete"] });
    expect(form.allowed).toBe("products.update");
    expect(form.forbidden).toContain("products.delete");
  });

  it("flattens line breaks and control characters so one item stays one line", () => {
    const form = draftToForm({ ...draft, protectedInvariants: ["Prices\nare\u0007 unchanged.", "  "], outcome: "Line one\r\nline two" });
    expect(form.invariants).toBe("Prices are unchanged.");
    expect(form.outcome).toBe("Line one line two");
  });

  it("stops commas inside items from creating extra resources", () => {
    expect(draftToForm({ ...draft, resources: ["products, orders"] }).resources).toBe("products orders");
  });

  it("bounds list sizes and item lengths and removes duplicates", () => {
    const many = Array.from({ length: 40 }, (_, i) => `Assumption ${i}`);
    const form = draftToForm({ ...draft, assumptions: [...many, "Assumption 0"], openQuestions: ["x".repeat(900)] });
    expect(form.assumptions.split("\n")).toHaveLength(20);
    expect(form.questions).toHaveLength(300);
  });

  it("drops record limits that aren't a positive whole number", () => {
    for (const maxRecords of [0, -3, 2.5, null]) expect(draftToForm({ ...draft, maxRecords }).maxRecords).toBe("");
  });

  it("doesn't let a verification prefix in the text override the declared one", () => {
    const form = draftToForm({ ...draft, acceptanceCriteria: [{ statement: "manual: someone looks at it", verification: "test" }] });
    expect(form.acceptance).toBe("someone looks at it");
    const built = contractFromForm(form, scope, 1);
    expect(built.ok && built.contract.acceptanceCriteria[0]!.verification).toBe("test");
  });

  it("leaves a draft with no outcome or criteria for the person to complete", () => {
    const form = draftToForm({ ...draft, outcome: " ", acceptanceCriteria: [] });
    const built = contractFromForm(form, scope, 1);
    expect(built).toEqual({ ok: false, message: "Outcome is required." });
  });

  it("describes every field for the model", () => {
    for (const [key, field] of Object.entries(ContractDraftSchema.shape)) expect(field.description, key).toBeTruthy();
  });
});
