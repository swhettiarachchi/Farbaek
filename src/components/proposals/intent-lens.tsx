"use client";

import { CrosshairIcon, QuestionIcon, XCircleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { hunkRange, type FileLens, type LensSummary } from "@/core/realityloop/intent-lens";

/** Rows shown before "Show all". */
const FIRST = 6;

/**
 * The Intent Diff Lens summary (ADR 0041): how the proposal's changes read
 * against the contract. Flags are exact; matches are pointers found by
 * shared words, and the line says so.
 */
export function IntentLensSummary({ summary }: { summary: LensSummary }) {
  if (summary.hunks === 0) return null;
  const parts = [
    summary.matched ? `${summary.matched} ${summary.matched === 1 ? "matches" : "match"} a contract clause by its words` : null,
    summary.unexplained ? `${summary.unexplained} no clause explains` : null,
    summary.flagged ? `${summary.flagged} flagged by the contract` : null,
  ].filter(Boolean);
  return (
    <div className="grid gap-1.5 rounded-sm border border-line bg-surface-raised/50 px-4 py-3">
      <p className="text-sm">
        <span className="font-medium">
          {summary.hunks} {summary.hunks === 1 ? "change" : "changes"}
        </span>
        {parts.length ? `: ${parts.join(", ")}.` : "."}
      </p>
      <p className="text-xs leading-relaxed text-ink-3">
        Flags come from the contract&apos;s paths, operations and protected fields, exactly. Matches only point to the clause a change shares words with; read the change to judge it.
      </p>
    </div>
  );
}

function Chip({ tone, icon: ChipIcon, children, title }: { tone: "failed" | "verified" | "approval"; icon: typeof XCircleIcon; children: React.ReactNode; title?: string }) {
  const cls = {
    failed: "border-failed/35 text-failed",
    verified: "border-verified/35 text-ink-2",
    approval: "border-approval/40 border-dashed text-approval",
  }[tone];
  return (
    <span title={title} className={`inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${cls}`}>
      <ChipIcon size={13} weight="bold" className={`shrink-0 ${tone === "verified" ? "text-verified" : ""}`} aria-hidden />
      {/* Phones have no hover to read a cut-off clause, so it wraps there; wider screens keep one line. */}
      <span className="min-w-0 leading-snug sm:truncate">{children}</span>
    </span>
  );
}

/** One file's hunks, each with what the contract says about it. */
export function FileLensRows({ lens }: { lens: FileLens }) {
  const [all, setAll] = useState(false);
  if (lens.hunks.length === 0) return null;
  const shown = all ? lens.hunks : lens.hunks.slice(0, FIRST);
  return (
    <div className="grid gap-1">
      <ul className="grid divide-y divide-line rounded-sm border border-line" aria-label={`How the changes to ${lens.path} read against the contract`}>
        {shown.map((h, i) => (
          <li key={i} className="flex flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
            <span className="shrink-0 font-mono text-xs text-ink-3 sm:w-36">{hunkRange(h.hunk)}</span>
            <span className="flex min-w-0 flex-wrap gap-1.5">
              {h.flags.map((f) => (
                <Chip key={f.detail} tone="failed" icon={XCircleIcon}>
                  {f.detail}
                </Chip>
              ))}
              {h.match ? (
                <Chip tone="verified" icon={CrosshairIcon} title={`${h.match.statement} Shared words: ${h.match.shared.join(", ")}.`}>
                  <span className="font-medium">{h.match.label}</span> · {h.match.statement}
                </Chip>
              ) : null}
              {h.unexplained ? (
                <Chip tone="approval" icon={QuestionIcon}>
                  No contract clause explains this change
                </Chip>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {lens.hunks.length > FIRST && !all ? (
        <button type="button" onClick={() => setAll(true)} className="min-h-11 justify-self-start rounded-full px-3 text-sm font-medium text-accent hover:bg-accent/[0.06]">
          Show all {lens.hunks.length} changes in this file
        </button>
      ) : null}
    </div>
  );
}
