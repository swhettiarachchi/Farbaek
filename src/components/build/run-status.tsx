import { StatusBadge, type Status } from "@/components/ui/status-badge";
import { RUN_STATUS_LABELS, type RunStatus } from "@/core/agent/cloud-run";

/** A run's status as one of the shared kinds (ADR 0183): its words, icon, colour and border together. */
export const RUN_STATUS_KIND: Record<RunStatus, Status> = {
  starting: "working",
  working: "working",
  waiting: "approval",
  finished: "done",
  failed: "failed",
  cancelled: "off",
  interrupted: "paused",
};

export function RunStatusBadge({ status }: { status: RunStatus }) {
  return <StatusBadge status={RUN_STATUS_KIND[status]} label={RUN_STATUS_LABELS[status]} />;
}
