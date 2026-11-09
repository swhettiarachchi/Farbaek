import type { Status } from "@/components/ui/status-badge";
import type { EvidenceStatus } from "@/core/publish/evidence";

/**
 * Where the proof for the latest change stands, as a status kind (ADR 0183): partly verified, or files changed
 * since, need a look; no proof yet is "not yet". The publish panel and the launch panels share it.
 */
export const EVIDENCE_KIND: Record<EvidenceStatus, Status> = {
  verified: "verified",
  partially_verified: "attention",
  changed: "attention",
  failed: "failed",
  unverified: "unverified",
  none: "unverified",
};
