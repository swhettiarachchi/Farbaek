import { CheckCircleIcon, CircleNotchIcon, XCircleIcon } from "@phosphor-icons/react/ssr";
import { STEP_WORDS, WORKFLOW_WORDS, type StepStatus, type WorkflowStatus } from "@/core/realityloop/workflow";

// A state is its words alone (ADR 0180): a spinner while it runs, a mark only for done and failed.
const STEP_ICON: Record<StepStatus, { icon: typeof CheckCircleIcon | null; tone: string; live?: boolean }> = {
  pending: { icon: null, tone: "text-ink-3" },
  running: { icon: CircleNotchIcon, tone: "text-accent", live: true },
  waiting: { icon: null, tone: "text-approval" },
  verified: { icon: CheckCircleIcon, tone: "text-verified" },
  failed: { icon: XCircleIcon, tone: "text-failed" },
  cancelled: { icon: null, tone: "text-ink-3" },
};

const WORKFLOW_ICON: Record<WorkflowStatus, { icon: typeof CheckCircleIcon | null; tone: string; ring: string; live?: boolean }> = {
  draft: { icon: null, tone: "text-ink-3", ring: "border-line" },
  approved: { icon: CheckCircleIcon, tone: "text-accent", ring: "border-accent/40" },
  running: { icon: CircleNotchIcon, tone: "text-accent", ring: "border-accent/40", live: true },
  waiting: { icon: null, tone: "text-approval", ring: "border-approval/40" },
  halted: { icon: XCircleIcon, tone: "text-failed", ring: "border-failed/40" },
  finished: { icon: CheckCircleIcon, tone: "text-verified", ring: "border-verified/40" },
  cancelled: { icon: null, tone: "text-ink-3", ring: "border-line" },
};

/** A step's state in words, with a mark only when it ended. */
export function StepStatusBadge({ status }: { status: StepStatus }) {
  const s = STEP_ICON[status];
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm ${Icon && !s.live ? "text-ink" : s.tone}`}>
      {Icon ? <Icon size={18} weight={s.live ? "bold" : "fill"} className={`shrink-0 ${s.tone} ${s.live ? "motion-safe:animate-spin" : ""}`} aria-hidden /> : null} {STEP_WORDS[status]}
    </span>
  );
}

/** A workflow's state as a pill: its words, with a mark only when it ended. */
export function WorkflowStatusChip({ status }: { status: WorkflowStatus }) {
  const s = WORKFLOW_ICON[status];
  const Icon = s.icon;
  return (
    <span className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium ${Icon && !s.live ? "text-ink" : s.tone} ${s.ring}`}>
      {Icon ? <Icon size={16} weight={s.live ? "bold" : "fill"} className={`${s.tone} ${s.live ? "motion-safe:animate-spin" : ""}`} aria-hidden /> : null} {WORKFLOW_WORDS[status]}
    </span>
  );
}
