"use client";

import { ArrowCounterClockwiseIcon, CheckCircleIcon, ScalesIcon, ShieldWarningIcon, WarningCircleIcon } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { recoverChangeAction } from "@/app/app/actions";
import { buttonClasses } from "@/components/ui/button";
import type { PolicyOutcome } from "@/core/billing/usage";
import { RECOVERY_CONFLICT_LABELS, type RecoveryItem } from "@/core/realityloop/recovery";
import { OUTCOME_LABELS } from "@/core/trust/policy";

const Surface = dynamic(() => import("@/components/files/codemirror"), {
  ssr: false,
  loading: () => (
    <div className="flex h-32 items-center justify-center rounded-md border border-line bg-surface-raised text-sm text-ink-3" role="status">
      Loading the preview…
    </div>
  ),
});

const fileHref = (projectId: string, path: string) => `/app/projects/${projectId}/files?path=${encodeURIComponent(path)}`;

function describe(item: RecoveryItem): string {
  if (item.status === "done") return "Already back to the version before the change. Nothing to do.";
  if (item.status === "conflict") return `${RECOVERY_CONFLICT_LABELS[item.reason]}.`;
  return item.action === "restore"
    ? `Restore revision ${item.toRevision}. Revision ${item.fromRevision}, the applied change, stays in the history.`
    : "Remove this file, which the change created. Its history is kept.";
}

/**
 * Undo an applied change: the plan per file, a preview of what each undo
 * writes, and one confirmation bound to the plan's hash. Files that changed
 * since the apply can't be chosen, so newer work is never overwritten. The
 * server rebuilds the plan and refuses if anything moved in between.
 */
export function RecoveryPanel({
  projectId,
  proposalId,
  items,
  planSha256,
  policy,
  previews,
  disabledReason,
}: {
  projectId: string;
  proposalId: string;
  items: RecoveryItem[];
  planSha256: string;
  policy: { outcome: string; findings: { rule: string; detail: string }[] };
  /** For each file that can be undone: what it holds now and what the undo writes ("" for a removal). */
  previews: Record<string, { current: string; target: string }>;
  disabledReason: string | null;
}) {
  const router = useRouter();
  const ready = items.filter((i) => i.status === "ready");
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(ready.map((i) => i.path)));
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const allBack = items.every((i) => i.status === "done");
  const conflicts = items.filter((i) => i.status === "conflict").length;
  const escalated = policy.outcome === "ESCALATE";

  function toggle(path: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function confirm() {
    setError(null);
    start(async () => {
      const r = await recoverChangeAction({ proposalId, planSha256, paths: allBack ? [] : [...chosen] });
      if (r.status === "error") return setError(r.message);
      router.refresh();
    });
  }

  const count = allBack ? 0 : chosen.size;
  const label = allBack ? "Finish undoing" : `Undo ${count} ${count === 1 ? "file" : "files"}`;

  return (
    <div className="grid gap-5">
      <ul className="grid divide-y divide-line rounded-md border border-line">
        {items.map((item) => {
          const preview = previews[item.path];
          const isReady = item.status === "ready";
          return (
            <li key={item.path} className="grid min-w-0 gap-2 px-4 py-3">
              <div className="flex min-w-0 items-start gap-3">
                {isReady ? (
                  <label className="-m-2 flex size-11 shrink-0 cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      className="size-5 accent-[var(--accent)]"
                      checked={chosen.has(item.path)}
                      onChange={() => toggle(item.path)}
                      disabled={pending || disabledReason !== null}
                      aria-label={`Undo ${item.path}`}
                    />
                  </label>
                ) : item.status === "done" ? (
                  <CheckCircleIcon size={20} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-label="Already back" />
                ) : (
                  <WarningCircleIcon size={20} weight="fill" className="mt-0.5 shrink-0 text-caution" aria-label="Left as it is" />
                )}
                <div className="grid min-w-0 gap-0.5">
                  <Link href={fileHref(projectId, item.path)} className="font-mono text-[0.8125rem] font-medium break-all text-ink hover:text-accent hover:underline">
                    {item.path}
                  </Link>
                  <p className="text-sm text-ink-2">{describe(item)}</p>
                  {item.status === "conflict" ? (
                    <p className="text-xs text-ink-3">To finish, put the file back yourself from its history, or keep the newer version and stop the task.</p>
                  ) : null}
                </div>
              </div>
              {isReady && preview ? (
                <div className="grid gap-2 pl-0 sm:pl-11">
                  <button
                    type="button"
                    className={buttonClasses("ghost", "sm", "-ml-4 justify-self-start")}
                    aria-expanded={open === item.path}
                    onClick={() => setOpen((p) => (p === item.path ? null : item.path))}
                  >
                    {open === item.path ? "Hide the preview" : "Preview the undo"}
                  </button>
                  {open === item.path ? (
                    <Surface
                      key={item.path}
                      path={item.path}
                      value={preview.target}
                      original={preview.current}
                      controls={false}
                      label={`What undoing ${item.path} writes`}
                    />
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="grid gap-2 rounded-sm border border-line bg-surface-raised/50 p-4 text-sm">
        <p className="flex items-center gap-2 font-medium">
          {escalated ? (
            <ShieldWarningIcon size={16} weight="fill" className="shrink-0 text-approval" aria-hidden />
          ) : (
            <ScalesIcon size={16} weight="bold" className="shrink-0 text-ink-3" aria-hidden />
          )}
          Rules: {OUTCOME_LABELS[policy.outcome as PolicyOutcome] ?? policy.outcome}
        </p>
        {policy.findings.length ? (
          <ul className="grid gap-1 text-ink-2">
            {policy.findings.map((f, i) => (
              <li key={i}>{f.detail}</li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-2">An undo is a change too, so it needs a person&apos;s approval. Nothing sensitive was found.</p>
        )}
        <p className="text-ink-2">Only project files are undone. Anything done elsewhere with this change, such as a deploy, isn&apos;t.</p>
      </div>

      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
          {error}
        </p>
      ) : null}

      {ready.length || allBack ? (
        <div className="grid gap-3 border-t border-line pt-5">
          <p className="text-sm">
            {allBack ? (
              "Every file is already back at its earlier version. Confirming checks that again and records it."
            ) : (
              <>
                You are approving the undo of{" "}
                <span className="font-medium">
                  {count} of {items.length} {items.length === 1 ? "file" : "files"}
                </span>{" "}
                exactly as previewed. Farbaek checks each restored file against its earlier version before it records the undo.
                {conflicts || count < ready.length ? " It stays here until every file is back." : null}
              </>
            )}
          </p>
          <div>
            <button type="button" className={buttonClasses("primary", "md", "w-full sm:w-auto")} onClick={confirm} disabled={pending || disabledReason !== null || (!allBack && count === 0)}>
              <ArrowCounterClockwiseIcon size={16} weight="bold" aria-hidden /> {pending ? "Undoing…" : label}
            </button>
          </div>
          {disabledReason ? <p className="text-sm text-ink-3">{disabledReason}</p> : null}
        </div>
      ) : (
        <p className="border-t border-line pt-5 text-sm text-ink-2">
          No file can be undone automatically right now. Put them back yourself from their history, or stop the task.
        </p>
      )}
    </div>
  );
}
