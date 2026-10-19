"use client";

import { RocketLaunchIcon, WarningCircleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { approveAndBuildAction, type ApproveBuildState } from "@/app/app/new/actions";
import { EffortPicker } from "@/components/app/effort-picker";
import { buttonClasses } from "@/components/ui/button";
import type { Effort } from "@/core/agent/routing";
import type { RunEstimates } from "@/server/workspace/plan-card-data";

const IDLE: ApproveBuildState = { status: "idle" };

/**
 * Approves this exact plan version and starts the agent. The estimate follows
 * the effort; the wallet still meters each step at its real cost.
 */
export function ApproveBuild({
  taskId,
  version,
  expectedTaskVersion,
  sha256,
  estimates,
  disabledReason,
}: {
  taskId: string;
  version: number;
  expectedTaskVersion: number;
  sha256: string;
  estimates: RunEstimates;
  disabledReason: string | null;
}) {
  const [state, action, pending] = useActionState(approveAndBuildAction, IDLE);
  const [effort, setEffort] = useState<Effort>("balanced");
  const estimate = estimates[effort];

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="expectedTaskVersion" value={expectedTaskVersion} />
      <input type="hidden" name="sha256" value={sha256} />
      <EffortPicker value={effort} onChange={setEffort} disabled={pending || Boolean(disabledReason)} />
      <p className="text-sm text-ink-2" aria-live="polite">
        {estimate ? (
          <>
            Likely to use <span className="font-medium text-ink tabular">{estimate.low === estimate.high ? `about ${estimate.low}%` : `${estimate.low} to ${estimate.high}%`}</span> of this
            period&apos;s AI usage. Steps that fail are refunded.
          </>
        ) : (
          "Each step is metered from your AI usage at its real cost, and steps that fail are refunded."
        )}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || Boolean(disabledReason)} className={buttonClasses("primary")}>
          <RocketLaunchIcon size={18} weight="bold" aria-hidden />
          {pending ? "Approving and starting…" : "Approve and build"}
        </button>
        <Link href={`/app/tasks/${taskId}`} className={buttonClasses("secondary")}>
          Edit the plan
        </Link>
      </div>
      {disabledReason ? <p className="text-sm text-ink-3">{disabledReason}</p> : null}
      {state.status === "error" ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            {state.message}
            {state.approved ? (
              <>
                {" "}
                <Link href="/app/build" className="font-medium underline">
                  Open Build
                </Link>
              </>
            ) : null}
          </span>
        </p>
      ) : null}
    </form>
  );
}
