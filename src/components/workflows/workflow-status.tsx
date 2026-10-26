import { CheckCircleIcon, CircleDashedIcon, ClockIcon, HourglassMediumIcon, MinusCircleIcon, XCircleIcon } from "@phosphor-icons/react/ssr";
import { STEP_WORDS, WORKFLOW_WORDS, type StepStatus, type WorkflowStatus } from "@/core/realityloop/workflow";

const STEP_ICON: Record<StepStatus, { icon: typeof CheckCircleIcon; tone: string }> = {
  pending: { icon: CircleDashedIcon, tone: "text-ink-3" },
  running: { icon: ClockIcon, tone: "text-accent" },
  waiting: { icon: HourglassMediumIcon, tone: "text-approval" },
  verified: { icon: CheckCircleIcon, tone: "text-verified" },
  failed: { icon: XCircleIcon, tone: "text-failed" },
  cancelled: { icon: MinusCircleIcon, tone: "text-ink-3" },
};

const WORKFLOW_ICON: Record<WorkflowStatus, { icon: typeof CheckCircleIcon; tone: string; ring: string }> = {
  draft: { icon: CircleDashedIcon, tone: "text-ink-3", ring: "border-line" },
  approved: { icon: CheckCircleIcon, tone: "text-accent", ring: "border-accent/40" },
  running: { icon: ClockIcon, tone: "text-accent", ring: "border-accent/40" },
  waiting: { icon: HourglassMediumIcon, tone: "text-approval", ring: "border-approval/40" },
  halted: { icon: XCircleIcon, tone: "text-failed", ring: "border-failed/40" },
  finished: { icon: CheckCircleIcon, tone: "text-verified", ring: "border-verified/40" },
  cancelled: { icon: MinusCircleIcon, tone: "text-ink-3", ring: "border-line" },
};

/** A step's state as an icon and words. */
export function StepStatusBadge({ status }: { status: StepStatus }) {
  const s = STEP_ICON[status];
  const Icon = s.icon;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-ink">
      <Icon size={18} weight={status === "pending" ? "regular" : "fill"} className={`shrink-0 ${s.tone}`} aria-hidden /> {STEP_WORDS[status]}
    </span>
  );
}

/** A workflow's state as a pill with an icon and words. */
export function WorkflowStatusChip({ status }: { status: WorkflowStatus }) {
  const s = WORKFLOW_ICON[status];
  const Icon = s.icon;
  return (
    <span className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium text-ink ${s.ring}`}>
      <Icon size={16} weight="fill" className={s.tone} aria-hidden /> {WORKFLOW_WORDS[status]}
    </span>
  );
}
