"use client";

import { ArrowCounterClockwiseIcon, CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setKeptAsSurveyedAction } from "@/app/app/survey/actions";
import { buttonClasses } from "@/components/ui/button";

/** The surveyor's answer to a near miss: keep it as surveyed (recorded in a new version), or check it again. */
export function KeepAsSurveyed({ projectId, baseVersion, keyId, kept, readOnly }: { projectId: string; baseVersion: number; keyId: string; kept: boolean; readOnly: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = () =>
    start(async () => {
      const r = await setKeptAsSurveyedAction({ projectId, baseVersion, key: keyId, keep: !kept });
      if (r.status === "error") return setError(r.message);
      setError(null);
      router.refresh();
    });
  return (
    <div className="grid gap-1.5">
      <button type="button" onClick={run} disabled={pending || readOnly !== null} className={buttonClasses(kept ? "ghost" : "secondary", "sm", "w-fit")}>
        {kept ? <ArrowCounterClockwiseIcon size={16} weight="bold" aria-hidden /> : <CheckCircleIcon size={16} weight="bold" aria-hidden />}
        {kept ? "Check it again" : "Keep as surveyed"}
      </button>
      {readOnly ? <p className="text-sm text-ink-3">{readOnly}</p> : null}
      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}
