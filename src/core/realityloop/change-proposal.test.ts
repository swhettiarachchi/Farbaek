import { describe, expect, it } from "vitest";
import { sha256Hex } from "../trust/canonical-json";
import { applyEdits, appliedHash, buildChanges, checkProposal, pathScope, proposalHash, type ContextFile, type ProposalOutput } from "./change-proposal";
import { INTENT_CONTRACT_SCHEMA, type IntentContract } from "./contract";

const fake = (...parts: string[]) => parts.join("");

const contract: IntentContract = {
  schema: INTENT_CONTRACT_SCHEMA,
  version: 2,
  outcome: "Cart rejects fractional quantities.",
  scope: { organizationId: "o1", projectId: "p1", resources: ["src/lib", "README.md"] },
  allowedOperations: ["files.edit", "files.create"],
  forbiddenOperations: ["files.delete"],
  protectedFields: [],
  protectedInvariants: [{ id: "inv-1", statement: "Prices are unchanged." }],
  assumptions: [],
  openQuestions: [],
  acceptanceCriteria: [{ id: "ac-1", statement: "Fractional quantities throw.", verification: "test" }],
  approvals: [{ gate: "before_execution", role: "contributor" }],
  limits: { maxRecords: 3 },
  requiredChecks: ["pnpm test"],
  recovery: "Restore the previous revisions.",
};

const cart: ContextFile = {
  path: "src/lib/cart.ts",
  revision: 4,
  sha256: "x".repeat(64),
  content: "export function add(q: number) {\n  if (q < 1) throw new Error('min');\n  return q;\n}\n",
};

const output = (changes: ProposalOutput["changes"]): ProposalOutput => ({ summary: "s", steps: [], risks: [], checks: [], changes });
const edit = (path: string, edits: { find: string; replace: string }[]) => ({ path, kind: "edit" as const, edits, content: "", reason: "r" });
const create = (path: string, content: string) => ({ path, kind: "create" as const, edits: [], content, reason: "r" });

describe("applyEdits", () => {
  it("applies unique replacements in order", () => {
    expect(applyEdits("a b c", [{ find: "b", replace: "B" }, { find: "B c", replace: "done" }])).toEqual({ ok: true, content: "a done" });
  });

  it("refuses missing, empty or ambiguous anchors instead of guessing", () => {
    expect(applyEdits("a b", [{ find: "z", replace: "" }])).toEqual({ ok: false, reason: "find_not_found", index: 0 });
    expect(applyEdits("a b", [{ find: "", replace: "x" }])).toMatchObject({ ok: false, reason: "find_not_found" });
    expect(applyEdits("x x", [{ find: "x", replace: "y" }])).toEqual({ ok: false, reason: "find_ambiguous", index: 0 });
  });
});

describe("buildChanges", () => {
  const existing = new Set(["src/lib/cart.ts", "src/lib/products.ts", "src/lib/other.ts"]);

  it("applies edits against the file the model saw and hashes the result", async () => {
    const { changes, dropped } = await buildChanges(
      output([edit("src/lib/cart.ts", [{ find: "if (q < 1)", replace: "if (q < 1 || !Number.isInteger(q))" }]), create("src/lib/cart-errors.ts", "export {};\n")]),
      [cart],
      existing,
      1024,
    );
    expect(dropped).toEqual([]);
    expect(changes.map((c) => [c.path, c.kind, c.baseRevision])).toEqual([
      ["src/lib/cart.ts", "edit", 4],
      ["src/lib/cart-errors.ts", "create", 0],
    ]);
    expect(changes[0]!.content).toContain("Number.isInteger(q)");
    expect(changes[0]!.sha256).toBe(await sha256Hex(changes[0]!.content));
  });

  it("drops what can't be applied safely, with a reason for each", async () => {
    const { changes, dropped } = await buildChanges(
      output([
        edit("src/lib/other.ts", [{ find: "x", replace: "y" }]),
        edit("src/lib/nowhere.ts", [{ find: "x", replace: "y" }]),
        edit("src/lib/cart.ts", [{ find: "not there", replace: "y" }]),
        create("src/lib/cart.ts", "dup"),
        create("src/lib/products.ts", "exists"),
        create("../escape.ts", "x"),
        create(".env", "A=1"),
        create("src/lib/keys.ts", fake("const k = 'sk-ant-", "api03-", "x".repeat(30), "';")),
      ]),
      [cart],
      existing,
      1024,
    );
    expect(changes).toEqual([]);
    expect(dropped.map((d) => [d.path, d.reason])).toEqual([
      ["src/lib/other.ts", "not_in_context"],
      ["src/lib/nowhere.ts", "missing_file"],
      ["src/lib/cart.ts", "find_not_found"],
      ["src/lib/cart.ts", "duplicate"],
      ["src/lib/products.ts", "already_exists"],
      ["../escape.ts", "invalid_path"],
      [".env", "screened"],
      ["src/lib/keys.ts", "screened"],
    ]);
  });

  it("drops edits that change nothing", async () => {
    const { dropped } = await buildChanges(output([edit("src/lib/cart.ts", [{ find: "min", replace: "min" }])]), [cart], existing, 1024);
    expect(dropped).toEqual([{ path: "src/lib/cart.ts", reason: "no_change" }]);
  });
});

describe("checkProposal", () => {
  const change = (path: string, kind: "create" | "edit" = "edit") => ({ path, kind, baseRevision: 1, content: "", sha256: "a".repeat(64), reason: "" });

  it("passes changes inside the contract", () => {
    expect(checkProposal(contract, [change("src/lib/cart.ts"), change("README.md", "edit"), change("src/lib/new.ts", "create")])).toEqual([]);
  });

  it("reports operations the contract doesn't allow", () => {
    const editOnly = { ...contract, allowedOperations: ["files.edit"] };
    expect(checkProposal(editOnly, [change("src/lib/a.ts", "create"), change("src/lib/b.ts", "create")])).toEqual([
      { kind: "OPERATION_NOT_ALLOWED", detail: "files.create is not in the contract's allowed operations." },
    ]);
    const forbidsEdit = { ...contract, forbiddenOperations: ["files.edit"] };
    expect(checkProposal(forbidsEdit, [change("src/lib/a.ts")])).toMatchObject([{ kind: "FORBIDDEN_OPERATION" }]);
  });

  it("counts changed files against the record limit and enforces path scope", () => {
    const many = ["a", "b", "c", "d"].map((n) => change(`src/lib/${n}.ts`));
    expect(checkProposal(contract, many)).toEqual([{ kind: "RECORD_LIMIT", detail: "4 files change, over the plan's limit of 3." }]);
    expect(checkProposal(contract, [change("src/app/page.tsx"), change("src/library/x.ts")]).map((v) => v.kind)).toEqual(["OUT_OF_SCOPE_PATH", "OUT_OF_SCOPE_PATH"]);
  });

  it("treats only path-like resources as path scope", () => {
    expect(pathScope({ ...contract, scope: { ...contract.scope, resources: ["products", "./src/lib/", "README.md"] } })).toEqual(["src/lib", "README.md"]);
    expect(checkProposal({ ...contract, scope: { ...contract.scope, resources: ["products"] } }, [change("anywhere/x.ts")])).toEqual([]);
    expect(pathScope({ ...contract, scope: { ...contract.scope, resources: ["docs/", "./scripts", ".", "./"] } })).toEqual(["docs", "scripts"]);
  });
});

describe("hashes", () => {
  it("bind the proposal to its contract version and contents, and the approval to the accepted files", async () => {
    const changes = [{ path: "a.ts", kind: "edit" as const, baseRevision: 1, content: "x", sha256: "a".repeat(64), reason: "" }];
    const base = { taskId: "t1", contractVersion: 2, contractSha256: "c".repeat(64), changes };
    const h = await proposalHash(base);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(await proposalHash({ ...base, contractVersion: 3 })).not.toBe(h);
    expect(await proposalHash({ ...base, changes: [{ ...changes[0]!, sha256: "b".repeat(64) }] })).not.toBe(h);

    const a = await appliedHash({ proposalSha256: h, files: [{ path: "b.ts", sha256: "1".repeat(64) }, { path: "a.ts", sha256: "2".repeat(64) }] });
    expect(a).toBe(await appliedHash({ proposalSha256: h, files: [{ path: "a.ts", sha256: "2".repeat(64) }, { path: "b.ts", sha256: "1".repeat(64) }] }));
  });
});
