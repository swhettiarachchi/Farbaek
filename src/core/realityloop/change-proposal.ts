/**
 * Change proposals: targeted edits to a project's files, proposed under an
 * approved intent contract. The model proposes; these deterministic rules
 * decide what can be applied and whether it fits the contract.
 *
 * - An edit replaces text that must appear exactly once in the file the
 *   model was shown. Anything else is dropped, never guessed.
 * - New files must not already exist. Paths, size and secrets are screened
 *   like an import.
 * - Contract checks: each change is an operation (files.create, files.edit)
 *   checked against allowed and forbidden operations; the number of changed
 *   files counts against the record limit; resources written as paths
 *   (containing "/" or ".") define which paths are in scope.
 */
import { z } from "zod";
import { canonicalHash, sha256Hex } from "../trust/canonical-json";
import { checkPath, screenFile } from "../workspace/files";
import { checkActionAgainstContract, type IntentContract } from "./contract";

export const CHANGE_PROPOSAL_SCHEMA = "farbaek.change-proposal/v1";

export const CHANGE_OPERATIONS = { create: "files.create", edit: "files.edit" } as const;

/** What the model returns. Loose on purpose: the rules below bound and validate it. */
export const ProposalOutputSchema = z.object({
  summary: z.string().describe("Two or three sentences: what will change and why."),
  steps: z.array(z.string()).describe("The plan, one short step per item."),
  risks: z.array(z.string()).describe("What could go wrong or needs a person's attention."),
  changes: z
    .array(
      z.object({
        path: z.string().describe("Relative path from the project root."),
        kind: z.enum(["create", "edit"]),
        edits: z
          .array(z.object({ find: z.string().describe("Exact text that appears once in the current file."), replace: z.string() }))
          .describe("For kind edit: targeted replacements, applied in order. Empty for create."),
        content: z.string().describe("For kind create: the whole new file. Empty for edit."),
        reason: z.string().describe("Why this file changes."),
      }),
    )
    .describe("Targeted changes. Never rewrite a whole existing file."),
  checks: z.array(z.string()).describe("Commands that would verify the change, for example pnpm test."),
});

export type ProposalOutput = z.infer<typeof ProposalOutputSchema>;

export interface ContextFile {
  path: string;
  revision: number;
  sha256: string;
  content: string;
}

export interface ProposedChange {
  path: string;
  kind: "create" | "edit";
  /** The revision the change was made against; 0 for a new file. */
  baseRevision: number;
  content: string;
  sha256: string;
  reason: string;
}

export type DropReason = "not_in_context" | "missing_file" | "already_exists" | "find_not_found" | "find_ambiguous" | "invalid_path" | "screened" | "no_change" | "duplicate";

export const DROP_LABELS: Record<DropReason, string> = {
  not_in_context: "The model wasn't shown this file, so it can't edit it",
  missing_file: "There's no file at this path to edit",
  already_exists: "A file with this path already exists",
  find_not_found: "The text to replace isn't in the current file",
  find_ambiguous: "The text to replace appears more than once",
  invalid_path: "The path isn't allowed",
  screened: "Skipped by the file checks (credentials, secret-looking content, build folder or size)",
  no_change: "The edit doesn't change the file",
  duplicate: "The file appears twice in the proposal",
};

export interface Dropped {
  path: string;
  reason: DropReason;
}

export type ViolationKind = "OPERATION_NOT_ALLOWED" | "FORBIDDEN_OPERATION" | "RECORD_LIMIT" | "OUT_OF_SCOPE_PATH";

export interface Violation {
  kind: ViolationKind;
  detail: string;
}

const MAX_CHANGES = 30;
const MAX_TEXT = 2_000;
const clip = (s: string, n = MAX_TEXT) => s.replace(/\s+/g, " ").trim().slice(0, n);

/** Applies find/replace edits in order. Each `find` must occur exactly once at the time it is applied. */
export function applyEdits(content: string, edits: readonly { find: string; replace: string }[]): { ok: true; content: string } | { ok: false; reason: "find_not_found" | "find_ambiguous"; index: number } {
  let out = content;
  for (const [index, edit] of edits.entries()) {
    if (!edit.find) return { ok: false, reason: "find_not_found", index };
    const first = out.indexOf(edit.find);
    if (first === -1) return { ok: false, reason: "find_not_found", index };
    if (out.indexOf(edit.find, first + 1) !== -1) return { ok: false, reason: "find_ambiguous", index };
    out = out.slice(0, first) + edit.replace + out.slice(first + edit.find.length);
  }
  return { ok: true, content: out };
}

/** Turns model output into changes that can be applied, and the ones that can't with the reason. */
export async function buildChanges(
  output: ProposalOutput,
  context: readonly ContextFile[],
  existingPaths: ReadonlySet<string>,
  maxFileBytes: number,
): Promise<{ changes: ProposedChange[]; dropped: Dropped[] }> {
  const byPath = new Map(context.map((f) => [f.path, f]));
  const changes: ProposedChange[] = [];
  const dropped: Dropped[] = [];
  const seen = new Set<string>();

  for (const c of output.changes.slice(0, MAX_CHANGES)) {
    const checked = checkPath(c.path.trim());
    const path = checked.ok ? checked.path : c.path.trim().slice(0, 300);
    if (!checked.ok) {
      dropped.push({ path, reason: "invalid_path" });
      continue;
    }
    if (seen.has(path)) {
      dropped.push({ path, reason: "duplicate" });
      continue;
    }
    seen.add(path);

    let content: string;
    let baseRevision = 0;
    if (c.kind === "edit") {
      const base = byPath.get(path);
      if (!base) {
        dropped.push({ path, reason: existingPaths.has(path) ? "not_in_context" : "missing_file" });
        continue;
      }
      const applied = applyEdits(base.content, c.edits);
      if (!applied.ok) {
        dropped.push({ path, reason: applied.reason });
        continue;
      }
      if (applied.content === base.content) {
        dropped.push({ path, reason: "no_change" });
        continue;
      }
      content = applied.content;
      baseRevision = base.revision;
    } else {
      if (existingPaths.has(path)) {
        dropped.push({ path, reason: "already_exists" });
        continue;
      }
      content = c.content;
    }

    const screened = screenFile(path, content, new TextEncoder().encode(content).length, maxFileBytes);
    if (!screened.ok) {
      dropped.push({ path, reason: "screened" });
      continue;
    }
    changes.push({ path, kind: c.kind, baseRevision, content, sha256: await sha256Hex(content), reason: clip(c.reason, 500) });
  }
  return { changes, dropped };
}

/** Contract resources written as paths ("src/lib", "README.md"). Plain words like "products" aren't paths. */
export function pathScope(contract: IntentContract): string[] {
  return contract.scope.resources
    .map((r) => r.trim().replace(/^\.\//, "").replace(/\/+$/, ""))
    .filter((r) => r.includes("/") || r.includes("."))
    .filter(Boolean);
}

export function checkProposal(contract: IntentContract, changes: readonly ProposedChange[]): Violation[] {
  const violations: Violation[] = [];
  const seen = new Set<string>();
  for (const change of changes) {
    for (const v of checkActionAgainstContract(contract, { operation: CHANGE_OPERATIONS[change.kind], fields: [], recordCount: 1 })) {
      if (v.kind === "RECORD_LIMIT" || seen.has(v.detail)) continue;
      seen.add(v.detail);
      violations.push({ kind: v.kind as ViolationKind, detail: v.detail });
    }
  }
  const max = contract.limits.maxRecords;
  if (max !== undefined && changes.length > max) {
    violations.push({ kind: "RECORD_LIMIT", detail: `${changes.length} files change, over the contract limit of ${max}.` });
  }
  const scope = pathScope(contract);
  if (scope.length > 0) {
    for (const change of changes) {
      if (!scope.some((s) => change.path === s || change.path.startsWith(`${s}/`))) {
        violations.push({ kind: "OUT_OF_SCOPE_PATH", detail: `${change.path} is outside the contract's paths (${scope.join(", ")}).` });
      }
    }
  }
  return violations;
}

/** The plan text, bounded. */
export function planFrom(output: ProposalOutput): { summary: string; steps: string[]; risks: string[]; checks: string[] } {
  const list = (items: string[]) => items.map((i) => clip(i, 300)).filter(Boolean).slice(0, 20);
  return { summary: clip(output.summary), steps: list(output.steps), risks: list(output.risks), checks: list(output.checks) };
}

/** Binds a proposal to its task, the exact contract version and every proposed file. */
export function proposalHash(input: { taskId: string; contractVersion: number; contractSha256: string; changes: readonly ProposedChange[] }): Promise<string> {
  return canonicalHash({
    schema: CHANGE_PROPOSAL_SCHEMA,
    taskId: input.taskId,
    contractVersion: input.contractVersion,
    contractSha256: input.contractSha256,
    changes: input.changes.map((c) => ({ path: c.path, kind: c.kind, baseRevision: c.baseRevision, sha256: c.sha256 })),
  });
}

/** Binds an approval to the exact content the person accepted, after their chunk decisions. */
export function appliedHash(input: { proposalSha256: string; files: readonly { path: string; sha256: string }[] }): Promise<string> {
  return canonicalHash({
    schema: `${CHANGE_PROPOSAL_SCHEMA}#applied`,
    proposalSha256: input.proposalSha256,
    files: [...input.files].sort((a, b) => a.path.localeCompare(b.path)).map((f) => ({ path: f.path, sha256: f.sha256 })),
  });
}
