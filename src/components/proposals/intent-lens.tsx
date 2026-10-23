"use client";

import { CrosshairIcon, QuestionIcon, SparkleIcon, WarningCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { suggestLensMappingAction } from "@/app/app/actions";
import { buttonClasses } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/local-time";
import { hunkRange, type LensSummary } from "@/core/realityloop/intent-lens";
import type { SuggestedFileLens } from "@/core/realityloop/lens-suggestion";

/** The AI mapping's state on one proposal (ADR 0044). */
export interface LensAiState {
  proposalId: string;
  /** Whether the proposal can still be mapped: pending and inside its window. */
  open: boolean;
  /** The stored mapping's model and time, or null when nobody has asked. */
  suggestion: { model: string; createdAt: string } | null;
  /** Why asking isn't possible here, or null when it is. */
  disabledReason: string | null;
}

/** Rows shown before "Show all". */
const FIRST = 6;

/**
 * The Intent Diff Lens summary (ADR 0041): how the proposal's changes read
 * against the contract. Flags are exact; matches are pointers found by
 * shared words, and the line says so.
 */
export function IntentLensSummary({ summary, ai = null }: { summary: LensSummary; ai?: LensAiState | null }) {
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
      {ai ? <AskAi ai={ai} /> : null}
    </div>
  );
}

/** Asks the model to map each change to a clause, or says when it did. Metered, refunded if it fails. */
function AskAi({ ai }: { ai: LensAiState }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const ask = () =>
    start(async () => {
      setError(null);
      const r = await suggestLensMappingAction({ proposalId: ai.proposalId });
      if (r.status === "error") return setError(r.message);
      router.refresh();
    });
  return (
    <div className="mt-1 grid gap-2 border-t border-line pt-3">
      {ai.suggestion ? (
        <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-2">
          <SparkleIcon size={14} weight="bold" className="mt-px shrink-0 text-accent" aria-hidden />
          <span>
            AI mapping by <span className="font-mono">{ai.suggestion.model}</span>, <RelativeTime iso={ai.suggestion.createdAt} />. Each AI chip is a suggestion, not a check; the flags above it still stand.
          </span>
        </p>
      ) : null}
      {ai.open ? (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={ask} disabled={pending || Boolean(ai.disabledReason)} className={buttonClasses(ai.suggestion ? "ghost" : "secondary", "sm")}>
            <SparkleIcon size={15} weight="bold" aria-hidden /> {pending ? "Mapping…" : ai.suggestion ? "Ask again" : "Ask AI to map each change"}
          </button>
          <span className="text-xs text-ink-3">{ai.disabledReason ?? "Uses a little of this period's AI usage; refunded if it fails."}</span>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden /> {error}
        </p>
      ) : null}
    </div>
  );
}

function Chip({ tone, icon: ChipIcon, children, title }: { tone: "failed" | "verified" | "approval" | "ai"; icon: typeof XCircleIcon; children: React.ReactNode; title?: string }) {
  const cls = {
    failed: "border-failed/35 text-failed",
    verified: "border-verified/35 text-ink-2",
    approval: "border-approval/40 border-dashed text-approval",
    ai: "border-accent/40 border-dashed text-ink-2",
  }[tone];
  return (
    <span title={title} className={`inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${cls}`}>
      <ChipIcon size={13} weight="bold" className={`shrink-0 ${tone === "verified" ? "text-verified" : tone === "ai" ? "text-accent" : ""}`} aria-hidden />
      {/* Phones have no hover to read a cut-off clause, so it wraps there; wider screens keep one line. */}
      <span className="min-w-0 leading-snug sm:truncate">{children}</span>
    </span>
  );
}

/** One file's hunks, each with what the contract says about it. */
export function FileLensRows({ lens }: { lens: SuggestedFileLens }) {
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
              {h.ai ? (
                <Chip tone="ai" icon={SparkleIcon} title={"none" in h.ai ? `AI: no clause fits. ${h.ai.reason}` : `AI: ${h.ai.label}, ${h.ai.statement} ${h.ai.reason}`}>
                  <span className="font-medium">AI</span> · {"none" in h.ai ? "no clause fits" : h.ai.label} · {h.ai.reason}
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
