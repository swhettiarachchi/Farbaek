"use client";

import { TrashIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState, useState } from "react";
import { deleteFileAction, type FormState } from "@/app/app/actions";
import { buttonClasses } from "@/components/ui/button";

const IDLE: FormState = { status: "idle" };

/** Two-step delete. The file leaves the current tree; its revisions are kept. */
export function DeleteFile({ projectId, path, revision, disabledReason }: { projectId: string; path: string; revision: number; disabledReason: string | null }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(deleteFileAction, IDLE);

  // When changes aren't allowed the page states the reason once; the button stays visible but off.
  if (!confirming || disabledReason) {
    return (
      <button type="button" onClick={() => setConfirming(true)} disabled={Boolean(disabledReason)} className={buttonClasses("ghost", "sm")}>
        <TrashIcon size={16} weight="bold" aria-hidden /> Delete
      </button>
    );
  }
  return (
    <form action={action} className="grid gap-3 rounded-sm border border-failed/30 bg-failed/[0.04] p-4">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="path" value={path} />
      <input type="hidden" name="expectedRevision" value={revision} />
      <p className="text-sm">
        Delete <span className="font-mono text-[0.8125rem] break-all">{path}</span>? It leaves the file tree. Its history is kept.
      </p>
      {state.status === "error" ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
          <span>{state.message}</span>
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className={buttonClasses("danger", "sm")}>
          {pending ? "Deleting…" : "Delete file"}
        </button>
        <button type="button" onClick={() => setConfirming(false)} disabled={pending} className={buttonClasses("ghost", "sm")}>
          Keep it
        </button>
      </div>
    </form>
  );
}
