"use client";

import { useState } from "react";
import { CompareCellView, type CompareGroup } from "./compare-cell";

interface PlanOption {
  id: string;
  name: string;
  /** "$11.88 a year", "$9.99 a month" or "Nothing". */
  charge: string;
}

const select = "min-h-11 w-full rounded-sm border border-line-strong bg-canvas px-3 text-base text-ink";

/**
 * The plan comparison on a phone: ten columns don't fit, so people pick two
 * plans and see them side by side, row by row. Choosing the plan already in
 * the other box swaps the two.
 */
export function ComparePlans({ plans, groups, initial }: { plans: PlanOption[]; groups: CompareGroup[]; initial: [string, string] }) {
  const [pair, setPair] = useState<[string, string]>(initial);
  const choose = (side: 0 | 1, id: string) =>
    setPair((p) => {
      const next: [string, string] = [p[0], p[1]];
      if (next[1 - side] === id) next[1 - side] = p[side];
      next[side] = id;
      return next;
    });
  const named = pair.map((id) => plans.find((p) => p.id === id)!);

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 rounded-md border border-line bg-surface p-4">
        {([0, 1] as const).map((side) => (
          <label key={side} className="grid min-w-0 gap-1.5 text-sm text-ink-2">
            {side === 0 ? "Compare" : "With"}
            <select className={select} value={pair[side]} onChange={(e) => choose(side, e.target.value)}>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <span data-web-purchase className="text-xs text-ink-3 tabular">{named[side]!.charge}</span>
          </label>
        ))}
      </div>

      {groups.map((group) => (
        <details key={group.title} open className="group min-w-0 rounded-md border border-line bg-surface">
          <summary className="flex min-h-13 cursor-pointer list-none items-center justify-between px-4 py-3 text-[1.0625rem] font-medium [&::-webkit-details-marker]:hidden">
            {group.title}
            <span className="text-sm font-normal text-ink-3 group-open:hidden">Show</span>
            <span className="hidden text-sm font-normal text-ink-3 group-open:inline">Hide</span>
          </summary>
          <div className="border-t border-line">
            <div className="grid grid-cols-2 gap-3 bg-canvas-2 px-4 py-2 text-sm font-medium" aria-hidden>
              <span>{named[0]!.name}</span>
              <span>{named[1]!.name}</span>
            </div>
            <dl>
              {group.rows.map((row) => (
                <div key={row.label} className="border-t border-line px-4 py-3">
                  <dt className="text-sm text-ink-2">{row.label}</dt>
                  <dd className="mt-1.5 grid grid-cols-2 gap-3 text-sm font-medium text-ink tabular">
                    {pair.map((id, i) => (
                      <span key={id} className="min-w-0 break-words">
                        <span className="sr-only">{named[i]!.name}: </span>
                        <CompareCellView cell={row.cells[id]} />
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </details>
      ))}
    </div>
  );
}
