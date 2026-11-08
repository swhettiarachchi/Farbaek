"use client";

import { GitDiffIcon, MagnifyingGlassIcon, WarningCircleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { proposeChangeAction } from "@/app/app/actions";
import { buttonClasses } from "@/components/ui/button";
import { EffortPicker } from "@/components/app/effort-picker";
import { AiUsageNote } from "@/components/app/usage-meters";
import type { Effort } from "@/core/agent/effort";
import { formatBytes } from "@/core/workspace/files";
import type { AiAvailability } from "@/server/workspace/ai-usage";

const MAX_FILES = 20;
const MAX_BYTES = 300 * 1024;
const SHOWN = 150;
/**
 * Pick the files the change needs, add notes, and ask the agent for a
 * proposal. Only the chosen files are sent, and only they can be edited.
 */
export function ProposeChange({
  taskId,
  projectId,
  files,
  ai,
}: {
  taskId: string;
  projectId: string;
  files: { path: string; sizeBytes: number }[];
  ai: AiAvailability;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [effort, setEffort] = useState<Effort>("balanced");
  const [pending, start] = useTransition();

  const sizes = useMemo(() => new Map(files.map((f) => [f.path, f.sizeBytes])), [files]);
  const matching = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? files.filter((f) => f.path.toLowerCase().includes(q)) : files;
  }, [files, filter]);
  const bytes = [...selected].reduce((n, p) => n + (sizes.get(p) ?? 0), 0);
  const tooMany = selected.size > MAX_FILES;
  const tooBig = bytes > MAX_BYTES;

  function toggle(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function submit() {
    setError(null);
    start(async () => {
      const r = await proposeChangeAction({ taskId, contextPaths: [...selected], notes, effort });
      if (r.status === "error") return setError(r.message);
      router.refresh();
    });
  }

  if (files.length === 0) {
    return (
      <p className="text-sm text-ink-2">
        This project has no files yet.{" "}
        <Link href={`/app/projects/${projectId}/files`} className="font-medium text-accent hover:underline">
          Import the project&apos;s files
        </Link>{" "}
        so the agent has something to work on.
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <p className="text-sm font-medium">Files the change needs</p>
        <label className="relative block">
          <span className="sr-only">Filter files</span>
          <MagnifyingGlassIcon size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by path"
            className="h-11 w-full rounded-sm border border-line-strong/60 bg-surface pr-3.5 pl-10 text-base shadow-e1 focus:border-accent sm:text-sm"
          />
        </label>
        <ul className="max-h-72 overflow-auto rounded-sm border border-line bg-surface" aria-label="Project files">
          {matching.slice(0, SHOWN).map((f) => (
            <li key={f.path} className="border-b border-line last:border-b-0">
              <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface-raised">
                <input type="checkbox" checked={selected.has(f.path)} onChange={() => toggle(f.path)} className="size-4 shrink-0 accent-[var(--accent)]" />
                <span className="min-w-0 flex-1 truncate font-mono text-[0.8125rem]">{f.path}</span>
                <span className="shrink-0 text-xs text-ink-3 tabular">{formatBytes(f.sizeBytes)}</span>
              </label>
            </li>
          ))}
          {matching.length === 0 ? <li className="px-3 py-3 text-sm text-ink-3">No files match.</li> : null}
        </ul>
        <p className={`text-xs tabular ${tooMany || tooBig ? "text-failed" : "text-ink-3"}`}>
          {selected.size === 0
            ? `Choose up to ${MAX_FILES} files, ${formatBytes(MAX_BYTES)} in all.`
            : `You chose ${selected.size} of up to ${MAX_FILES} files, ${formatBytes(bytes)} of ${formatBytes(MAX_BYTES)}.`}
        </p>
        {matching.length > SHOWN ? (
          <p className="text-xs text-ink-3">
            Showing {SHOWN} of {matching.length.toLocaleString("en-US")} files. Narrow the filter to find more.
          </p>
        ) : null}
        <p className="text-xs text-ink-3">The agent sees every path but only the contents of the files you choose, and it can only edit those. It can also suggest new files.</p>
      </div>

      <div className="grid gap-2">
        <label htmlFor="proposal-notes" className="text-sm font-medium">
          Notes for the agent <span className="font-normal text-ink-3">(optional)</span>
        </label>
        <textarea
          id="proposal-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={4000}
          rows={3}
          className="w-full rounded-sm border border-line-strong/60 bg-surface px-3.5 py-2.5 text-base shadow-e1 focus:border-accent"
        />
      </div>

      <div aria-live="polite" className="empty:hidden">
        {pending ? <p className="text-sm text-ink-2">The agent is reading the files and drafting targeted edits. This can take a minute or two.</p> : null}
        {error ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-failed">
            <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}
      </div>

      <EffortPicker value={effort} onChange={setEffort} disabled={pending || Boolean(ai.disabledReason)} />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending || selected.size === 0 || tooMany || tooBig || Boolean(ai.disabledReason)}
          className={buttonClasses("primary", "sm")}
        >
          <GitDiffIcon size={16} aria-hidden /> {pending ? "Suggesting…" : "Suggest a change"}
        </button>
        <p className="text-xs text-ink-3">
          {ai.disabledReason ?? (
            <>
              Nothing is applied until you approve it. <AiUsageNote percent={ai.percent} resetsAt={ai.resetsAt} period={ai.period} />
            </>
          )}
        </p>
      </div>
    </div>
  );
}
