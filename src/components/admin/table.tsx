import type { ReactNode } from "react";

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
  return <td className={`px-4 py-3 align-top ${mono ? "font-mono text-[0.8125rem] tabular" : ""} ${muted ? "text-ink-3" : "text-ink"}`}>{children}</td>;
}

/** A small outlined chip. The text carries the meaning; colour only supports it. */
export function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "approval" | "verified" | "failed" }) {
  const tones = {
    neutral: "border-line text-ink-2",
    accent: "border-accent/40 text-accent",
    approval: "border-approval/40 text-approval",
    verified: "border-verified/40 text-verified",
    failed: "border-failed/40 text-failed",
  } as const;
  return <span className={`inline-flex h-6 items-center whitespace-nowrap rounded-full border px-2.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}
