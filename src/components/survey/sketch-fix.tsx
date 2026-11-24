"use client";

import { CheckCircleIcon, PencilSimpleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { correctSketchNumberAction } from "@/app/app/survey/actions";
import { buttonClasses } from "@/components/ui/button";
import { PLAN_UNSAVED_REASON, usePlanUnsaved } from "./unsaved-plan";

// The last correction's result, kept outside the card: a correction redraws the item whose card holds the button, so the card goes
// with the refresh, and what it says (above all, a confirmed item it left as it was) must still be read.
let last: { projectId: string; text: string } | null = null;
const listeners = new Set<() => void>();
const say = (v: typeof last) => {
  last = v;
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** Where the last correction's result is said, above the list, until the surveyor leaves the project. */
export function SketchFixResult({ projectId }: { projectId: string }) {
  const v = useSyncExternalStore(
    subscribe,
    () => last,
    () => null,
  );
  // Leaving the project forgets it: it's about this page as it is now.
  useEffect(
    () => () => {
      if (last?.projectId === projectId) say(null);
    },
    [projectId],
  );
  return (
    <div role="status">
      {v && v.projectId === projectId ? (
        <p className="mt-3 flex items-start gap-2 text-sm text-ink-2">
          <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />
          <span>{v.text}</span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * One press to correct a number the sketch was read with (stage 249, ADR 0257): "the number read as 10 is 20". The correction is kept
 * beside the reading as the surveyor's, and what the sketch drew from it is redrawn, waiting for them as before.
 */
export function SketchFix({ projectId, baseVersion, file, reading, label, to, readOnly }: { projectId: string; baseVersion: number; file: string; reading: string; label: string; to: string; readOnly: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const unsaved = usePlanUnsaved();
  const run = () =>
    start(async () => {
      const r = await correctSketchNumberAction({ projectId, baseVersion, file, reading, to }).catch(() => ({ status: "error" as const, message: "The connection dropped. Try again." }));
      if (r.status === "error") setError(r.message);
      if (r.status === "done") {
        setError(null);
        say({ projectId, text: r.message });
        router.refresh();
      }
    });
  const off = pending || readOnly !== null || unsaved;
  return (
    <div className="grid gap-1.5">
      <button type="button" onClick={run} disabled={off} className={buttonClasses("secondary", "sm", "w-fit")}>
        <PencilSimpleIcon size={16} weight="bold" aria-hidden />
        {pending ? "Redrawing…" : `It's ${to}: use ${to} for the ${label} read`}
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
