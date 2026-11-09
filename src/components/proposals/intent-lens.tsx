"use client";

import { TreeStructureIcon, WarningCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { suggestLensMappingAction } from "@/app/app/actions";
import { buttonClasses } from "@/components/ui/button";
import { modelName } from "@/core/billing/model-names";
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

/** A name at the start of a sentence: "an AI model" becomes "An AI model". */
const capitalized = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);

/**
 * The Intent Diff Lens summary (ADR 0041): how the proposal's changes read
 * against the contract. Flags are exact; matches are pointers found by
 * shared words, and the line says so.
 */
export function IntentLensSummary({ summary, ai = null }: { summary: LensSummary; ai?: LensAiState | null }) {
  if (summary.hunks === 0) return null;
  const total = summary.hunks;
  // "Both changes", "the change", "2 of the 5 changes": a count is said as part of a sentence (ADR 0180).
  const which = (k: number) => (k === total ? (total === 1 ? "the change" : total === 2 ? "both changes" : `all ${total} changes`) : `${k} of the ${total} changes`);
  const lead = (k: number) => which(k).charAt(0).toUpperCase() + which(k).slice(1);
  const sentences = [
    summary.flagged ? `The plan flags ${which(summary.flagged)}.` : null,
    summary.unexplained ? `No line of the plan explains ${which(summary.unexplained)}.` : null,
    summary.matched ? `${lead(summary.matched)} ${summary.matched === 1 ? "shares" : "share"} words with the plan.` : null,
  ].filter(Boolean);
  return (
    <div className="grid gap-1.5 rounded-sm border border-line bg-surface-raised/50 px-4 py-3">
      <p className="text-sm">{sentences.length ? sentences.join(" ") : "Read the change to judge how it fits the plan."}</p>
      <p className="text-xs leading-relaxed text-ink-3">
        A flag means it breaks the plan, and that part is exact. A match only means it shares words with a line of the plan, so read the change to judge it.
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
          <TreeStructureIcon size={14} weight="bold" className="mt-px shrink-0 text-accent" aria-hidden />
          <span>
            {capitalized(modelName(ai.suggestion.model))} linked these changes to the plan <RelativeTime iso={ai.suggestion.createdAt} />. Its notes are suggestions, not checks, and any flags still stand.
          </span>
        </p>
      ) : null}
      {ai.open ? (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={ask} disabled={pending || Boolean(ai.disabledReason)} className={buttonClasses(ai.suggestion ? "ghost" : "secondary", "sm")}>
            <TreeStructureIcon size={15} weight="bold" aria-hidden /> {pending ? "Asking…" : ai.suggestion ? "Ask again" : "Ask AI to link each change to the plan"}
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

/** Ends a line with a full stop when it has none, so two facts don't run together. */
const sentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s : `${s}.`);

/** One or two words in the tone of what they say (ADR 0180). The facts behind them are lines, under the range. */
function Chip({ tone, children }: { tone: "failed" | "verified" | "approval" | "ai"; children: React.ReactNode }) {
  const cls = {
    failed: "border-failed/40 text-failed",
    // A match is a pointer by shared words, not a check: a green edge, in ink.
    verified: "border-verified/40 text-ink-2",
    approval: "border-approval/40 border-dashed text-approval",
    ai: "border-accent/40 border-dashed text-ink-2",
  }[tone];
  return (
    <span className={`inline-flex h-6 w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium ${cls}`}>
      {tone === "failed" ? <XCircleIcon size={14} weight="bold" aria-hidden /> : null}
      {children}
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
      <ul className="grid divide-y divide-line rounded-sm border border-line" aria-label={`How the changes to ${lens.path} read against the plan`}>
        {shown.map((h, i) => (
          <li key={i} className="grid gap-1.5 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="tabular text-xs font-medium text-ink-3">{hunkRange(h.hunk)}</span>
              {h.flags.length > 0 ? <Chip tone="failed">Breaks the plan</Chip> : null}
              {h.match && h.flags.length === 0 ? <Chip tone="verified">Matches the plan</Chip> : null}
              {h.unexplained ? <Chip tone="approval">Unexplained</Chip> : null}
              {h.ai ? <Chip tone="ai">{"none" in h.ai ? "AI found no link" : "AI linked"}</Chip> : null}
            </div>
            {h.flags.map((f) => (
              <p key={f.detail} className="text-sm leading-relaxed text-ink-2">
                {sentence(f.detail)}
              </p>
            ))}
            {h.match ? (
              <p className="text-sm leading-relaxed text-ink-2" title={`Shared words: ${h.match.shared.join(", ")}.`}>
                <span className="font-medium text-ink">{h.match.id === "outcome" ? "The goal" : "Done when"}:</span> {h.match.statement}
              </p>
            ) : null}
            {h.unexplained ? <p className="text-sm leading-relaxed text-ink-2">No line of the plan explains this change.</p> : null}
            {h.ai ? (
              <p className="text-sm leading-relaxed text-ink-2">
                {"none" in h.ai ? (
                  <span className="font-medium text-ink">AI found no line of the plan that fits.</span>
                ) : (
                  <>
                    <span className="font-medium text-ink">AI linked it to:</span> {sentence(h.ai.statement)}
                  </>
                )}{" "}
                {h.ai.reason}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      {lens.hunks.length > FIRST && !all ? (
        <button type="button" onClick={() => setAll(true)} className={buttonClasses("ghost", "sm", "justify-self-start")}>
          Show all {lens.hunks.length} changes in this file
        </button>
      ) : null}
    </div>
  );
}
