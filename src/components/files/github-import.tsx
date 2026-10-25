"use client";

import { GithubLogoIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState, useId } from "react";
import { importGitHubAction, type GitHubImportState } from "@/app/app/projects/github-actions";
import { buttonClasses } from "@/components/ui/button";

const IDLE: GitHubImportState = { status: "idle" };

/**
 * Import a public GitHub repository as a new project (ADR 0074). The server
 * downloads it; this form only names it.
 */
export function GitHubImportForm({ disabledReason }: { disabledReason: string | null }) {
  const [state, action, pending] = useActionState(importGitHubAction, IDLE);
  const id = useId();
  const error = state.status === "error" ? state.message : null;
  return (
    <form action={action} className="grid gap-3">
      <label htmlFor={id} className="text-sm font-medium">
        Public repository
      </label>
      <div className="relative">
        <GithubLogoIcon size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
        <input
          id={id}
          name="source"
          required
          maxLength={400}
          defaultValue={state.status === "error" ? state.source : undefined}
          placeholder="github.com/owner/repo"
          autoComplete="off"
          spellCheck={false}
          inputMode="url"
          disabled={Boolean(disabledReason) || pending}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
          className="h-11 w-full rounded-sm border border-line-strong/60 bg-surface pl-10 pr-3.5 font-mono text-base shadow-e1 transition-colors placeholder:text-ink-3 focus:border-accent disabled:bg-surface-raised"
        />
      </div>
      <p id={`${id}-hint`} className="text-xs leading-relaxed text-ink-3">
        Public repositories only for now. Farbaek downloads the latest commit, leaves out secrets, binaries and dependency folders, and notes which commit it came from.
      </p>
      {error ? (
        <p id={`${id}-error`} role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden /> {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || Boolean(disabledReason)} className={buttonClasses("secondary")}>
          {pending ? "Downloading from GitHub…" : "Import from GitHub"}
        </button>
        {disabledReason ? <p className="text-sm text-ink-3">{disabledReason}</p> : null}
      </div>
    </form>
  );
}
