import { InfoIcon, WarningIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { TASK_STATE_LABELS, stateTone } from "@/core/realityloop/progress";
import type { TaskState } from "@/core/realityloop/task-machine";

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-balance text-[1.75rem] font-medium leading-tight tracking-[-0.03em] sm:text-[2.1rem]">{title}</h1>
        {description ? <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-ink-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function TaskStateBadge({ state }: { state: TaskState }) {
  return <StatusBadge status={stateTone(state)} label={TASK_STATE_LABELS[state]} />;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-md border border-line bg-surface p-5 shadow-e1 sm:p-6 ${className}`}>{children}</section>;
}

export function EmptyState({ icon: EmptyIcon, title, children, action }: { icon: Icon; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-md border border-dashed border-line-strong/40 bg-surface px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-accent/[0.08] text-accent">
        <EmptyIcon size={24} aria-hidden />
      </span>
      <h2 className="mt-4 text-lg font-medium">{title}</h2>
      <p className="mt-1.5 max-w-[46ch] text-[15px] leading-relaxed text-ink-2">{children}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warning"; children: ReactNode }) {
  const NoticeIcon = tone === "info" ? InfoIcon : WarningIcon;
  return (
    <p
      className={`flex items-start gap-2.5 rounded-sm border px-4 py-3 text-sm text-ink ${
        tone === "info" ? "border-info/25 bg-info/[0.05]" : "border-approval/30 bg-approval/[0.06]"
      }`}
    >
      <NoticeIcon size={18} weight="bold" className={`mt-px shrink-0 ${tone === "info" ? "text-info" : "text-approval"}`} aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export function StatTile({ label, value, detail, href }: { label: string; value: ReactNode; detail: string; href?: string }) {
  const body = (
    <>
      <p className="text-sm text-ink-2">{label}</p>
      <p className="mt-2 text-[2rem] font-medium leading-none tracking-[-0.03em] tabular">{value}</p>
      <p className="mt-3 text-xs leading-relaxed text-ink-3">{detail}</p>
    </>
  );
  const cls = "block rounded-md border border-line bg-surface p-5 shadow-e1 transition-[box-shadow,transform] duration-200";
  return href ? (
    <a href={href} className={`${cls} hover:-translate-y-0.5 hover:shadow-e2`}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}

const number = new Intl.NumberFormat("en-US");

/** A usage bar with the 80% warning and 100% limit states. `limit` null means "set by contract". */
export function UsageMeter({
  label,
  used,
  limit,
  detail,
  reached = "Limit reached.",
}: {
  label: string;
  used: number;
  limit: number | null;
  detail?: string;
  /** What happens at the limit, specific to this meter. */
  reached?: string;
}) {
  const pct = limit && limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const level = limit === null ? "ok" : used >= limit ? "reached" : used >= limit * 0.8 ? "warning" : "ok";
  const bar = level === "reached" ? "bg-failed" : level === "warning" ? "bg-approval" : "bg-accent";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-sm text-ink-2 tabular">
          {number.format(used)} <span className="text-ink-3">of {limit === null ? "contract" : number.format(limit)}</span>
        </p>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-raised"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit ?? undefined}
        aria-valuenow={used}
      >
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.max(pct, used > 0 ? 2 : 0)}%` }} />
      </div>
      <p className={`mt-1.5 text-xs ${level === "ok" ? "text-ink-3" : level === "warning" ? "text-approval" : "text-failed"}`}>
        {level === "reached" ? reached : level === "warning" ? `Over 80% used. ${detail ?? ""}` : detail}
      </p>
    </div>
  );
}
