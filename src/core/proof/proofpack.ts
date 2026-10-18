/**
 * ProofPacks: the evidence record for a change, emitted as an in-toto
 * attestation statement (spec "Evidence receipts and ProofPack"). Subjects
 * are the SHA-256 digests of the exact file contents applied; the predicate
 * records the task, the approved contract, the proposal, the policy
 * decision, the approval, the checks and their real exit codes, the
 * execution mode, and the record's own limits.
 *
 * The digest is the RFC 8785 canonical SHA-256 of the whole statement, so
 * any edit to the stored record is detectable by recomputing it. Successive
 * ProofPacks in a project link to the previous digest.
 *
 * What this proves: the integrity and origin of what was recorded, under the
 * stated assumptions. It doesn't prove that external claims are true, and an
 * unverified ProofPack never earns the Seal.
 */
import type { CheckResult } from "../realityloop/task-machine";
import { canonicalHash } from "../trust/canonical-json";

export const IN_TOTO_STATEMENT_TYPE = "https://in-toto.io/Statement/v1";
/** Placeholder predicate URI from the spec; replace with an owned domain before signing (ADR 0012). */
export const PROOFPACK_PREDICATE_TYPE = "https://farbaek.dev/proofpack/v1";

export type ProofPackStatus = "unverified" | "partially_verified" | "verified" | "failed";

export interface ProofPackInput {
  task: { id: string; organizationId: string; projectId: string };
  contract: { version: number; sha256: string };
  proposal: { id: string; sha256: string; model: string | null };
  policy: { outcome: string; version: string; findings: { rule: string; outcome: string; detail: string }[] } | null;
  approval: { approvedBy: string; approvedAt: string; appliedSha256: string };
  /** The files written, with the digest of the exact content applied. */
  files: { path: string; kind: "create" | "edit"; baseRevision: number; sha256: string }[];
  /** The contract's required checks and what happened to each. exitCode null means it didn't run. */
  checks: CheckResult[];
  execution: { mode: "sandboxed"; provider: string } | { mode: "review_only"; reason: string };
  createdAt: string;
  /** Digest of the project's previous ProofPack, if any. */
  previous: string | null;
}

export interface ProofPackStatement {
  _type: typeof IN_TOTO_STATEMENT_TYPE;
  subject: { name: string; digest: { sha256: string } }[];
  predicateType: typeof PROOFPACK_PREDICATE_TYPE;
  predicate: {
    schema: "farbaek.proofpack/v1";
    status: ProofPackStatus;
    task: ProofPackInput["task"];
    contract: ProofPackInput["contract"];
    proposal: ProofPackInput["proposal"];
    policy: ProofPackInput["policy"];
    approval: ProofPackInput["approval"];
    changes: ProofPackInput["files"];
    checks: { name: string; command: string; exitCode: number | null; status: "passed" | "failed" | "not_run" }[];
    execution: ProofPackInput["execution"];
    limits: string[];
    createdAt: string;
    previous: string | null;
    /**
     * Set on a ProofPack recorded when the change's checks ran in a sandbox:
     * the check run's receipt, the ProofPack of the change it verifies, and
     * that the sandbox held exactly the applied content.
     */
    verification?: { receipt: string; appliedProofPack: string; filesMatched: true };
  };
}

/** Status from real results only: no checks run means unverified, never verified. */
export function proofPackStatus(checks: readonly CheckResult[]): ProofPackStatus {
  if (checks.length === 0 || checks.some((c) => c.exitCode === null)) {
    const ran = checks.filter((c) => c.exitCode !== null);
    if (ran.length === 0) return "unverified";
    return ran.some((c) => c.exitCode === 0) ? "partially_verified" : "failed";
  }
  const passed = checks.filter((c) => c.exitCode === 0).length;
  if (passed === checks.length) return "verified";
  return passed > 0 ? "partially_verified" : "failed";
}

function limitsFor(input: ProofPackInput, status: ProofPackStatus): string[] {
  const limits = ["This record proves the integrity and origin of what it contains. It does not prove that external claims in it are true."];
  if (input.execution.mode === "review_only") limits.push(`Checks did not run: ${input.execution.reason}`);
  const notRun = input.checks.filter((c) => c.exitCode === null).map((c) => c.command);
  if (notRun.length && input.execution.mode === "sandboxed") limits.push(`Not run: ${notRun.join(", ")}.`);
  if (input.checks.length === 0) limits.push("The contract listed no required checks, so nothing verified the change.");
  if (status !== "verified") limits.push("Not verified. No Seal is issued for this record.");
  if (input.policy === null) limits.push("No policy decision was recorded for this change.");
  return limits;
}

export function buildProofPack(input: ProofPackInput): ProofPackStatement {
  const status = proofPackStatus(input.checks);
  return {
    _type: IN_TOTO_STATEMENT_TYPE,
    subject: [...input.files].sort((a, b) => a.path.localeCompare(b.path)).map((f) => ({ name: f.path, digest: { sha256: f.sha256 } })),
    predicateType: PROOFPACK_PREDICATE_TYPE,
    predicate: {
      schema: "farbaek.proofpack/v1",
      status,
      task: input.task,
      contract: input.contract,
      proposal: input.proposal,
      policy: input.policy,
      approval: input.approval,
      changes: [...input.files].sort((a, b) => a.path.localeCompare(b.path)),
      checks: input.checks.map((c) => ({ ...c, status: c.exitCode === null ? "not_run" : c.exitCode === 0 ? "passed" : "failed" })),
      execution: input.execution,
      limits: limitsFor(input, status),
      createdAt: input.createdAt,
      previous: input.previous,
    },
  };
}

/**
 * The ProofPack for a check run against an applied change. It repeats what
 * was approved and applied (from the change's own ProofPack), adds the real
 * check results and where they ran, and links to the run's receipt. The
 * change's original ProofPack stays as it was; this one follows it in the
 * project's chain.
 */
export function buildVerificationProofPack(input: {
  applied: ProofPackStatement;
  appliedDigest: string;
  receiptDigest: string;
  checks: CheckResult[];
  provider: string;
  createdAt: string;
  previous: string | null;
}): ProofPackStatement {
  const p = input.applied.predicate;
  const base = buildProofPack({
    task: p.task,
    contract: p.contract,
    proposal: p.proposal,
    policy: p.policy,
    approval: p.approval,
    files: p.changes,
    checks: input.checks,
    execution: { mode: "sandboxed", provider: input.provider },
    createdAt: input.createdAt,
    previous: input.previous,
  });
  return {
    ...base,
    predicate: {
      ...base.predicate,
      limits: [
        ...base.predicate.limits,
        `Checks ran in ${input.provider} against the applied content: every changed file's SHA-256 matched inside the sandbox before the checks.`,
      ],
      verification: { receipt: input.receiptDigest, appliedProofPack: input.appliedDigest, filesMatched: true },
    },
  };
}

export function proofPackDigest(statement: ProofPackStatement): Promise<string> {
  return canonicalHash(statement);
}

/** Recomputes the digest of a stored statement. A mismatch means the record was changed after it was made. */
export async function verifyProofPack(statement: unknown, digest: string): Promise<{ intact: boolean; computed: string }> {
  const computed = await canonicalHash(statement);
  return { intact: computed === digest, computed };
}
