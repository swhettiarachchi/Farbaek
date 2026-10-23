import Link from "next/link";
import type { ReactNode } from "react";
import { sparkPath } from "@/server/office/metrics";

/**
 * A 14-day line with the latest day marked. No axes, no gridlines: it shows
 * direction at a glance; the exact numbers are in its accessible name.
 */
export function Sparkline({ values, label, format = (v) => String(v) }: { values: readonly number[]; label: string; format?: (v: number) => string }) {
  const width = 176;
  const height = 44;
  const { line, last } = sparkPath(values, width, height);
  const summary = `${label}, last 14 days: ${values.map(format).join(", ")}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={summary} className="h-auto w-28 overflow-visible sm:w-44">
      <title>{summary}</title>
      <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {last ? <circle cx={last.x} cy={last.y} r={3} fill="var(--color-surface)" stroke="var(--color-accent)" strokeWidth={1.75} /> : null}
    </svg>
  );
}

/** One headline number: label, value, one line of context, and an optional trend. */
export function KpiTile({ label, value, detail, trend, href, className = "" }: { label: string; value: ReactNode; detail: ReactNode; trend?: ReactNode; href?: string; className?: string }) {
  const body = (
    <>
      <p className="text-sm text-ink-2">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-[2rem] font-medium leading-none tracking-[-0.03em] tabular">{value}</p>
        {trend ? <div className="shrink-0 pb-0.5">{trend}</div> : null}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-3">{detail}</p>
    </>
  );
  const cls = `block rounded-md border border-line bg-surface p-5 shadow-e1 ${className}`;
  return href ? (
    <Link href={href} className={`${cls} transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-e2 motion-reduce:hover:translate-y-0`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
