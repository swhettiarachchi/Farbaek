"use client";

import { RocketLaunchIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState, useState } from "react";
import { publishAction, type PublishState } from "@/app/app/projects/[projectId]/publish-actions";
import { buttonClasses } from "@/components/ui/button";
import { SITE_NAME_MAX, SITE_NAME_MESSAGES, siteNameProblem } from "@/core/publish/site";

const IDLE: PublishState = { status: "idle" };

/** The name and the Publish button. The name is checked as it's typed; the server checks it again. */
export function PublishForm({ projectId, domain, initialName, live, disabledReason }: { projectId: string; domain: string; initialName: string; live: boolean; disabledReason: string | null }) {
  const [state, action, pending] = useActionState(publishAction, IDLE);
  const [name, setName] = useState(initialName);
  const problem = siteNameProblem(name);
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
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || Boolean(disabledReason) || Boolean(problem)} className={buttonClasses("primary")}>
          <RocketLaunchIcon size={18} weight="bold" aria-hidden /> {pending ? "Publishing…" : live ? "Publish the latest files" : "Publish"}
        </button>
        {disabledReason ? <span className="text-sm text-ink-3">{disabledReason}</span> : null}
      </div>
      {state.status === "error" ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden /> {state.message}
        </p>
      ) : state.status === "done" ? (
        <p role="status" className="text-sm text-verified">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
