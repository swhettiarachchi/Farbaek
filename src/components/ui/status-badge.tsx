import { CheckCircleIcon, CircleDashedIcon, CircleNotchIcon, ClockIcon, ClockUserIcon, EyeIcon, InfoIcon, MinusCircleIcon, PauseCircleIcon, ProhibitIcon, WarningCircleIcon, XCircleIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";

/**
 * Where something stands (ADR 0183). Every kind has its words, its icon, its colour and its border, so no state
 * relies on one of them alone, and no chip sits beside another without a mark. Filled icons report a state; the
 * two outlined ones mean "not yet" (a dashed circle) and "working" (a turning circle, still under reduced motion).
 */
export type Status =
  | "verified"
  | "done"
  | "approval"
  | "pending"
  | "working"
  | "attention"
  | "paused"
  | "failed"
  | "blocked"
  | "unverified"
  | "off"
  | "info"
  | "simulated";

interface Kind {
  label: string;
  icon: Icon;
  weight: "fill" | "bold";
  className: string;
}

export const STATUS_KINDS: Record<Status, Kind> = {
  /** Done and proven. */
  verified: { label: "Verified", icon: CheckCircleIcon, weight: "fill", className: "text-verified border-verified/35 bg-verified/[0.05]" },
  /** Finished, without a proof behind it. */
  done: { label: "Done", icon: CheckCircleIcon, weight: "fill", className: "text-ink-2 border-line-2" },
  /** A person has to decide or act: the brand's blue is "your turn". */
  approval: { label: "Waiting for approval", icon: ClockUserIcon, weight: "fill", className: "text-approval border-approval/35 bg-approval/[0.06]" },
  /** Waiting on someone else, or on a system. */
  pending: { label: "Waiting", icon: ClockIcon, weight: "fill", className: "text-info border-info/30" },
  /** Work going on now. */
  working: { label: "Working", icon: CircleNotchIcon, weight: "bold", className: "text-info border-info/30" },
  /** Look at it before going on; nobody has to decide. */
  attention: { label: "Needs a look", icon: WarningCircleIcon, weight: "fill", className: "text-caution border-caution/35" },
  /** Stopped for now, and can go on. */
  paused: { label: "Paused", icon: PauseCircleIcon, weight: "fill", className: "text-caution border-caution/35" },
  /** Ended badly. */
  failed: { label: "Failed", icon: XCircleIcon, weight: "fill", className: "text-failed border-failed/35 bg-failed/[0.05]" },
  /** Stopped by a rule. */
  blocked: { label: "Blocked", icon: ProhibitIcon, weight: "fill", className: "text-failed border-failed/35" },
  /** Not yet: not run, not checked, not tried. */
  unverified: { label: "Not verified", icon: CircleDashedIcon, weight: "bold", className: "text-unverified border-unverified/50 border-dashed" },
  /** Ended without a result, or switched off. */
  off: { label: "Off", icon: MinusCircleIcon, weight: "fill", className: "text-ink-3 border-line-2 border-dashed" },
  /** A neutral fact. */
  info: { label: "Info", icon: InfoIcon, weight: "fill", className: "text-info border-info/30" },
  /** Sample or practice data. */
  simulated: { label: "Sample", icon: EyeIcon, weight: "fill", className: "text-simulated border-line-2 bg-surface-raised" },
};

/** The kind's icon on its own, in its colour, for rows and step lists. */
export function StatusGlyph({ status, size = 16, className = "" }: { status: Status; size?: 14 | 16 | 20 | 24; className?: string }) {
  const { icon: KindIcon, weight, className: tone } = STATUS_KINDS[status];
  const color = tone.split(" ").find((c) => c.startsWith("text-")) ?? "text-ink-3";
  return <KindIcon size={size} weight={weight} className={`shrink-0 ${color} ${status === "working" ? "motion-safe:animate-spin" : ""} ${className}`} aria-hidden />;
}

export function StatusBadge({ status, label }: { status: Status; label?: string }) {
  const { icon: KindIcon, weight, className, label: fallback } = STATUS_KINDS[status];
  return (
    <span className={`inline-flex h-6 w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium ${className}`}>
      <KindIcon size={14} weight={weight} className={`shrink-0 ${status === "working" ? "motion-safe:animate-spin" : ""}`} aria-hidden />
      {label ?? fallback}
    </span>
  );
}
