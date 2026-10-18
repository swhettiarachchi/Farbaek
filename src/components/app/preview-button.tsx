"use client";

import { BrowserIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { openProjectPreviewAction } from "@/app/app/projects/preview-actions";
import { buttonClasses } from "@/components/ui/button";

/**
 * Opens the project's current files on a private preview host, in a new tab.
 * The tab is opened at once (so browsers don't block it) and pointed at the
 * one-use link when it arrives.
 */
export function PreviewButton({ projectId, disabledReason, variant = "secondary" }: { projectId: string; disabledReason: string | null; variant?: "primary" | "secondary" }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function open() {
    setError(null);
    const tab = window.open("about:blank", "_blank");
    start(async () => {
      const r = await openProjectPreviewAction(projectId);
      if (r.status === "done" && tab) {
        tab.opener = null;
        tab.location.href = r.url;
      } else {
        tab?.close();
        setError(r.status === "error" ? r.message : "The browser blocked the new tab. Allow pop-ups for Farbaek and try again.");
      }
    });
  }

  return (
    <div className="grid gap-2">
      <span className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={open} disabled={pending || Boolean(disabledReason)} className={buttonClasses(variant, "sm")}>
          <BrowserIcon size={16} weight="bold" aria-hidden /> {pending ? "Opening…" : "Preview"}
        </button>
        {disabledReason ? <span className="text-xs text-ink-3">{disabledReason}</span> : null}
      </span>
      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden /> {error}
        </p>
      ) : null}
    </div>
  );
}
