"use client";

import { PencilSimpleIcon, WarningCircleIcon } from "@/components/icons";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { finishCutOffRunAction, type SurveyFormState } from "@/app/app/survey/actions";
import { buttonClasses } from "@/components/ui/button";

/**
 * Finishes a Generate Plan run that was cut off after its files were imported (stage 235): the plan is drawn from the points the
 * project already keeps, and the page shows how the run ended.
 */
export function FinishRun({ projectId, jobId, disabledReason }: { projectId: string; jobId: string; disabledReason: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SurveyFormState>({ status: "idle" });
  const finish = () =>
    start(async () => {
      const r = await finishCutOffRunAction({ projectId, jobId }).catch((): SurveyFormState => ({ status: "error", message: "The plan couldn't be drawn just now. Try again, or draw it from the Draft step." }));
      setResult(r);
      router.refresh();
    });
  return (
    <div className="mt-3 grid gap-2">
      <div>
        <button type="button" onClick={finish} disabled={pending || Boolean(disabledReason)} title={disabledReason ?? undefined} className={buttonClasses("primary", "sm")}>
          <PencilSimpleIcon size={16} weight="bold" aria-hidden />
          {pending ? "Drawing the plan" : "Finish drawing the plan"}
        </button>
      </div>
      {disabledReason ? <p className="text-sm text-ink-3">{disabledReason}</p> : null}
      {result.status === "error" ? (
        <p role="alert" className="flex gap-2 text-sm text-ink">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
