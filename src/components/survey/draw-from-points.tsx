"use client";

import { CheckCircleIcon, PolygonIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { drawPlanFromPointsAction, type SurveyFormState } from "@/app/app/survey/actions";
import { buttonClasses } from "@/components/ui/button";

/** What the automatic draft drew and didn't, as it reports it. */
export function DrawnSummary({ drawn, notDrawn }: { drawn: readonly string[]; notDrawn: readonly string[] }) {
  return (
    <div className="grid gap-2 text-sm">
      {drawn.length > 0 ? (
        <ul className="grid gap-1">
          {drawn.map((d) => (
            <li key={d} className="flex items-start gap-2 text-ink">
              <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />
              {d}
            </li>
          ))}
        </ul>
      ) : null}
      {notDrawn.length > 0 ? (
        <ul className="grid gap-1">
          {notDrawn.map((d) => (
            <li key={d} className="flex items-start gap-2 text-ink-2">
              <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-caution" aria-hidden />
              {d}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * "Draw the plan from the points" (stage 194): the automatic draft for a project whose points are in and whose plan has no lots yet.
 * It draws the lot through the boundary marks, the lines from the field codes and the road, each marked for checking, then opens the
 * plan to check.
 */
export function DrawFromPoints({ projectId, readOnly }: { projectId: string; readOnly: string | null }) {
  const router = useRouter();
  const [state, setState] = useState<SurveyFormState>({ status: "idle" });
  const [pending, start] = useTransition();
  const draw = () =>
    start(async () => {
      const r = await drawPlanFromPointsAction({ projectId });
      setState(r);
      if (r.status === "done") router.refresh();
    });
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={draw} disabled={Boolean(readOnly) || pending} className={buttonClasses("primary", "md")}>
          <PolygonIcon size={20} aria-hidden />
          {pending ? "Drawing…" : "Draw the plan from the points"}
        </button>
        {readOnly ? <span className="text-sm text-ink-3">{readOnly}</span> : null}
      </div>
      {state.status === "error" ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-ink">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-caution" aria-hidden />
          {state.message}
        </p>
      ) : null}
      {state.status === "done" ? (
        <div role="status" className="grid gap-2">
          <p className="text-sm font-medium text-ink">{state.message}</p>
          <DrawnSummary drawn={state.drawn ?? []} notDrawn={state.notDrawn ?? []} />
          <a href={`/app/survey/${projectId}?step=plan`} className={buttonClasses("secondary", "sm", "w-fit")}>
            Check the plan
          </a>
        </div>
      ) : null}
    </div>
  );
}
