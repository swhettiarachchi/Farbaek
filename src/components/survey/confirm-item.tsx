"use client";

import { ArrowCounterClockwiseIcon, CheckCircleIcon, TrashIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmSurveyItemAction, removeSurveySymbolAction } from "@/app/app/survey/actions";
import { buttonClasses } from "@/components/ui/button";
import { PLAN_UNSAVED_REASON, usePlanUnsaved } from "./unsaved-plan";

/**
 * One press to confirm an item Farbaek drew or filled in (saved as a new version), or to put a confirmed one back on the list. A symbol
 * (a well the sketch put at a point) can also be removed here, since no other step edits symbols.
 */
export function ConfirmItem({ projectId, baseVersion, keyId, confirmed, readOnly }: { projectId: string; baseVersion: number; keyId: string; confirmed: boolean; readOnly: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [doing, setDoing] = useState<"confirm" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unsaved = usePlanUnsaved();
  const removable = !confirmed && keyId.startsWith("symbol:");
  const run = (what: "confirm" | "remove") =>
    start(async () => {
      setDoing(what);
      const r = what === "remove" ? await removeSurveySymbolAction({ projectId, baseVersion, key: keyId }) : await confirmSurveyItemAction({ projectId, baseVersion, key: keyId, confirmed: !confirmed });
      setDoing(null);
      if (r.status === "error") return setError(r.message);
      setError(null);
      router.refresh();
    });
  const off = pending || readOnly !== null || unsaved;
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => run("confirm")} disabled={off} className={buttonClasses(confirmed ? "ghost" : "secondary", "sm", "w-fit")}>
          {confirmed ? <ArrowCounterClockwiseIcon size={16} weight="bold" aria-hidden /> : <CheckCircleIcon size={16} weight="bold" aria-hidden />}
          {pending && doing === "confirm" ? "Saving…" : confirmed ? "Check it again" : "Confirm"}
        </button>
        {removable ? (
          <button type="button" onClick={() => run("remove")} disabled={off} className={buttonClasses("ghost", "sm", "w-fit")}>
            <TrashIcon size={16} weight="bold" aria-hidden />
            {pending && doing === "remove" ? "Removing…" : "Remove"}
          </button>
        ) : null}
      </div>
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
