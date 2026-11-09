import type { Status } from "@/components/ui/status-badge";
import type { HealthVerdict } from "@/core/launch/health";

/**
 * How a live check ended, as a status kind (ADR 0183): answering with this version is verified, an earlier version
 * still being served needs a look, and an error or no answer failed. The Launch page and the live check share it.
 */
export const VERDICT_KIND: Record<HealthVerdict, Status> = {
  live: "verified",
  previous: "attention",
  down: "failed",
  unreachable: "failed",
};
