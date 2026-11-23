"use client";

import { ArrowCounterClockwiseIcon, CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmSurveyItemAction } from "@/app/app/survey/actions";
import { buttonClasses } from "@/components/ui/button";
import { PLAN_UNSAVED_REASON, usePlanUnsaved } from "./unsaved-plan";

/** One press to confirm an item Farbaek drew or filled in (saved as a new version), or to put a confirmed one back on the list. */
export function ConfirmItem({ projectId, baseVersion, keyId, confirmed, readOnly }: { projectId: string; baseVersion: number; keyId: string; confirmed: boolean; readOnly: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const unsaved = usePlanUnsaved();
  const run = () =>
    start(async () => {
      const r = await confirmSurveyItemAction({ projectId, baseVersion, key: keyId, confirmed: !confirmed });
      if (r.status === "error") return setError(r.message);
      setError(null);
      router.refresh();
    });
  return (
    <div className="grid gap-1.5">
      <button type="button" onClick={run} disabled={pending || readOnly !== null || unsaved} className={buttonClasses(confirmed ? "ghost" : "secondary", "sm", "w-fit")}>
        {confirmed ? <ArrowCounterClockwiseIcon size={16} weight="bold" aria-hidden /> : <CheckCircleIcon size={16} weight="bold" aria-hidden />}
        {pending ? "Saving…" : confirmed ? "Check it again" : "Confirm"}
      </button>
      {unsaved && !readOnly ? <p className="text-sm text-ink-3">{PLAN_UNSAVED_REASON}</p> : null}
      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}
