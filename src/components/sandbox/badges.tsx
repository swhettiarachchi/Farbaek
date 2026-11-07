import {
  CheckCircleIcon,
  CircleNotchIcon,
  PauseCircleIcon,
  PlayCircleIcon,
  ProhibitIcon,
  StopCircleIcon,
  TimerIcon,
  WarningIcon,
  XCircleIcon,
} from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import { EXECUTION_STATE_LABELS, SESSION_STATE_LABELS, type ExecutionState, type SessionState } from "@/core/sandbox/lifecycle";

// Status is a word in its colour and border pattern (ADR 0180): a spinner while live, an icon for how it ended, none while it waits.
const SESSION: Record<SessionState, { icon: Icon | null; className: string; live?: boolean }> = {
  requested: { icon: null, className: "text-info border-info/40" },
  provisioning: { icon: CircleNotchIcon, className: "text-info border-info/40", live: true },
  ready: { icon: PlayCircleIcon, className: "text-verified border-verified/40" },
  paused: { icon: PauseCircleIcon, className: "text-approval border-approval/40" },
  stopping: { icon: CircleNotchIcon, className: "text-info border-info/40", live: true },
  terminated: { icon: StopCircleIcon, className: "text-unverified border-unverified/60 border-dashed" },
  expired: { icon: TimerIcon, className: "text-unverified border-unverified/60 border-dashed" },
  failed: { icon: XCircleIcon, className: "text-failed border-failed/40" },
};

const EXECUTION: Record<ExecutionState, { icon: Icon; className: string; live?: boolean }> = {
  running: { icon: CircleNotchIcon, className: "text-info border-info/40", live: true },
  succeeded: { icon: CheckCircleIcon, className: "text-verified border-verified/40" },
  failed: { icon: XCircleIcon, className: "text-failed border-failed/40" },
  timed_out: { icon: TimerIcon, className: "text-approval border-approval/40" },
  cancelled: { icon: ProhibitIcon, className: "text-unverified border-unverified/60 border-dashed" },
  error: { icon: WarningIcon, className: "text-failed border-failed/40 border-dashed" },
};

function Pill({ icon: PillIcon, className, live, label }: { icon: Icon | null; className: string; live?: boolean; label: string }) {
  return (
    <span className={`inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium ${className}`}>
      {PillIcon ? <PillIcon size={14} weight="bold" aria-hidden className={live ? "motion-safe:animate-spin" : undefined} /> : null}
      {label}
    </span>
  );
}

export function SessionStateBadge({ state }: { state: SessionState }) {
  return <Pill {...SESSION[state]} label={SESSION_STATE_LABELS[state]} />;
}

export function ExecutionStateBadge({ state, exitCode }: { state: ExecutionState; exitCode: number | null }) {
  const label = state === "failed" && exitCode !== null ? `Exit ${exitCode}` : EXECUTION_STATE_LABELS[state];
  return <Pill {...EXECUTION[state]} label={label} />;
}
