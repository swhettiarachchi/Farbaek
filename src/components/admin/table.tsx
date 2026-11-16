import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { STATUS_KINDS, type Status } from "@/components/ui/status-badge";

/**
 * A dense table for the admin console. From a tablet up it's a table that scrolls inside its own frame, never the page. On a
 * phone each row is a card, its cells one under another with their column's name beside them (ADR 0211). The roles keep it a
 * table to a screen reader while it's laid out as cards.
 */
export function AdminTable({ caption, columns, children }: { caption: string; columns: string[]; children: ReactNode }) {
  // Each cell learns its column's name, shown beside it on a phone.
  const rows = Children.map(children, (row) => {
    if (!isValidElement(row)) return row;
    const r = row as ReactElement<{ children?: ReactNode }>;
    let i = 0;
    const cells = Children.map(r.props.children, (cell) => {
      if (!isValidElement(cell)) return cell;
      const label = columns[i++] ?? "";
      return cell.type === Cell ? cloneElement(cell as ReactElement<{ label?: string }>, { label }) : cloneElement(cell as ReactElement<Record<string, unknown>>, { "data-label": label, role: "cell" });
    });
    return cloneElement(r as ReactElement<Record<string, unknown>>, { role: "row" }, cells);
  });
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-surface shadow-e1">
      <table role="table" className="w-full border-collapse text-left text-sm max-md:block md:min-w-[640px]">
        <caption className="sr-only">{caption}</caption>
        <thead className="max-md:sr-only">
          <tr role="row" className="border-b border-line bg-canvas-2">
            {columns.map((c) => (
              <th key={c} role="columnheader" scope="col" className="whitespace-nowrap px-4 py-2.5 text-xs font-medium text-ink-3">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line max-md:block max-md:[&>tr]:grid max-md:[&>tr]:gap-1.5 max-md:[&>tr]:px-4 max-md:[&>tr]:py-3">{rows}</tbody>
      </table>
    </div>
  );
}

export function Cell({ children, mono = false, muted = false, label }: { children: ReactNode; mono?: boolean; muted?: boolean; label?: string }) {
  return (
    <td
      role="cell"
      data-label={label}
      className={`px-4 py-3 align-top max-md:grid max-md:grid-cols-[7.5rem_minmax(0,1fr)] max-md:gap-3 max-md:p-0 max-md:before:text-xs max-md:before:text-ink-3 max-md:before:content-[attr(data-label)] ${mono ? "font-mono text-label tabular" : ""} ${muted ? "text-ink-3" : "text-ink"}`}
    >
      {children}
    </td>
  );
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
