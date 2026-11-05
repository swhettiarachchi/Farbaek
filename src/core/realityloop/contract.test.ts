import { describe, expect, it } from "vitest";
import { SAMPLE_CONTRACT } from "@/content/samples";
import { checkActionAgainstContract, contractHash, parseContract } from "./contract";

describe("intent contract", () => {
  it("accepts the published sample contract", () => {
    expect(() => parseContract(SAMPLE_CONTRACT)).not.toThrow();
  });

  it("rejects contracts without acceptance criteria or with the wrong schema", () => {
    expect(() => parseContract({ ...SAMPLE_CONTRACT, acceptanceCriteria: [] })).toThrow();
    expect(() => parseContract({ ...SAMPLE_CONTRACT, schema: "other/v1" })).toThrow();
  });

  it("hashes deterministically and changes with the version", async () => {
    const a = await contractHash(SAMPLE_CONTRACT);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await contractHash({ ...SAMPLE_CONTRACT })).toBe(a);
    expect(await contractHash({ ...SAMPLE_CONTRACT, version: SAMPLE_CONTRACT.version + 1 })).not.toBe(a);
  });
});

describe("checkActionAgainstContract", () => {
  const ok = { operation: "products.update", fields: ["description"], recordCount: 100 };

  it("passes an action inside the contract", () => {
    expect(checkActionAgainstContract(SAMPLE_CONTRACT, ok)).toEqual([]);
  });

  it("flags protected fields, forbidden or unknown operations and record limits", () => {
    expect(checkActionAgainstContract(SAMPLE_CONTRACT, { ...ok, fields: ["description", "price"] })).toEqual([
      { kind: "PROTECTED_FIELD", detail: "price is protected by the plan." },
    ]);
    expect(checkActionAgainstContract(SAMPLE_CONTRACT, { ...ok, operation: "products.delete" })[0]?.kind).toBe("FORBIDDEN_OPERATION");
    expect(checkActionAgainstContract(SAMPLE_CONTRACT, { ...ok, operation: "orders.update" })[0]?.kind).toBe("OPERATION_NOT_ALLOWED");
    expect(checkActionAgainstContract(SAMPLE_CONTRACT, { ...ok, recordCount: 101 })[0]?.kind).toBe("RECORD_LIMIT");
  });
});
