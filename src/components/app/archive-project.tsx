"use client";

import { ArchiveIcon } from "@phosphor-icons/react";
import { useActionState, useState } from "react";
import { archiveProjectAction, type FormState } from "@/app/app/actions";
import { buttonClasses } from "@/components/ui/button";

const IDLE: FormState = { status: "idle" };

/** Two-step archive. Nothing is deleted; the project becomes read-only and leaves the list. */
export function ArchiveProject({ projectId, name, disabledReason }: { projectId: string; name: string; disabledReason: string | null }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(archiveProjectAction, IDLE);

  if (!confirming || disabledReason) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setConfirming(true)} disabled={Boolean(disabledReason)} className={buttonClasses("secondary", "sm")}>
          <ArchiveIcon size={16} aria-hidden /> Archive project
        </button>
        {disabledReason ? <p className="text-sm text-ink-3">{disabledReason}</p> : null}
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-3 rounded-sm border border-approval/30 bg-approval/[0.06] p-4">
      <input type="hidden" name="projectId" value={projectId} />
      <p className="text-sm">
        Archive <span className="font-medium">{name}</span>? It leaves the project list and stops counting toward your plan&apos;s project limit. Its files, tasks and proof stay
        readable, and nothing is deleted. Its files can&apos;t change while it&apos;s archived.
      </p>
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-failed">
          {state.message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className={buttonClasses("primary", "sm")}>
          {pending ? "Archiving…" : "Archive project"}
        </button>
        <button type="button" onClick={() => setConfirming(false)} disabled={pending} className={buttonClasses("ghost", "sm")}>
          Keep it active
        </button>
      </div>
    </form>
  );
}
