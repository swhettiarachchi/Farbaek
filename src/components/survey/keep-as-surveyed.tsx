"use client";

import { ArrowCounterClockwiseIcon, CheckCircleIcon, WarningCircleIcon } from "@/components/icons";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { putBackSketchLineAction, setKeptAsSurveyedAction } from "@/app/app/survey/actions";
import { buttonClasses } from "@/components/ui/button";
import { PLAN_UNSAVED_REASON, usePlanUnsaved } from "./unsaved-plan";

/** The surveyor's answer to a near miss: keep it as surveyed (recorded in a new version), or check it again. */
export function KeepAsSurveyed({ projectId, baseVersion, keyId, kept, readOnly, label = "Keep as surveyed" }: { projectId: string; baseVersion: number; keyId: string; kept: boolean; readOnly: string | null; label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const unsaved = usePlanUnsaved();
  const run = () =>
    start(async () => {
      const r = await setKeptAsSurveyedAction({ projectId, baseVersion, key: keyId, keep: !kept });
      if (r.status === "error") return setError(r.message);
      setError(null);
      router.refresh();
    });
  return (
    <div className="grid gap-1.5">
      <button type="button" onClick={run} disabled={pending || readOnly !== null || unsaved} className={buttonClasses(kept ? "ghost" : "secondary", "sm", "w-fit")}>
        {kept ? <ArrowCounterClockwiseIcon size={16} weight="bold" aria-hidden /> : <CheckCircleIcon size={16} weight="bold" aria-hidden />}
        {kept ? "Check it again" : label}
      </button>
      {readOnly ? <p className="text-sm text-ink-3">{readOnly}</p> : unsaved ? <p className="text-sm text-ink-3">{PLAN_UNSAVED_REASON}</p> : null}
      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Puts back a line Farbaek left out (stage 302, ADR 0308): drawn as the sketch was read, and what it draws drawn again, for the surveyor. */
export function PutBackLine({ projectId, baseVersion, line, readOnly }: { projectId: string; baseVersion: number; line: string; readOnly: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const unsaved = usePlanUnsaved();
  const run = () =>
    start(async () => {
      const r = await putBackSketchLineAction({ projectId, baseVersion, line });
      if (r.status === "error") return setError(r.message);
      setError(null);
      router.refresh();
    });
  return (
    <div className="grid gap-1.5">
      <button type="button" onClick={run} disabled={pending || readOnly !== null || unsaved} className={buttonClasses("ghost", "sm", "w-fit")}>
        <ArrowCounterClockwiseIcon size={16} weight="bold" aria-hidden />
        {pending ? "Putting it back…" : "Put it back"}
      </button>
      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}
