import { ArrowRightIcon, GitDiffIcon, RewindIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { CardTitle } from "@/components/app/primitives";
import { LocalTime } from "@/components/ui/local-time";
import { StatusGlyph } from "@/components/ui/status-badge";
import { linkWords, type PreventionRule, type ReplayStep } from "@/core/trust/incidents";
import { TEST_OUTCOME_WORDS, type TestOutcome } from "@/core/trust/rules-test";
import { EFFECTS, explainRule } from "@/core/trust/workspace-rules";

const THEN: Record<TestOutcome, string> = { own: "applied on its own", person: "waited for a person", owner: "needed an owner or admin", stopped: "was stopped" };

/**
 * The Incident Replay Theatre (ADR 0083): the incident's changes, what the
 * policy decided then, and what each suggested rule would have decided.
 * Acting on it goes through the policy builder, which tests the rule
 * against past changes before it can be activated.
 */
export function ReplayTheatre({
  number,
  steps,
  suggestions,
  exact,
  builderReason,
}: {
  number: number;
  steps: ReplayStep[];
  suggestions: PreventionRule[];
  exact: boolean;
  /** Why the policy builder can't be opened from here, or null. */
  builderReason: string | null;
}) {
  return (
    <section aria-labelledby="replay-title" className="grid gap-4">
      <div className="grid gap-1">
        <CardTitle id="replay-title" icon={RewindIcon}>
          Replay
        </CardTitle>
        <p className="text-sm text-ink-3">What happened to each change, and what the suggested rules would have done instead. Nothing here changes anything.</p>
      </div>

      {steps.length === 0 ? (
        <p className="text-sm leading-relaxed text-ink-2">
          No changes are linked to this problem, so there&apos;s nothing to replay. A problem about a change, or about a project with changes applied the day before, shows them
          here.
        </p>
      ) : (
        <>
          <p className="text-sm text-ink-2">{linkWords(exact, 24)}</p>
          <ol className="grid gap-3">
            {steps.map((s) => (
              <li key={s.change.proposalId} className="grid gap-2 rounded-sm border border-line bg-surface-raised/50 px-4 py-3">
                <Link href={`/app/tasks/${s.change.taskId}`} className="inline-flex min-h-11 flex-wrap items-center gap-x-2 text-sm hover:underline">
                  <GitDiffIcon size={16} weight="bold" className="shrink-0 text-ink-3" aria-hidden />
                  <span className="font-mono text-xs text-accent">{s.change.files[0]?.path ?? "A change"}</span>
                  {s.change.files.length > 1 ? <span className="text-ink-3">and {s.change.files.length - 1} more</span> : null}
                  <span className="text-xs text-ink-3">
                    <LocalTime iso={s.change.at} />
                  </span>
                </Link>
                <p className="text-sm">Then it {THEN[s.then]}.</p>
                <ul className="grid gap-1.5">
                  {s.withRule.map((w) => (
                    <li key={w.effect} className="flex items-start gap-2 text-sm">
                      <StatusGlyph status={w.stricter ? "verified" : "off"} className="mt-0.5" />
                      <span>
                        With &ldquo;{EFFECTS[w.effect].label}&rdquo;, it would have {TEST_OUTCOME_WORDS[w.outcome]}
                        {w.stricter ? "." : ", the same as it did."}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </>
      )}

      {suggestions.length > 0 ? (
        <div className="grid gap-3">
          <p className="text-sm font-medium">Rules that would prevent it next time</p>
          {suggestions.map((r) => (
            <div key={r.effect} className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-line px-4 py-3">
              <p className="min-w-0 flex-1 text-sm leading-relaxed">{explainRule(r)}</p>
              {builderReason ? (
                <span className="text-xs text-ink-3">{builderReason}</span>
              ) : (
                <Link href={`/app/policies?incident=${number}&effect=${r.effect}#rule-builder`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent hover:underline">
                  Open in Rules <ArrowRightIcon size={14} weight="bold" aria-hidden />
                </Link>
              )}
            </div>
          ))}
          <p className="text-xs leading-relaxed text-ink-3">The rule builder tests a rule against the last 90 days of changes before you can activate it.</p>
        </div>
      ) : null}
    </section>
  );
}
