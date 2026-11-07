"use client";

import { ArrowClockwiseIcon, CheckCircleIcon, CircleNotchIcon, ClockCounterClockwiseIcon, WarningIcon, WifiSlashIcon } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useEffect, useRef, useState, useTransition } from "react";
import { checkLiveSiteAction, type LiveCheckState } from "@/app/app/projects/[projectId]/launch/actions";
import { RelativeTime } from "@/components/ui/local-time";
import { VERDICT_WORDS, type HealthVerdict } from "@/core/launch/health";

const LOOK: Record<HealthVerdict, { icon: Icon; tone: string }> = {
  live: { icon: CheckCircleIcon, tone: "text-verified" },
  previous: { icon: ClockCounterClockwiseIcon, tone: "text-approval" },
  down: { icon: WarningIcon, tone: "text-failed" },
  unreachable: { icon: WifiSlashIcon, tone: "text-failed" },
};

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
  const look = shown ? LOOK[shown.verdict] : null;

  return (
    <div className="grid gap-3">
      <div aria-live="polite" className="flex min-h-11 items-start gap-3">
        {pending ? (
          <>
            <CircleNotchIcon size={18} weight="bold" className="mt-0.5 shrink-0 text-accent motion-safe:animate-spin" aria-hidden />
            <span className="text-sm">
              <span className="font-medium text-ink">Checking your live site</span>
              <span className="block text-ink-2">Farbaek is opening the address and comparing what answers with this version.</span>
            </span>
          </>
        ) : shown && look ? (
          <>
            <look.icon size={20} weight="fill" className={`mt-px shrink-0 ${look.tone}`} aria-hidden />
            <span className="text-sm">
              <span className="font-medium text-ink">{VERDICT_WORDS[shown.verdict]}</span>
              <span className="block text-ink-2">
                {shown.detail} Checked <RelativeTime iso={shown.checkedAt} />.
              </span>
            </span>
          </>
        ) : (
          <span className="text-sm text-ink-2">Not checked yet.</span>
        )}
      </div>
      {state.status === "error" && !pending ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningIcon size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span className="text-ink">{state.message}</span>
        </p>
      ) : null}
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-medium text-ink shadow-e1 transition-colors duration-150 hover:bg-canvas-2 disabled:opacity-60"
      >
        <ArrowClockwiseIcon size={16} className={pending ? "motion-safe:animate-spin" : ""} aria-hidden />
        {pending ? "Checking…" : "Check again"}
      </button>
    </div>
  );
}
