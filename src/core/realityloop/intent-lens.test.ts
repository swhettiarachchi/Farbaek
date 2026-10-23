import { describe, expect, it } from "vitest";
import { INTENT_CONTRACT_SCHEMA, type IntentContract } from "./contract";
import { distinctiveWords, hunkRange, lensForChange, lensSummary } from "./intent-lens";

const contract: IntentContract = {
  schema: INTENT_CONTRACT_SCHEMA,
  version: 2,
  outcome: "Shoppers can't put fractional quantities in the cart.",
  scope: { organizationId: "o1", projectId: "p1", resources: ["src/lib", "README.md"] },
  allowedOperations: ["files.edit"],
  forbiddenOperations: ["files.delete"],
  protectedFields: ["price"],
  protectedInvariants: [{ id: "inv-1", statement: "Prices never change." }],
  assumptions: [],
  openQuestions: [],
  acceptanceCriteria: [
    { id: "ac-1", statement: "Adding 1.5 of an item is rejected with a clear message.", verification: "test" },
    { id: "ac-2", statement: "The README names the test command, pnpm test.", verification: "read_back" },
  ],
  approvals: [],
  limits: {},
  requiredChecks: ["pnpm test"],
  recovery: "Restore the previous revision.",
};

const CART = "export function addToCart(lines, product, quantity = 1) {\n  return [...lines, { product, quantity }];\n}\n";

describe("lensForChange", () => {
  it("matches a hunk to the criterion it shares words with", () => {
    const after = "export function addToCart(lines, product, quantity = 1) {\n  if (!Number.isInteger(quantity)) throw new Error(\"Fractional quantities are rejected\");\n  return [...lines, { product, quantity }];\n}\n";
    const lens = lensForChange(contract, { path: "src/lib/cart.ts", kind: "edit", content: after, reason: "Reject fractional quantities." }, CART);
    expect(lens.hunks).toHaveLength(1);
    expect(lens.hunks[0]).toMatchObject({ flags: [], unexplained: false, match: { id: "outcome" } });

    const readme = lensForChange(contract, { path: "README.md", kind: "edit", content: "# Shop\n\nRun the tests with pnpm test.\n", reason: "Name the test command." }, "# Shop\n\nRun the tests.\n");
    expect(readme.hunks[0]!.match).toMatchObject({ id: "ac-2", label: "AC-2" });
    expect(readme.hunks[0]!.match!.shared).toEqual(expect.arrayContaining(["readme", "command"]));
  });

  it("always flags a file outside the contract's paths, even when its words match", () => {
    const lens = lensForChange(contract, { path: "src/app/cart-page.tsx", kind: "edit", content: "// Fractional quantities in the cart are rejected\n", reason: "Reject fractional quantities in the cart." }, "// cart\n");
    const h = lens.hunks[0]!;
    expect(h.flags).toEqual([expect.objectContaining({ kind: "outside_paths", detail: expect.stringMatching(/src\/lib, README\.md/) })]);
    expect(h.match).not.toBeNull();
    expect(h.unexplained).toBe(false);
  });

  it("flags an operation the contract doesn't allow", () => {
    const lens = lensForChange(contract, { path: "src/lib/new.ts", kind: "create", content: "export const x = 1;\n", reason: "" }, "");
    expect(lens.hunks[0]!.flags).toEqual([expect.objectContaining({ kind: "operation", detail: expect.stringMatching(/files\.create/) })]);
  });

  it("flags a changed line that names a protected field, but not the word inside another name", () => {
    const touched = lensForChange(contract, { path: "src/lib/cart.ts", kind: "edit", content: CART.replace("{ product, quantity }", "{ product, quantity, price: 0 }"), reason: "" }, CART);
    expect(touched.hunks[0]!.flags).toEqual([{ kind: "protected_field", detail: "Touches the protected field price" }]);

    const inside = lensForChange(contract, { path: "src/lib/cart.ts", kind: "edit", content: CART.replace("quantity = 1", "quantity = 1, priceLabel = \"\""), reason: "" }, CART);
    expect(inside.hunks[0]!.flags).toEqual([]);
  });

  it("marks a hunk no clause explains, and doesn't match on common words alone", () => {
    const lens = lensForChange(contract, { path: "src/lib/theme.ts", kind: "edit", content: "export const accent = \"#2f6bff\";\n", reason: "Make the new value the default." }, "export const accent = \"#000000\";\n");
    expect(lens.hunks[0]).toMatchObject({ flags: [], match: null, unexplained: true });
  });

  it("counts the summary from every hunk", () => {
    const lenses = [
      lensForChange(contract, { path: "README.md", kind: "edit", content: "# Shop\n\nRun the tests with pnpm test.\n", reason: "Name the test command." }, "# Shop\n\nRun the tests.\n"),
      lensForChange(contract, { path: "src/lib/theme.ts", kind: "edit", content: "export const accent = \"#2f6bff\";\n", reason: "" }, "export const accent = \"#000000\";\n"),
      lensForChange(contract, { path: "src/app/page.tsx", kind: "edit", content: "x\n", reason: "" }, "y\n"),
    ];
    expect(lensSummary(lenses)).toEqual({ hunks: 3, matched: 1, unexplained: 1, outside: 1, flagged: 1 });
  });
});

describe("words and ranges", () => {
  it("splits code names and drops what says nothing", () => {
    expect([...distinctiveWords("addToCart(fractional_quantities) const return the")]).toEqual(["cart", "fractional", "quantity"]);
  });

  it("reads ranges as people say them", () => {
    expect(hunkRange({ oldStart: 2, oldLines: 1, newStart: 2, newLines: 1, removed: ["a"], added: ["b"] })).toBe("Line 2");
    expect(hunkRange({ oldStart: 3, oldLines: 0, newStart: 3, newLines: 4, removed: [], added: ["a", "b", "c", "d"] })).toBe("Lines 3 to 6");
    expect(hunkRange({ oldStart: 5, oldLines: 2, newStart: 5, newLines: 0, removed: ["a", "b"], added: [] })).toBe("Removed lines 5 to 6");
  });
});
