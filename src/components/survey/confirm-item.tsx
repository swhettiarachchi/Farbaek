"use client";

import { ArrowCounterClockwiseIcon, CheckCircleIcon, TrashIcon, WarningCircleIcon } from "@/components/icons";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { confirmSketchItemsAction, confirmSurveyItemAction, labelLotAction, removeSurveySymbolAction } from "@/app/app/survey/actions";
import { buttonClasses } from "@/components/ui/button";
import { LABEL_CLASSES, inputClasses } from "@/components/ui/field";
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

/** The one lot without a label, labelled on the card that says so (stage 294), as it appears in the title. */
export function LotLabel({ projectId, baseVersion, lotId, readOnly }: { projectId: string; baseVersion: number; lotId: string; readOnly: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const unsaved = usePlanUnsaved();
  // Its own id each time it's drawn: the list is drawn twice, once folded for phones.
  const id = useId();
  const save = () =>
    start(async () => {
      const r = await labelLotAction({ projectId, baseVersion, lotId, label });
      if (r.status === "error") return setError(r.message);
      setError(null);
      router.refresh();
    });
  const off = pending || readOnly !== null || unsaved;
  return (
    <form
      className="grid w-full gap-1.5 sm:max-w-sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (label.trim()) save();
      }}
    >
      <label htmlFor={id} className={LABEL_CLASSES}>
        The lot&apos;s letter or number
      </label>
      <div className="flex gap-2">
        <input id={id} value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} disabled={off} autoComplete="off" className={inputClasses("min-w-0 flex-1")} />
        <button type="submit" disabled={off || !label.trim()} className={buttonClasses("secondary", "md", "shrink-0")}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {unsaved && !readOnly ? <p className="text-sm text-ink-3">{PLAN_UNSAVED_REASON}</p> : null}
      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </form>
  );
}

/**
 * One press for the sketch's lines and symbols that nothing stands against (stage 294), saved as one new version. The server confirms
 * only those still free of any question, and says how many.
 */
export function ConfirmTogether({ projectId, baseVersion, keys, readOnly }: { projectId: string; baseVersion: number; keys: string[]; readOnly: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const unsaved = usePlanUnsaved();
  const run = () =>
    start(async () => {
      const r = await confirmSketchItemsAction({ projectId, baseVersion, keys });
      if (r.status === "error") return setError(r.message);
      setError(null);
      router.refresh();
    });
  return (
    <div className="grid gap-1.5">
      <button type="button" onClick={run} disabled={pending || readOnly !== null || unsaved} className={buttonClasses("secondary", "sm", "w-fit")}>
        <CheckCircleIcon size={16} weight="bold" aria-hidden />
        {pending ? "Saving…" : `Confirm all ${keys.length}`}
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
