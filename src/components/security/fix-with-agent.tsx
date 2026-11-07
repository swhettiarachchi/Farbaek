"use client";

import { WarningCircleIcon, WrenchIcon } from "@phosphor-icons/react";
import { useActionState } from "react";
import { fixWithAgentAction, type FixState } from "@/app/app/projects/[projectId]/security/actions";
import { buttonClasses } from "@/components/ui/button";

const IDLE: FixState = { status: "idle" };

/** One finding becomes a task for the agent. The task opens on success; otherwise the reason is said here. */
export function FixWithAgent({ projectId, reportId, findingId }: { projectId: string; reportId: string; findingId: string }) {
  const [state, action, pending] = useActionState(fixWithAgentAction, IDLE);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="reportId" value={reportId} />
      <input type="hidden" name="findingId" value={findingId} />
      <button type="submit" disabled={pending} className={buttonClasses("secondary", "sm", "justify-self-start")}>
        <WrenchIcon size={16} weight="bold" aria-hidden /> {pending ? "Making the task…" : "Fix with the agent"}
      </button>
      {state.status === "error" ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden /> {state.message}
        </p>
      ) : null}
    </form>
  );
}
