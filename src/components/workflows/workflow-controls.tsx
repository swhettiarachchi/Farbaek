"use client";

import { useActionState } from "react";
import { approveWorkflowAction, cancelWorkflowAction, continueWorkflowAction, type WorkflowState } from "@/app/app/workflows/actions";
import { buttonClasses } from "@/components/ui/button";

const IDLE: WorkflowState = { status: "idle" };

function Message({ state }: { state: WorkflowState }) {
  if (state.status === "idle") return null;
  return (
    <p role={state.status === "done" ? "status" : "alert"} className={`text-sm ${state.status === "done" ? "text-verified" : "text-failed"}`}>
      {state.message}
    </p>
  );
}

/** A workflow's controls (ADR 0092). Each is shown only when it applies, and unavailable with its reason when the person can't use it. */
export function WorkflowControls({
  workflowId,
  approve,
  canContinue,
  canCancel,
  disabledReason,
}: {
  workflowId: string;
  /** null when approving doesn't apply; otherwise why it isn't available, or "" when it is. */
  approve: string | null;
  canContinue: boolean;
  canCancel: boolean;
  disabledReason: string | null;
}) {
  const [approved, runApprove, approving] = useActionState(approveWorkflowAction, IDLE);
  const [continued, runContinue, continuing] = useActionState(continueWorkflowAction, IDLE);
  const [cancelled, runCancel, cancelling] = useActionState(cancelWorkflowAction, IDLE);
  const blocked = Boolean(disabledReason);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {approve !== null ? (
          <form action={runApprove}>
            <input type="hidden" name="workflowId" value={workflowId} />
            <button type="submit" disabled={blocked || approve !== "" || approving} className={buttonClasses("primary", "md")}>
              {approving ? "Approving…" : "Approve and start"}
            </button>
          </form>
        ) : null}
        {canContinue ? (
          <form action={runContinue}>
            <input type="hidden" name="workflowId" value={workflowId} />
            <button type="submit" disabled={blocked || continuing} className={buttonClasses("primary", "md")}>
              {continuing ? "Continuing…" : "Continue to the next step"}
            </button>
          </form>
        ) : null}
        {canCancel ? (
          <form action={runCancel}>
            <input type="hidden" name="workflowId" value={workflowId} />
            <button type="submit" disabled={blocked || cancelling} className={buttonClasses("ghost", "md")}>
              {cancelling ? "Cancelling…" : "Cancel the workflow"}
            </button>
          </form>
        ) : null}
      </div>
      {disabledReason ? <p className="text-sm text-ink-3">{disabledReason}</p> : approve ? <p className="text-sm text-ink-3">{approve}</p> : null}
      <Message state={approved} />
      <Message state={continued} />
      <Message state={cancelled} />
    </div>
  );
}
