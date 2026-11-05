import { CheckCircleIcon, CircleDashedIcon, EyeIcon, HourglassMediumIcon, ProhibitIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import { LiveRefresh } from "@/components/app/live-refresh";
import { RelativeTime } from "@/components/ui/local-time";
import { MUTATION_OPERATOR_WORDS, mutantExcerpt, mutationSummary, type ExcerptLine, type Mutant, type MutantResult } from "@/core/realityloop/mutation";
import type { MutationRunView } from "@/server/mutation/store";
import { RunMutation } from "./run-mutation";

const RESULT: Record<MutantResult, { label: string; Icon: typeof CheckCircleIcon; className: string }> = {
  survived: { label: "Survived", Icon: WarningCircleIcon, className: "border-approval/50 text-approval" },
  killed: { label: "Caught", Icon: CheckCircleIcon, className: "border-verified/40 text-verified" },
  timed_out: { label: "Caught: timed out", Icon: CheckCircleIcon, className: "border-verified/40 text-verified" },
  not_viable: { label: "Didn't load", Icon: ProhibitIcon, className: "border-dashed border-line-strong text-ink-2" },
  not_run: { label: "Not run", Icon: CircleDashedIcon, className: "border-dashed border-unverified/60 text-unverified" },
};
// Survivors first: they're what a person can act on.
const ORDER: MutantResult[] = ["survived", "killed", "timed_out", "not_viable", "not_run"];

function duration(ms: number | null): string | null {
  if (ms === null) return null;
  if (ms < 1000) return "under 1 s";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

function MutantLine({ m }: { m: Mutant }) {
  // A window around the change, so the mistake shows on a narrow screen; the full line is in the title.
  const e = mutantExcerpt(m, 14, 44);
  const row = (label: string, sign: string, line: ExcerptLine, full: string, className: string) => (
    <span className={`min-w-0 overflow-hidden whitespace-pre max-[18em]:whitespace-pre-wrap ${className}`} title={full}>
      <span className="sr-only">{label}: </span>
      <span aria-hidden>{sign} </span>
      {e.clipped ? "…" : ""}
      {line.head}
      <span className="rounded-[3px] bg-accent/10 px-0.5 font-medium text-ink">{line.changed}</span>
      {line.tail}
      {e.more ? "…" : ""}
    </span>
  );
  return (
    <div className="grid min-w-0 gap-1">
      <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-mono text-[0.78125rem] text-ink-2">
          {m.path}:{m.line}
        </span>
        <span className="text-ink-3">{MUTATION_OPERATOR_WORDS[m.operator]}</span>
      </p>
      <div className="grid min-w-0 gap-0.5 rounded-sm border border-line bg-canvas-2 px-2.5 py-1.5 font-mono text-[0.78125rem] leading-relaxed">
        {row("Before", "−", e.before, m.before, "text-ink-3")}
        {row("Mutant", "+", e.after, m.after, "text-ink")}
      </div>
    </div>
  );
}

/**
 * Mutation trials on a change waiting for review (ADR 0136): small mistakes
 * made on purpose in the lines the change adds, and whether the related
 * tests catch each one. Results are observed in a disposable sandbox; the
 * score covers these mutants only.
 */
export function MutationCard({ proposalId, taskId, planned, run, disabledReason }: { proposalId: string; taskId: string; planned: readonly Mutant[]; run: MutationRunView | null; disabledReason: string | null }) {
  const running = run?.status === "running";
  const done = run?.status === "done" ? run : null;
  const summary = done ? mutationSummary(done.mutants) : null;
  const sorted = done ? [...done.mutants].sort((a, b) => ORDER.indexOf(a.result) - ORDER.indexOf(b.result)) : [];

  return (
    <section aria-labelledby="mutation-heading" className="grid gap-4 rounded-md border border-line bg-canvas-2/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="mutation-heading" className="text-base font-medium">
          Do the tests catch mistakes here?
        </h3>
        <span className="text-xs text-ink-3">Nothing is applied</span>
      </div>
      <p className="max-w-[68ch] text-sm leading-relaxed text-ink-2">
        Farbaek makes small mistakes on purpose in the lines this change adds, such as moving a comparison&apos;s boundary, and runs the related tests once for each in a disposable sandbox. A mistake that makes a test fail was caught; one that doesn&apos;t survived. No AI is used.
      </p>

      {running ? (
        <p role="status" className="flex items-center gap-2 text-sm">
          <HourglassMediumIcon size={18} weight="bold" className="text-approval motion-safe:animate-pulse" aria-hidden />
          Running the tests against each mistake, started <RelativeTime iso={run.startedAt} />. This page updates by itself.
        </p>
      ) : null}
      <LiveRefresh active={running} everyMs={4_000} />

      {run?.status === "failed" ? (
        <p className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={18} className="mt-px shrink-0" aria-hidden />
          <span>{run.reason}</span>
        </p>
      ) : null}

      {done && summary ? (
        <div className="grid gap-3">
          <p className="text-[0.9375rem] font-medium">
            {summary.judged > 0 ? `The tests caught ${summary.caught} of ${summary.judged} mistakes.` : "No mistake could be judged."}
            {summary.survived > 0 ? ` ${summary.survived} survived: no test noticed ${summary.survived === 1 ? "it" : "them"}.` : ""}
          </p>
          <ul className="grid divide-y divide-line rounded-sm border border-line bg-surface">
            {sorted.map((m) => {
              const r = RESULT[m.result];
              return (
                <li key={m.id} className="grid gap-2 px-3 py-3 sm:px-4">
                  <span className={`inline-flex h-6 w-fit items-center gap-1 rounded-full border px-2.5 text-xs font-medium ${r.className}`}>
                    <r.Icon size={13} weight="bold" aria-hidden /> {r.label}
                  </span>
                  <MutantLine m={m} />
                  {m.failingTest ? (
                    <p className="text-xs text-ink-3">
                      Caught by <span className="font-mono text-[0.78125rem] text-ink-2">{m.failingTest}</span>
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <p className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
            <span className="inline-flex h-6 items-center gap-1 rounded-full border border-line px-2 font-medium text-ink-2">
              <EyeIcon size={13} weight="bold" aria-hidden /> Observed
            </span>
            Tests ran for {duration(done.computeMs) ?? "an unknown time"} in all, {duration(done.baselineMs) ?? "unknown"} without mistakes. This covers these mutants only; it isn&apos;t a measure of overall test quality.
          </p>
          {done.command ? <p className="break-all font-mono text-[0.78125rem] text-ink-3">{done.command}</p> : null}
        </div>
      ) : !running ? (
        planned.length > 0 ? (
          <div className="grid gap-2">
            <p className="text-sm font-medium">
              {planned.length} {planned.length === 1 ? "mistake" : "mistakes"} it would make
            </p>
            <ul className="grid gap-3">
              {planned.map((m) => (
                <li key={m.id}>
                  <MutantLine m={m} />
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-ink-2">This change adds no lines with a comparison, condition, true or false, or arithmetic to change.</p>
        )
      ) : null}

      {planned.length > 0 || done ? (
        <p className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
          <span className="inline-flex h-6 items-center rounded-full border border-dashed border-line-strong px-2 font-medium text-ink-2">Estimate</span>
          Uses up to 20 minutes of your plan&apos;s test space time, and no AI usage.
        </p>
      ) : null}
      {running || planned.length === 0 ? null : <RunMutation proposalId={proposalId} taskId={taskId} again={run !== null} disabledReason={disabledReason} />}
    </section>
  );
}
