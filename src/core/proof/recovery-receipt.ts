/**
 * Recovery receipts: the evidence record for undoing an applied change,
 * emitted as an in-toto statement like a ProofPack. Subjects are the
 * restored file contents and the ProofPack of the change being undone.
 * The predicate records who approved which exact plan, the policy decision,
 * what each file went from and to, what was left alone and why, and the
 * record's own limits.
 *
 * The database writes this record only after checking, in the same
 * transaction, that each restored file holds the earlier revision's exact
 * content and each removed file is gone. So "recovered" here means the
 * files were verified back at their earlier state. It doesn't mean any
 * checks ran on them.
 */
import type { ReadyItem } from "../realityloop/recovery";
import { canonicalHash } from "../trust/canonical-json";
import { IN_TOTO_STATEMENT_TYPE } from "./proofpack";

/** Placeholder predicate URI, like the ProofPack's (ADR 0012); replace with an owned domain before signing. */
export const RECOVERY_PREDICATE_TYPE = "https://farbaek.dev/recovery/v1";

export type RecoveryStatus = "recovered" | "partially_recovered";

export interface RecoveryReceiptInput {
  task: { id: string; organizationId: string; projectId: string };
  proposal: { id: string; sha256: string };
  /** Digest of the change's ProofPack, or null for a change recorded before ProofPacks. */
  proofPack: string | null;
  plan: { sha256: string };
  operationSha256: string;
  policy: { outcome: string; version: string; findings: { rule: string; outcome: string; detail: string }[] };
  approval: { approvedBy: string; approvedAt: string };
  operations: readonly ReadyItem[];
  /** Files that weren't undone by this operation, and why. */
  left: readonly { path: string; reason: "changed" | "deleted" | "not_selected" }[];
  complete: boolean;
  createdAt: string;
}

export interface RecoveryReceipt {
  _type: typeof IN_TOTO_STATEMENT_TYPE;
  subject: { name: string; digest: { sha256: string } }[];
  predicateType: typeof RECOVERY_PREDICATE_TYPE;
  predicate: {
    schema: "farbaek.recovery/v1";
    status: RecoveryStatus;
    task: RecoveryReceiptInput["task"];
    proposal: RecoveryReceiptInput["proposal"];
    proofPack: string | null;
    plan: { sha256: string };
    operationSha256: string;
    policy: RecoveryReceiptInput["policy"];
    approval: RecoveryReceiptInput["approval"];
    operations: { path: string; action: "restore" | "remove"; fromRevision: number; fromSha256: string; toRevision: number | null; toSha256: string | null }[];
    left: RecoveryReceiptInput["left"];
    verification: string;
    limits: string[];
    createdAt: string;
  };
}

const byPath = (a: { path: string }, b: { path: string }) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

function limitsFor(input: RecoveryReceiptInput): string[] {
  const limits = [
    "This record proves the integrity and origin of what it contains. It does not prove that external claims in it are true.",
    "Only project files in Farbaek were undone. Anything done elsewhere with the applied change, such as a deploy, isn't undone by this.",
    "No checks ran on the restored files. Recovered means the files are back at their earlier content, not that the project works.",
  ];
  const conflicts = input.left.filter((l) => l.reason !== "not_selected");
  if (conflicts.length) {
    const one = conflicts.length === 1;
    limits.push(`${conflicts.length} ${one ? "file was left as it is because it" : "files were left as they are because they"} changed after the change was applied. Newer changes are never overwritten.`);
  }
  if (!input.complete) limits.push("Partial: the task stays in recovery pending until every file the change wrote is back.");
  if (input.proofPack === null) limits.push("The change being undone has no ProofPack, so this record can't link to one.");
  return limits;
}

export function buildRecoveryReceipt(input: RecoveryReceiptInput): RecoveryReceipt {
  const operations = [...input.operations].sort(byPath).map((o) =>
    o.action === "restore"
      ? { path: o.path, action: o.action, fromRevision: o.fromRevision, fromSha256: o.fromSha256, toRevision: o.toRevision, toSha256: o.toSha256 }
      : { path: o.path, action: o.action, fromRevision: o.fromRevision, fromSha256: o.fromSha256, toRevision: null, toSha256: null },
  );
  const subject = [
    ...operations.flatMap((o) => (o.toSha256 ? [{ name: o.path, digest: { sha256: o.toSha256 } }] : [])),
    ...(input.proofPack ? [{ name: `proofpack:${input.proofPack}`, digest: { sha256: input.proofPack } }] : []),
  ];
  return {
    _type: IN_TOTO_STATEMENT_TYPE,
    subject,
    predicateType: RECOVERY_PREDICATE_TYPE,
    predicate: {
      schema: "farbaek.recovery/v1",
      status: input.complete ? "recovered" : "partially_recovered",
      task: input.task,
      proposal: input.proposal,
      proofPack: input.proofPack,
      plan: input.plan,
      operationSha256: input.operationSha256,
      policy: input.policy,
      approval: input.approval,
      operations,
      left: [...input.left].sort(byPath),
      verification:
        "In the same database transaction, before this record was saved: each restored file's content digest matched the earlier revision, and each removed file was gone from the project.",
      limits: limitsFor(input),
      createdAt: input.createdAt,
    },
  };
}

export function recoveryReceiptDigest(receipt: RecoveryReceipt): Promise<string> {
  return canonicalHash(receipt);
}
