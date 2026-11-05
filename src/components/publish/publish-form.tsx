"use client";

import { RocketLaunchIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState, useState } from "react";
import { publishAction, type PublishState } from "@/app/app/projects/[projectId]/publish-actions";
import { buttonClasses } from "@/components/ui/button";
import { OVERRIDE_REASON_MAX, overrideReasonProblem } from "@/core/publish/evidence";
import { SITE_NAME_MAX, SITE_NAME_MESSAGES, siteNameProblem } from "@/core/publish/site";

const IDLE: PublishState = { status: "idle" };

/**
 * The name and the Publish button. The name is checked as it's typed; the server checks it again.
 * With `override`, the files have no verified evidence (ADR 0050) and an owner or admin says why.
 */
export function PublishForm({
  projectId,
  domain,
  initialName,
  live,
  override,
  disabledReason,
}: {
  projectId: string;
  domain: string;
  initialName: string;
  live: boolean;
  override: boolean;
  disabledReason: string | null;
}) {
  const [state, action, pending] = useActionState(publishAction, IDLE);
  const [name, setName] = useState(initialName);
  const [reason, setReason] = useState("");
  const problem = siteNameProblem(name);
  const reasonProblem = override ? overrideReasonProblem(reason) : null;
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="projectId" value={projectId} />
      <label className="grid gap-1.5">
        <span className="text-sm font-medium">Address</span>
        <span className="flex min-w-0 items-center rounded-sm border border-line bg-surface focus-within:border-accent/60">
          <span className="pl-3.5 font-mono text-[13px] text-ink-3">https://</span>
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase())}
            maxLength={SITE_NAME_MAX}
            spellCheck={false}
            autoCapitalize="none"
            disabled={Boolean(disabledReason) || pending}
            aria-invalid={problem ? true : undefined}
            aria-describedby="site-name-help"
            className="h-11 min-w-0 flex-1 bg-transparent px-1 font-mono text-base text-ink outline-none"
          />
          <span className="truncate pr-3.5 font-mono text-[13px] text-ink-3">.{domain}</span>
        </span>
        <span id="site-name-help" className={`text-xs ${problem && name ? "text-failed" : "text-ink-3"}`}>
          {problem && name ? SITE_NAME_MESSAGES[problem] : "Lowercase letters, numbers and hyphens. You can change it when you publish again."}
        </span>
      </label>
      {override ? (
        <label className="grid gap-1.5">
          <span className="text-sm font-medium">Why publish before the checks have passed?</span>
          <textarea
            name="overrideReason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            rows={2}
            maxLength={OVERRIDE_REASON_MAX}
            disabled={Boolean(disabledReason) || pending}
            aria-describedby="override-reason-help"
            placeholder="For example: a copy change I checked in the preview."
            className="field-sizing-content min-h-20 w-full rounded-sm border border-line-strong/60 bg-surface px-3.5 py-2.5 text-base leading-relaxed text-ink outline-none placeholder:text-ink-3 focus:border-accent/60"
          />
          <span id="override-reason-help" className="text-xs text-ink-3">
            Saved with this version and in the audit log, for anyone in the workspace to see.
          </span>
        </label>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || Boolean(disabledReason) || Boolean(problem) || Boolean(reasonProblem)} className={buttonClasses("primary")}>
          <RocketLaunchIcon size={18} weight="bold" aria-hidden />{" "}
          {pending ? "Publishing…" : override ? "Publish without passed checks" : live ? "Publish the latest files" : "Publish"}
        </button>
        {disabledReason ? <span className="text-sm text-ink-3">{disabledReason}</span> : null}
      </div>
      {state.status === "error" ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden /> {state.message}
        </p>
      ) : state.status === "done" && live ? (
        <p role="status" className="text-sm text-verified">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
