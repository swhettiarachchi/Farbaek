"use client";

import { WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState } from "react";
import { acceptInvitationAction, type AcceptInviteState } from "@/app/app/actions";
import { buttonClasses } from "@/components/ui/button";

const IDLE: AcceptInviteState = { status: "idle" };

/** Joins the workspace. The server checks the invitation, the signed-in address and the seats again. */
export function AcceptInvitationForm({ token, orgName }: { token: string; orgName: string }) {
  const [state, action, pending] = useActionState(acceptInvitationAction, IDLE);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="token" value={token} />
      {state.status === "error" ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden />
          {state.message}
        </p>
      ) : null}
      <div>
        <button type="submit" disabled={pending} className={buttonClasses("primary")}>
          {pending ? "Joining…" : `Join ${orgName}`}
        </button>
      </div>
    </form>
  );
}
