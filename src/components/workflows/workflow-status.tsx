import { StatusBadge, StatusGlyph, type Status } from "@/components/ui/status-badge";
import { STEP_WORDS, WORKFLOW_WORDS, type StepStatus, type WorkflowStatus } from "@/core/realityloop/workflow";

// Every state is its kind (ADR 0183): its words, icon, colour and border together, with no blank where an icon was.
const STEP_KIND: Record<StepStatus, Status> = {
  pending: "unverified",
  running: "working",
  waiting: "approval",
  verified: "verified",
  failed: "failed",
  cancelled: "off",
};

const WORKFLOW_KIND: Record<WorkflowStatus, Status> = {
  draft: "unverified",
  approved: "done",
  running: "working",
  waiting: "approval",
  halted: "failed",
  finished: "verified",
  cancelled: "off",
};

/** A step's state in a step list: its kind's icon and its words. */
export function StepStatusBadge({ status }: { status: StepStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-ink">
      <StatusGlyph status={STEP_KIND[status]} />
      {STEP_WORDS[status]}
    </span>
  );
}

/** A workflow's state as a pill. */
export function WorkflowStatusChip({ status }: { status: WorkflowStatus }) {
  return <StatusBadge status={WORKFLOW_KIND[status]} label={WORKFLOW_WORDS[status]} />;
}
