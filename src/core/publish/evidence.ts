/**
 * The Launch Evidence Gate (ADR 0050): what evidence covers a project's
 * files before they go live. The database repeats this rule in
 * `private.launch_evidence` and has the final word.
 *
 * Evidence rests on the latest applied change, not the newest ProofPack: a
 * check run for an earlier change can land after a later change was applied,
 * and hand edits, undos and imports write files without any ProofPack.
 */
export type EvidenceStatus = "verified" | "unverified" | "partially_verified" | "failed" | "changed" | "none";
type PackStatus = "unverified" | "partially_verified" | "verified" | "failed";

/** A ProofPack as the gate reads it. `verifies` is the change ProofPack a check run verified, or null for a change's own. */
export interface EvidencePack {
  digest: string;
  status: PackStatus;
  createdAt: string;
  taskId: string;
  verifies: string | null;
}

export interface LaunchEvidence {
  status: EvidenceStatus;
  /** The ProofPack it rests on: the latest check run of the change, else the change's own; null when there's none. */
  proofPack: string | null;
  /** The task of the latest applied change, where its checks can run. */
  taskId: string | null;
}

/**
 * `change` is the project's latest change ProofPack, `verification` the
 * latest check run of that change, and `filesChangedAt` when a file in the
 * project last changed (deletions included).
 */
export function launchEvidence(input: { change: EvidencePack | null; verification: EvidencePack | null; filesChangedAt: string | null }): LaunchEvidence {
  const { change, verification } = input;
  if (!change) return { status: "none", proofPack: null, taskId: null };
  const at = { proofPack: change.digest, taskId: change.taskId };
  if (input.filesChangedAt && Date.parse(input.filesChangedAt) > Date.parse(change.createdAt)) return { status: "changed", ...at };
  if (!verification || verification.verifies !== change.digest) return { status: change.status, ...at };
  return { status: verification.status, proofPack: verification.digest, taskId: change.taskId };
}

/** The same rule over a project's ProofPacks, newest first, as the page readers return them. */
export function evidenceFromPacks(packs: readonly EvidencePack[], filesChangedAt: string | null): LaunchEvidence {
  const change = packs.find((p) => p.verifies === null) ?? null;
  const verification = change ? (packs.find((p) => p.verifies === change.digest) ?? null) : null;
  return launchEvidence({ change, verification, filesChangedAt });
}

/** Which change ProofPack a statement verifies, from `predicate.verification.appliedProofPack`. */
export function verifiedChange(statement: unknown): string | null {
  const v = (statement as { predicate?: { verification?: { appliedProofPack?: unknown } } } | null)?.predicate?.verification?.appliedProofPack;
  return typeof v === "string" ? v : null;
}

export const OVERRIDE_REASON_MIN = 10;
export const OVERRIDE_REASON_MAX = 500;

/** Why a reason for publishing without verified evidence can't be used, or null when it can. */
export function overrideReasonProblem(reason: string): string | null {
  const length = reason.trim().length;
  if (length < OVERRIDE_REASON_MIN) return `Say why in at least ${OVERRIDE_REASON_MIN} characters.`;
  if (length > OVERRIDE_REASON_MAX) return `Keep it to ${OVERRIDE_REASON_MAX} characters or fewer.`;
  return null;
}

export const EVIDENCE_WORDS: Record<EvidenceStatus, { title: string; detail: string }> = {
  verified: { title: "Verified", detail: "The latest change's checks passed in a sandbox against exactly these files." },
  unverified: { title: "Not verified", detail: "The latest change hasn't been verified yet. Run its checks from the task." },
  partially_verified: { title: "Partly verified", detail: "Some of the latest change's checks failed." },
  failed: { title: "Checks failed", detail: "The latest change's checks failed against exactly these files." },
  changed: { title: "Files changed since", detail: "Files changed after the latest change was applied, by hand, an undo or an import, so no ProofPack covers them." },
  none: { title: "No evidence", detail: "No change in this project has a ProofPack yet, so nothing verifies these files." },
};
