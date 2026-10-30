"use client";

import { CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState } from "react";
import { linkRepoAction, unlinkRepoAction, type RepoLinkState } from "@/app/app/projects/[projectId]/github/actions";
import { buttonClasses } from "@/components/ui/button";

const IDLE: RepoLinkState = { status: "idle" };

const field = "min-h-11 w-full rounded-sm border border-line bg-surface px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * Linking a project to a repository (ADR 0126): owners and admins type
 * owner/name, and the server asks GitHub before saving it.
 */
export function RepoLinkForm({ projectId, linked, suggestion, disabledReason }: { projectId: string; linked: string | null; suggestion: string | null; disabledReason: string | null }) {
  const [linkState, link, linking] = useActionState(linkRepoAction.bind(null, projectId), IDLE);
  const [unlinkState, unlink, unlinking] = useActionState(unlinkRepoAction.bind(null, projectId), IDLE);
  const busy = linking || unlinking || Boolean(disabledReason);
  const message = linkState.status === "error" ? linkState.message : unlinkState.status === "error" ? unlinkState.message : null;

  return (
    <div className="grid gap-3">
      <form action={link} className="grid gap-3 rounded-md border border-line bg-surface-sunken/60 p-4">
        <label className="grid gap-1.5 text-sm font-medium">
          {linked ? "Link a different repository" : "Repository"}
          <input
            name="repo"
            required
            maxLength={200}
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="none"
            placeholder="owner/name"
            defaultValue={linked ? "" : (suggestion ?? "")}
            disabled={busy}
            className={`${field} font-mono`}
          />
          <span className="text-xs font-normal text-ink-3">The workspace&apos;s token must have been given this repository on GitHub.</span>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy} className={buttonClasses("secondary", "sm")}>
            {linking ? "Checking…" : linked ? "Check and link instead" : "Check and link"}
          </button>
          {disabledReason ? <span className="text-sm text-ink-3">{disabledReason}</span> : null}
        </div>
      </form>
      {linked ? (
        <form action={unlink}>
          <button type="submit" disabled={busy} className={buttonClasses("ghost", "sm")}>
            {unlinking ? "Unlinking…" : `Unlink ${linked}`}
          </button>
        </form>
      ) : null}
      <div aria-live="polite" className="empty:hidden">
        {message ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-failed">
            <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden />
            {message}
          </p>
        ) : linkState.status === "linked" ? (
          <p role="status" className="flex items-start gap-2 text-sm text-ink-2">
            <CheckCircleIcon size={16} weight="bold" className="mt-0.5 shrink-0 text-verified" aria-hidden />
            Linked to <span className="font-mono">{linkState.repo}</span>. Pull requests go to <span className="font-mono">{linkState.branch}</span>.
          </p>
        ) : null}
      </div>
    </div>
  );
}
