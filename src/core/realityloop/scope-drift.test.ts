import { describe, expect, it } from "vitest";
import { INTENT_CONTRACT_SCHEMA, type IntentContract } from "./contract";
import { groupDrift, operationOf, scopeDrift, type FileChangeEvent } from "./scope-drift";

const contract: IntentContract = {
  schema: INTENT_CONTRACT_SCHEMA,
  version: 1,
  outcome: "Fix the cart.",
  scope: { organizationId: "o1", projectId: "p1", resources: ["src/lib"] },
  allowedOperations: ["files.edit", "files.create"],
  forbiddenOperations: ["files.delete"],
  protectedFields: [],
  protectedInvariants: [],
  assumptions: [],
  openQuestions: [],
  acceptanceCriteria: [{ id: "ac-1", statement: "Cart works.", verification: "test" }],
  approvals: [],
  limits: {},
  requiredChecks: ["pnpm test"],
  recovery: "Restore revisions.",
};

const ev = (path: string, change: FileChangeEvent["change"], revision: number, at = "2026-10-14T10:00:00Z", proposalId: string | null = null): FileChangeEvent => ({
  path,
  change,
  revision,
  at,
  proposalId,
});

describe("operationOf", () => {
  it("maps first revisions to create, later ones to edit, deletions to delete", () => {
    expect(operationOf(ev("a.ts", "import", 1))).toBe("files.create");
    expect(operationOf(ev("a.ts", "edit", 4))).toBe("files.edit");
    expect(operationOf(ev("a.ts", "delete", 5))).toBe("files.delete");
  });
});

describe("scopeDrift", () => {
  it("passes changes the contract covers", () => {
    expect(scopeDrift(contract, [ev("src/lib/cart.ts", "edit", 3, undefined, "prop-1"), ev("src/lib/new.ts", "edit", 1)])).toEqual([]);
  });

  it("flags paths outside the contract and forbidden or unlisted operations, oldest first", () => {
    const findings = scopeDrift(contract, [
      ev("src/app/page.tsx", "edit", 2, "2026-10-14T12:00:00Z"),
      ev("src/lib/old.ts", "delete", 3, "2026-10-14T11:00:00Z"),
      ev("README.md", "delete", 2, "2026-10-14T13:00:00Z"),
    ]);
    expect(findings).toEqual([
      { path: "src/lib/old.ts", operation: "files.delete", reasons: ["operation_forbidden"], at: "2026-10-14T11:00:00Z", viaProposal: false, origin: "delete" },
      { path: "src/app/page.tsx", operation: "files.edit", reasons: ["outside_paths"], at: "2026-10-14T12:00:00Z", viaProposal: false, origin: "edit" },
      { path: "README.md", operation: "files.delete", reasons: ["operation_forbidden", "outside_paths"], at: "2026-10-14T13:00:00Z", viaProposal: false, origin: "delete" },
    ]);
  });

  it("treats every file change as drift for a contract that allows no file operations", () => {
    const dataContract = { ...contract, scope: { ...contract.scope, resources: ["products"] }, allowedOperations: ["products.update"], forbiddenOperations: [] };
    expect(scopeDrift(dataContract, [ev("src/lib/cart.ts", "edit", 2)])).toMatchObject([{ reasons: ["operation_not_allowed"] }]);
  });

  it("groups a bulk import into one origin with folder counts, proposals first", () => {
    const events = [
      ev("docs/a.md", "import", 1),
      ev("docs/b.md", "import", 1),
      ev("src/core/x.ts", "import", 1),
      ev("package.json", "import", 1),
      ev("src/app/page.tsx", "edit", 2, undefined, "prop-9"),
    ];
    const groups = groupDrift(scopeDrift(contract, events));
    expect(groups.map((g) => [g.origin, g.count])).toEqual([
      ["proposal", 1],
      ["import", 4],
    ]);
    expect(groups[1]!.folders.map((f) => [f.folder, f.findings.length])).toEqual([
      ["docs", 2],
      ["(project root)", 1],
      ["src/core", 1],
    ]);
  });
});
