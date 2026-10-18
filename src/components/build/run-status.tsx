import { CheckCircleIcon, CircleNotchIcon, HourglassMediumIcon, PauseCircleIcon, ProhibitIcon, XCircleIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import { RUN_STATUS_LABELS, type RunStatus } from "@/core/agent/cloud-run";

// Colour is never the only signal: each state has its own icon, label and border.
const STYLE: Record<RunStatus, { icon: Icon; className: string; spin?: boolean }> = {
  starting: { icon: CircleNotchIcon, className: "text-info border-info/40", spin: true },
  working: { icon: CircleNotchIcon, className: "text-info border-info/40", spin: true },
  waiting: { icon: HourglassMediumIcon, className: "text-approval border-approval/40" },
  finished: { icon: CheckCircleIcon, className: "text-ink border-line-strong/50" },
  failed: { icon: XCircleIcon, className: "text-failed border-failed/40" },
  cancelled: { icon: ProhibitIcon, className: "text-ink-3 border-line-strong/50 border-dashed" },
  interrupted: { icon: PauseCircleIcon, className: "text-approval border-approval/40 border-dashed" },
};

export function RunStatusBadge({ status }: { status: RunStatus }) {
  const s = STYLE[status];
  return (
    <span className={`inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium ${s.className}`}>
      <s.icon size={14} weight="bold" className={s.spin ? "motion-safe:animate-spin" : undefined} aria-hidden />
      {RUN_STATUS_LABELS[status]}
    </span>
  );
}
