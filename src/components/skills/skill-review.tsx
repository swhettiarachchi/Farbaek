"use client";

import { CaretDownIcon, CheckCircleIcon, CheckIcon, WarningCircleIcon } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useActionState, useState } from "react";
import { pinSkillAction, type SkillState } from "@/app/app/projects/[projectId]/skill-actions";
import { buttonClasses } from "@/components/ui/button";

const Surface = dynamic(() => import("@/components/files/codemirror"), {
  ssr: false,
  loading: () => (
    <div className="flex h-32 items-center justify-center rounded-md border border-line bg-surface-raised text-sm text-ink-3" role="status">
      Loading the change…
    </div>
  ),
});

const IDLE: SkillState = { status: "idle" };

/**
 * Reviewing a held skill (ADR 0043): the change since its approved version,
 * or the whole text when it's new, then approval of exactly this revision
 * and hash. The diff mounts only when opened.
 */
export function SkillReview({
  projectId,
  name,
  path,
  revision,
  sha256,
  current,
  approved,
  disabledReason,
}: {
  projectId: string;
  name: string;
  path: string;
  revision: number;
  sha256: string;
  current: string;
  /** The approved version's text, or null when the skill was never approved. */
  approved: string | null;
  disabledReason: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(pinSkillAction, IDLE);
  const panel = `skill-review-${path.replace(/[^a-z0-9]+/gi, "-")}`;
  return (
    <div className="grid gap-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-11 items-center gap-1.5 justify-self-start rounded-full px-3 text-sm font-medium text-accent hover:bg-accent/[0.06]"
      >
        <CaretDownIcon size={14} weight="bold" className={`motion-safe:transition-transform motion-safe:duration-[160ms] motion-safe:ease-standard ${open ? "rotate-180" : ""}`} aria-hidden />
        {approved === null ? "Review the new skill" : "Review what changed"}
      </button>
      {open ? (
        <div id={panel} className="grid min-w-0 gap-3">
          <p className="text-xs leading-relaxed text-ink-2">
            {approved === null
              ? "Nobody has approved this skill yet, so every line shows as new. Read it as instructions the agent would follow on every build here."
              : "Green lines were added since the approved version and red ones removed. Builds leave this skill out until someone approves this version."}
          </p>
          <Surface path={path} value={current} original={approved ?? ""} controls={false} label={`Changes to the ${name} skill`} />
          {state.status === "done" ? (
            <p role="status" className="flex items-start gap-2 text-sm text-verified">
              <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden /> {state.message}
            </p>
          ) : (
            <form action={action} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="path" value={path} />
              <input type="hidden" name="revision" value={revision} />
              <input type="hidden" name="sha256" value={sha256} />
              <button type="submit" disabled={pending || Boolean(disabledReason)} className={buttonClasses("primary", "sm")}>
                <CheckIcon size={16} weight="bold" aria-hidden /> {pending ? "Approving…" : "Approve this version"}
              </button>
              {disabledReason ? <span className="text-sm text-ink-3">{disabledReason}</span> : null}
            </form>
          )}
          {state.status === "error" ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-failed">
              <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden /> {state.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
