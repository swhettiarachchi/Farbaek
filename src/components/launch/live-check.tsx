"use client";

import { ArrowClockwiseIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState, useTransition } from "react";
import { checkLiveSiteAction, type LiveCheckState } from "@/app/app/projects/[projectId]/launch/actions";
import { buttonClasses } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/local-time";
import { StatusGlyph } from "@/components/ui/status-badge";
import { VERDICT_WORDS, type HealthVerdict } from "@/core/launch/health";
import { VERDICT_KIND } from "./verdict-kind";

export interface LastCheck {
  verdict: HealthVerdict;
  detail: string;
  checkedAt: string;
}

/**
 * The live check for a project's site: the last result in words, a button
 * to check again, and one automatic check when the live version has never
 * been checked. Farbaek's server does the fetching; this only asks.
 */
export function LiveCheck({ projectId, last, autoRun }: { projectId: string; last: LastCheck | null; autoRun: boolean }) {
  const [state, setState] = useState<LiveCheckState>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  const started = useRef(false);

  const run = () =>
    startTransition(async () => {
      const r = await checkLiveSiteAction(projectId).catch(() => ({ status: "error", message: "The check couldn't run. Try again in a moment." }) as const);
      setState(r);
    });

  useEffect(() => {
    if (autoRun && !started.current) {
      started.current = true;
      run();
    }
    // Runs once on mount when the live version has no check yet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown: LastCheck | null = state.status === "done" ? { verdict: state.result.verdict, detail: state.result.detail, checkedAt: state.checkedAt } : last;

  return (
    <div className="grid gap-3">
      <div aria-live="polite" className="flex min-h-11 items-start gap-3">
        {pending ? (
          <>
            <StatusGlyph status="working" size={20} />
            <span className="text-sm">
              <span className="font-medium text-ink">Checking your live site</span>
              <span className="block text-ink-2">Farbaek is opening the address and comparing what answers with this version.</span>
            </span>
          </>
        ) : shown ? (
          <>
            {/* The verdict's kind says how it ended in its icon and colour; the words stay in ink, whichever it is. */}
            <StatusGlyph status={VERDICT_KIND[shown.verdict]} size={20} />
            <span className="text-sm">
              <span className="font-medium text-ink">{VERDICT_WORDS[shown.verdict]}</span>
              <span className="block text-ink-2">
                {shown.detail} Checked <RelativeTime iso={shown.checkedAt} />.
              </span>
            </span>
          </>
        ) : (
          <>
            <StatusGlyph status="unverified" size={20} />
            <span className="text-sm text-ink-2">Not checked yet.</span>
          </>
        )}
      </div>
      {state.status === "error" && !pending ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-ink">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
          <span>{state.message}</span>
        </p>
      ) : null}
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className={buttonClasses("secondary", "sm", "w-fit")}
      >
        <ArrowClockwiseIcon size={16} weight="bold" className={pending ? "motion-safe:animate-spin" : ""} aria-hidden />
        {pending ? "Checking…" : "Check again"}
      </button>
    </div>
  );
}
