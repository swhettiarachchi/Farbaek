"use client";

import { CheckCircleIcon, CheckIcon, CopyIcon, KeyIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState, useState } from "react";
import { pairAgentAction, type PairAgentState } from "@/app/app/actions";
import { buttonClasses } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/local-time";

const IDLE: PairAgentState = { status: "idle" };

/**
 * Creates a one-time pairing code. The code is shown here once; the desktop
 * app redeems it for its own token, which Farbaek keeps only as a hash.
 */
export function PairAgent({ disabledReason }: { disabledReason: string | null }) {
  const [state, action, pending] = useActionState(pairAgentAction, IDLE);
  const [copied, setCopied] = useState(false);

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="grid gap-4">
      <form action={action} onSubmit={() => setCopied(false)} className="grid gap-3">
        <div>
          <button type="submit" disabled={disabledReason !== null || pending} className={buttonClasses("primary", "sm")}>
            <KeyIcon size={16} weight="bold" aria-hidden /> {pending ? "Creating…" : state.status === "created" ? "Create a new code" : "Create pairing code"}
          </button>
        </div>
        {disabledReason ? <p className="text-sm text-ink-3">{disabledReason}</p> : null}
        {state.status === "error" ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-failed">
            <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
            <span>{state.message}</span>
          </p>
        ) : null}
      </form>

      {state.status === "created" ? (
        <div role="status" className="grid gap-3 rounded-md border border-line bg-surface-raised/70 p-4">
          <p className="flex items-start gap-2 text-sm">
            <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />
            <span>
              In Farbaek Agent on your computer, choose Pair and type this code. It works once, until <LocalTime iso={state.expiresAt} />, and it isn&apos;t shown again.
            </span>
          </p>
          <code className="block w-fit rounded-sm border border-line bg-surface px-4 py-2 font-mono text-2xl tracking-[0.12em] tabular">{state.code}</code>
          <div>
            <button type="button" onClick={() => void copy(state.code)} className={buttonClasses("secondary", "sm")}>
              {copied ? <CheckIcon size={16} weight="bold" aria-hidden /> : <CopyIcon size={16} weight="bold" aria-hidden />} {copied ? "Copied" : "Copy code"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
