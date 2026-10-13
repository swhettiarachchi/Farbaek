import { describe, expect, it } from "vitest";
import { contractHash } from "./contract";
import { EMPTY_CONTRACT_FORM, contractFromForm, formFromContract, type ContractFormValues } from "./contract-form";

const scope = { organizationId: "org_1", projectId: "prj_1" };

const filled: ContractFormValues = {
  ...EMPTY_CONTRACT_FORM,
  outcome: "Rewrite 100 product descriptions in the house style.",
  resources: "products",
  allowed: "products.update",
  forbidden: "products.delete\nproducts.publish",
  protectedFields: "price, stock, published",
  invariants: "Prices are unchanged.\nNo orders are touched.",
  acceptance: "All descriptions are under 160 characters.\nread_back: Saved text reads back exactly.",
  checks: "pnpm test",
  recovery: "Restore the previous descriptions from the snapshot.",
  maxRecords: "100",
  maxRetries: "2",
};

describe("contractFromForm", () => {
  it("builds a valid contract from the form", () => {
    const result = contractFromForm(filled, scope, 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.contract).toMatchObject({
      version: 1,
      scope: { organizationId: "org_1", projectId: "prj_1", resources: ["products"] },
      forbiddenOperations: ["products.delete", "products.publish"],
      protectedFields: ["price", "stock", "published"],
      limits: { maxRecords: 100, maxRetries: 2 },
    });
    expect(result.contract.acceptanceCriteria).toEqual([
      { id: "ac-1", statement: "All descriptions are under 160 characters.", verification: "test" },
      { id: "ac-2", statement: "Saved text reads back exactly.", verification: "read_back" },
    ]);
    expect(result.contract.protectedInvariants[1]).toEqual({ id: "inv-2", statement: "No orders are touched." });
  });

  it.each([
    ["outcome", { outcome: " " }, /Outcome is required/],
    ["resources", { resources: "" }, /Resources is required/],
    ["allowed", { allowed: "" }, /Allowed operations is required/],
    ["acceptance", { acceptance: "" }, /Acceptance criteria is required/],
    ["recovery", { recovery: "" }, /Recovery is required/],
    ["record limit", { maxRecords: "lots" }, /whole number/],
    ["zero records", { maxRecords: "0" }, /at least 1/],
    ["overlap", { forbidden: "products.update" }, /both allowed and forbidden/],
  ])("explains a missing or invalid %s", (_name, change, message) => {
    const result = contractFromForm({ ...filled, ...change }, scope, 1);
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(message) });
  });

  it("round-trips through the form for revisions, keeping the same hash", async () => {
    const first = contractFromForm(filled, scope, 2);
    if (!first.ok) throw new Error(first.message);
    const again = contractFromForm(formFromContract(first.contract), scope, 2);
    if (!again.ok) throw new Error(again.message);
    expect(await contractHash(again.contract)).toBe(await contractHash(first.contract));
  });
});
