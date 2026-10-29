import { CheckIcon, MinusIcon } from "@phosphor-icons/react/ssr";

/** One value in the plan comparison, as plain data so the phone picker (a client component) gets it too. */
export type CompareCell = { kind: "text"; text: string } | { kind: "yes" } | { kind: "no" } | { kind: "soon" };

export interface CompareRow {
  label: string;
  /** Keyed by plan id. */
  cells: Record<string, CompareCell>;
}

export interface CompareGroup {
  title: string;
  rows: CompareRow[];
}

/** Included, not included or coming soon, always with words for screen readers: never colour alone. */
export function CompareCellView({ cell }: { cell: CompareCell | undefined }) {
  if (!cell) return null;
  if (cell.kind === "text") return <>{cell.text}</>;
  if (cell.kind === "soon") return <span className="text-xs text-ink-3">Coming soon</span>;
  return cell.kind === "yes" ? (
    <>
      <CheckIcon size={18} weight="bold" className="inline text-verified" aria-hidden />
      <span className="sr-only">Included</span>
    </>
  ) : (
    <>
      <MinusIcon size={18} className="inline text-ink-3" aria-hidden />
      <span className="sr-only">Not included</span>
    </>
  );
}
