import { canonicalHash } from "@/core/trust/canonical-json";
import { verifyProofPack } from "./proofpack";

interface Evidence {
  status: string;
  statement: unknown;
  digest: string;
}

export interface TaskSeal {
  digest: string;
  caption: string;
}

function ranAgainstAppliedFiles(statement: unknown): boolean {
  const predicate = (statement as { predicate?: { appliedChange?: { matched?: unknown } } } | null)?.predicate;
  return predicate?.appliedChange?.matched === true;
}

/**
 * The Seal for a finished task (ADR 0172), with both lists newest first. It fails closed: the newest record decides, so
 * an older success can't stand in for a damaged record or a newer failure. A check receipt counts only if it ran
 * against the files that were applied. Null means no Seal, which is never drawn without verified evidence.
 */
export async function verifiedSeal(packs: readonly Evidence[], receipts: readonly Evidence[]): Promise<TaskSeal | null> {
  const [pack] = packs;
  const [receipt] = receipts;
  if (receipt && receipt.status !== "verified") return null;
  if (pack) {
    const intact = pack.status === "verified" && (await verifyProofPack(pack.statement, pack.digest).catch(() => ({ intact: false }))).intact;
    return intact ? { digest: pack.digest, caption: "Farbaek ProofPack" } : null;
  }
  if (!receipt || !ranAgainstAppliedFiles(receipt.statement)) return null;
  const intact = (await canonicalHash(receipt.statement).catch(() => null)) === receipt.digest;
  return intact ? { digest: receipt.digest, caption: "Farbaek verified checks" } : null;
}
