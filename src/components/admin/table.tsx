import type { ReactNode } from "react";
import { STATUS_KINDS, type Status } from "@/components/ui/status-badge";

/**
 * A dense table for the admin console. On narrow screens the table scrolls
 * inside its own frame, never the page.
 */
export function AdminTable({ caption, columns, children }: { caption: string; columns: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-surface shadow-e1">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line bg-canvas-2">
            {columns.map((c) => (
              <th key={c} scope="col" className="whitespace-nowrap px-4 py-2.5 text-xs font-medium text-ink-3">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export function Cell({ children, mono = false, muted = false }: { children: ReactNode; mono?: boolean; muted?: boolean }) {
  return <td className={`px-4 py-3 align-top ${mono ? "font-mono text-label tabular" : ""} ${muted ? "text-ink-3" : "text-ink"}`}>{children}</td>;
}

/**
 * A small chip (ADR 0183). With a `kind` it's a state: the kind's icon, colour and border with the words. Without
 * one it's a tag (a role, a plan, a topic): a neutral pill with no icon.
 */
export function Chip({ children, kind }: { children: ReactNode; kind?: Status }) {
  if (!kind) return <span className="inline-flex h-6 items-center whitespace-nowrap rounded-full border border-line-2 px-2.5 text-xs font-medium text-ink-2">{children}</span>;
  const { icon: KindIcon, weight, className } = STATUS_KINDS[kind];
  return (
    <span className={`inline-flex h-6 w-fit items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium ${className}`}>
      <KindIcon size={14} weight={weight} className={`shrink-0 ${kind === "working" ? "motion-safe:animate-spin" : ""}`} aria-hidden />
      {children}
    </span>
  );
}
