"use client";

import { useMemo, useState } from "react";
import { isBoundaryMark, isRoadEdgeCode } from "@/core/survey/autodraft";
import { codeOf, lookupCode, type CodeEntry } from "@/core/survey/codes";
import type { ImportedPoint, ImportIssue } from "@/core/survey/import/delimited";
import { StatusBadge } from "@/components/ui/status-badge";

const SHOWN = 300;

/** What a point is, by its code: a boundary mark, a line or building point, a road edge, a symbol, an unknown code, or no code. */
function roleOf(p: ImportedPoint, codes: readonly CodeEntry[]): { label: string; attention: boolean } {
  const c = codeOf(p.code);
  if (!c) return { label: "No code", attention: false };
  const entry = lookupCode(codes, c);
  if (entry) {
    if (isBoundaryMark(entry)) return { label: `Boundary mark: ${entry.meaning}`, attention: false };
    if (entry.kind === "line" || entry.kind === "outline") return { label: `${entry.kind === "outline" ? "Outline" : "Line"}: ${entry.meaning}`, attention: false };
    return { label: entry.meaning, attention: false };
  }
  if (isRoadEdgeCode(c)) return { label: "Road edge", attention: false };
  return { label: `${c} isn't in the code list`, attention: true };
}

/**
 * Every point as read (stage 194): its number, coordinates, code and what the code makes it, with the rows that need a look (an
 * unknown code, a repeat) marked and a filter to show only those. Rows the reader refused are listed by line above, not here.
 */
export function PointsTable({ points, issues, codes }: { points: readonly ImportedPoint[]; issues: readonly ImportIssue[]; codes: readonly CodeEntry[] }) {
  const [onlyAttention, setOnlyAttention] = useState(false);
  const warnedLines = useMemo(() => new Set(issues.filter((i) => i.severity === "warning" && i.line !== null).map((i) => i.line!)), [issues]);
  const rows = useMemo(
    () =>
      points.map((p) => {
        const role = roleOf(p, codes);
        return { p, role, attention: role.attention || warnedLines.has(p.line) };
      }),
    [points, codes, warnedLines],
  );
  const attention = rows.filter((r) => r.attention).length;
  const visible = (onlyAttention ? rows.filter((r) => r.attention) : rows).slice(0, SHOWN);
  // To the millimetre at least and a tenth of a millimetre at most: computed points carry more digits than any instrument.
  const fixed = (v: number) => v.toFixed(Math.min(4, Math.max(3, String(v).split(".")[1]?.length ?? 0)));
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-ink">
          {points.length} {points.length === 1 ? "point" : "points"} as read{attention > 0 ? `, ${attention} to look at` : ""}
        </h3>
        {attention > 0 ? (
          <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
            <input type="checkbox" checked={onlyAttention} onChange={(e) => setOnlyAttention(e.target.checked)} className="size-5 accent-[var(--color-accent)]" />
            Only the points to look at
          </label>
        ) : null}
      </div>
      <div className="max-h-96 overflow-auto rounded-md ring-1 ring-line">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="sticky top-0 bg-canvas-2 text-ink-2">
            <tr>
              <th scope="col" className="p-2 font-medium">Point</th>
              <th scope="col" className="p-2 text-right font-medium">Easting</th>
              <th scope="col" className="p-2 text-right font-medium">Northing</th>
              <th scope="col" className="p-2 text-right font-medium">Height</th>
              <th scope="col" className="p-2 font-medium">Code</th>
              <th scope="col" className="p-2 font-medium">Read as</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(({ p, role, attention: look }) => (
              <tr key={`${p.line}-${p.pointId}`} className="border-t border-line align-top">
                <td className="p-2 font-mono text-ink">{p.pointId}</td>
                <td className="p-2 text-right font-mono tabular text-ink">{fixed(p.e)}</td>
                <td className="p-2 text-right font-mono tabular text-ink">{fixed(p.n)}</td>
                <td className="p-2 text-right font-mono tabular text-ink-2">{p.z === null ? "" : fixed(p.z)}</td>
                <td className="p-2 font-mono text-ink">{p.code ?? ""}</td>
                <td className="p-2 text-ink-2">{look ? <StatusBadge status="attention" label={warnedLines.has(p.line) ? "Repeated in the file" : role.label} /> : role.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(onlyAttention ? attention : points.length) > SHOWN ? <p className="text-sm text-ink-3">The first {SHOWN} are shown; every point is imported.</p> : null}
    </div>
  );
}
