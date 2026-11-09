import { InfoIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { TASK_STATE_LABELS, stateKind } from "@/core/realityloop/progress";
import type { TaskState } from "@/core/realityloop/task-machine";

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <h1 className="text-balance text-[1.75rem] font-medium leading-tight tracking-[-0.03em] sm:text-[2.1rem]">{title}</h1>
        {description ? <p className="mt-2 max-w-[62ch] text-[0.9375rem] leading-relaxed text-ink-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex min-w-0 flex-wrap gap-2 lg:justify-end">{actions}</div> : null}
    </div>
  );
}

export function TaskStateBadge({ state }: { state: TaskState }) {
  return <StatusBadge status={stateKind(state)} label={TASK_STATE_LABELS[state]} />;
}

/**
 * A section's title with its icon (ADR 0183): 20px, outlined, in the quiet ink, so every section on a page is
 * marked the same way and the words stay first. The icon names what the section is about.
 */
export function CardTitle({ icon: TitleIcon, children, id, className = "" }: { icon: Icon; children: ReactNode; id?: string; className?: string }) {
  return (
    <h2 id={id} className={`flex items-center gap-2.5 text-lg font-medium ${className}`}>
      <TitleIcon size={20} className="shrink-0 text-ink-3" aria-hidden />
      <span className="min-w-0">{children}</span>
    </h2>
  );
}

export function Card({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`rounded-md border border-line bg-surface p-5 shadow-e1 sm:p-6 ${className}`}>
      {children}
    </section>
  );
}

export function EmptyState({ icon: EmptyIcon, title, children, action }: { icon: Icon; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-md border border-line bg-surface px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-surface text-ink-2 shadow-e1 ring-1 ring-line">
        <EmptyIcon size={24} aria-hidden />
      </span>
      <h2 className="mt-4 text-lg font-medium">{title}</h2>
      <p className="mt-1.5 max-w-[46ch] text-[0.9375rem] leading-relaxed text-ink-2">{children}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

/** A note on a neutral surface; the icon's colour says what kind (ADR 0183): steel for information, burnt orange for a warning. */
export function Notice({ tone = "info", children }: { tone?: "info" | "warning"; children: ReactNode }) {
  const NoticeIcon = tone === "info" ? InfoIcon : WarningCircleIcon;
  return (
    <p className="flex items-start gap-2.5 rounded-sm border border-line bg-surface-raised/70 px-4 py-3 text-sm text-ink">
      <NoticeIcon size={16} weight="fill" className={`mt-0.5 shrink-0 ${tone === "info" ? "text-info" : "text-caution"}`} aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export function StatTile({ label, value, detail, href }: { label: string; value: ReactNode; detail: string; href?: string }) {
  const body = (
    <>
      <p className="text-sm text-ink-2">{label}</p>
      <p className="mt-2 text-[1.75rem] font-medium leading-none tracking-[-0.03em] tabular sm:text-[2rem]">{value}</p>
      <p className="mt-3 text-xs leading-relaxed text-ink-3">{detail}</p>
    </>
  );
  const cls = "block rounded-md border border-line bg-surface p-4 shadow-e1 sm:p-5 transition-[box-shadow,transform] duration-200";
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
  const bar = level === "reached" ? "bg-failed" : level === "warning" ? "bg-caution" : "bg-accent";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-sm text-ink-2 tabular">
          {number.format(used)} <span className="text-ink-3">{limit === null ? ", no fixed limit" : `of ${number.format(limit)}`}</span>
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
      <p className={`mt-1.5 text-xs ${level === "ok" ? "text-ink-3" : level === "warning" ? "text-caution" : "text-failed"}`}>
        {level === "reached" ? reached : level === "warning" ? `Over 80% used. ${detail ?? ""}` : detail}
      </p>
    </div>
  );
}
