"use client";

import { MagnifyingGlassIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { checkSketchAgainAction, type SketchCheckState } from "@/app/app/survey/ai-actions";
import type { SketchCheck } from "@/core/survey/sketchintel/verify";
import { buttonClasses } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/local-time";

/**
 * The last independent check of the plan against the sketch (stage 263, ADR 0271), and a way to check again after corrections, from the
 * photos kept with the plan. The photos go to Anthropic again only when the surveyor ticks the box. What the check doubts is in the
 * plan's checks, beside the items, where it's answered.
 */
export function SketchCheckAgain(props: { projectId: string; baseVersion: number; check: SketchCheck | null; off: string | null; aiCost: string }) {
  const router = useRouter();
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<SketchCheckState>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  const { check } = props;
  const doubted = check ? check.items.filter((v) => v.verdict !== "drawn").length : 0;
  const off = props.off ?? (!consent ? "Tick the box to send the kept photos to Anthropic for the check." : null);

  const run = () => {
    if (off) return;
    const form = new FormData();
    form.set("projectId", props.projectId);
    form.set("baseVersion", String(props.baseVersion));
    form.set("consent", "yes");
    startTransition(async () => {
      const r = await checkSketchAgainAction(form).catch((): SketchCheckState => ({ status: "error", message: "The connection dropped while the plan was checked. Try again." }));
      setResult(r);
      if (r.status === "done") {
        setConsent(false);
        router.refresh();
      }
    });
  };

  return (
    <div className="grid gap-3 rounded-md border border-line p-3">
      <p className="text-sm text-ink-2">
        {check ? (
          <>
            Checked against the sketch on <LocalTime iso={check.at} date />: {check.items.length - doubted} of {check.items.length} {check.items.length === 1 ? "item" : "items"} drawn so there
            {doubted > 0 ? `, ${doubted} doubted` : ""}
            {check.missing.length > 0 ? `, ${check.missing.length} ${check.missing.length === 1 ? "line" : "lines"} on the sketch not on the plan` : ""}. What it doubts is in the plan&apos;s checks.
          </>
        ) : (
          "The plan hasn't been checked against the sketch yet. A second look compares each line the plan draws with the photos."
        )}
      </p>
      <label className="flex min-h-11 items-start gap-3 text-sm text-ink">
        <input type="checkbox" checked={consent} disabled={pending || Boolean(props.off)} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--color-accent)]" />
        <span>Send the kept sketch photos to Anthropic again, outside Sri Lanka, for Claude to compare them with the plan as it is now. {props.aiCost}</span>
      </label>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="button" onClick={run} disabled={Boolean(off) || pending} className={buttonClasses("secondary", "md")}>
          <MagnifyingGlassIcon size={16} weight="bold" aria-hidden />
          {pending ? "Checking the plan…" : check ? "Check against the sketch again" : "Check against the sketch"}
        </button>
        <span aria-live="polite" className="text-sm text-ink-3">
          {pending ? "Claude is comparing each line with the photos, which can take a minute." : off}
        </span>
      </div>
      {result.status === "error" ? (
        <p role="alert" className="flex items-start gap-2 text-sm font-medium text-ink">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
          {result.message}
        </p>
      ) : result.status === "done" ? (
        <p role="status" className="text-sm text-ink-2">
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
