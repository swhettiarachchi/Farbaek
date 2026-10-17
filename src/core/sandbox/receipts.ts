/**
 * Sandbox receipts: the verification record for a run of checks inside a
 * sandbox, as an in-toto statement like ProofPacks (ADR 0012). The subject
 * is the project snapshot the checks ran against (a digest of every file's
 * path and content digest), so a receipt says exactly what was tested.
 *
 * The verdict comes only from real exit codes. A check that didn't run is
 * "not run", never passing. The receipt is evidence for Guard and the task
 * state machine; it never authorizes a deployment by itself.
 */
import { verificationEvent } from "../execution/sandbox";
import { proofPackStatus, IN_TOTO_STATEMENT_TYPE, type ProofPackStatus } from "../proof/proofpack";
import type { CheckResult } from "../realityloop/task-machine";
import { canonicalHash } from "../trust/canonical-json";
import type { FailureCategory } from "./failures";
import type { EgressRules } from "./network";

/** Placeholder predicate URI, like the ProofPack one; replace with an owned domain before signing. */
export const SANDBOX_RECEIPT_PREDICATE_TYPE = "https://farbaek.dev/sandbox-receipt/v1";

export interface ReceiptCheck {
  name: string;
  command: string;
  /** null when the check didn't run or didn't finish. */
  exitCode: number | null;
  durationMs: number | null;
  failure: FailureCategory | null;
  stdoutSha256: string | null;
  stderrSha256: string | null;
}

export interface ReceiptInput {
  session: { id: string; organizationId: string; projectId: string | null; taskId: string | null };
  runtime: {
    provider: string;
    isolation: string;
    template: string;
    image: string;
    vcpu: number | null;
    memoryMiB: number | null;
    egress: EgressRules;
  };
  policy: { version: string; outcome: string };
  /** Digest of the uploaded file set, or null when no project files were copied in. */
  snapshot: { sha256: string; files: number } | null;
  checks: ReceiptCheck[];
  /** The task's latest ProofPack digest, when the run verifies an applied change. */
  proofPackDigest: string | null;
  createdAt: string;
}

export interface SandboxReceiptStatement {
  _type: typeof IN_TOTO_STATEMENT_TYPE;
  subject: { name: string; digest: { sha256: string } }[];
  predicateType: typeof SANDBOX_RECEIPT_PREDICATE_TYPE;
  predicate: {
    schema: "farbaek.sandbox-receipt/v1";
    status: ProofPackStatus;
    session: ReceiptInput["session"];
    runtime: ReceiptInput["runtime"];
    policy: ReceiptInput["policy"];
    snapshot: ReceiptInput["snapshot"];
    checks: (ReceiptCheck & { status: "passed" | "failed" | "not_run" })[];
    verdict: { taskEvent: "mark_verified" | "mark_partially_verified" | "mark_failed" | null; proofPackDigest: string | null };
    deployment: { authorized: false; reason: string };
    limits: string[];
    createdAt: string;
  };
}

export function toCheckResult(c: ReceiptCheck): CheckResult {
  return { name: c.name, command: c.command, exitCode: c.exitCode };
}

/** Digest of a file set: the canonical hash of sorted (path, sha256) pairs. */
export function snapshotDigest(files: readonly { path: string; sha256: string }[]): Promise<string> {
  return canonicalHash([...files].map((f) => ({ path: f.path, sha256: f.sha256 })).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)));
}

export function buildSandboxReceipt(input: ReceiptInput): SandboxReceiptStatement {
  const results = input.checks.map(toCheckResult);
  const status = proofPackStatus(results);
  const taskEvent = input.session.taskId ? verificationEvent(results, input.proofPackDigest !== null) : null;
  const limits = [
    "This record proves which commands ran against which files, with their real exit codes. It doesn't prove the code is secure or correct beyond those checks.",
    `Isolation as reported by ${input.runtime.provider}: ${input.runtime.isolation}.`,
  ];
  if (input.snapshot === null) limits.push("No project files were copied into the sandbox for this run.");
  if (results.length === 0) limits.push("No checks ran, so nothing was verified.");
  if (results.some((r) => r.exitCode === null)) limits.push("Some checks didn't finish; they count as not run.");
  if (status !== "verified") limits.push("Not verified.");

  return {
    _type: IN_TOTO_STATEMENT_TYPE,
    subject: [
      input.snapshot
        ? { name: "project-snapshot", digest: { sha256: input.snapshot.sha256 } }
        : { name: "no-project-files", digest: { sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" } },
    ],
    predicateType: SANDBOX_RECEIPT_PREDICATE_TYPE,
    predicate: {
      schema: "farbaek.sandbox-receipt/v1",
      status,
      session: input.session,
      runtime: input.runtime,
      policy: input.policy,
      snapshot: input.snapshot,
      checks: input.checks.map((c) => ({ ...c, status: c.exitCode === null ? "not_run" : c.exitCode === 0 ? "passed" : "failed" })),
      verdict: { taskEvent, proofPackDigest: input.proofPackDigest },
      deployment: { authorized: false, reason: "Sandbox results are evidence only. Deploying needs the separate, approved deploy workflow." },
      limits,
      createdAt: input.createdAt,
    },
  };
}

export function sandboxReceiptDigest(statement: SandboxReceiptStatement): Promise<string> {
  return canonicalHash(statement);
}
