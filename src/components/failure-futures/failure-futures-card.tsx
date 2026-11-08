import { SirenIcon, WarningIcon } from "@phosphor-icons/react/ssr";
import { modelName } from "@/core/billing/model-names";
import Link from "next/link";
import { LiveRefresh } from "@/components/app/live-refresh";
import { RelativeTime } from "@/components/ui/local-time";
import { StatusBadge, StatusGlyph, type Status } from "@/components/ui/status-badge";
import { LAB_OUTCOME_WORDS, type FailureFuture } from "@/core/realityloop/failure-futures";
import type { FailureTrialStatus, FailureTrialView } from "@/server/failure-futures/store";
import { TryFailure } from "./try-failure";

type Shown = FailureTrialStatus | "hypothetical";

// Each state is a status kind with its icon (ADR 0183): not tried yet is dashed, a running trial turns.
const STATUS: Record<Shown, { label: string; status: Status }> = {
  hypothetical: { label: "Not tried yet", status: "unverified" },
  running: { label: LAB_OUTCOME_WORDS.running.label, status: "working" },
  reproduced: { label: LAB_OUTCOME_WORDS.reproduced.label, status: "failed" },
  handled: { label: LAB_OUTCOME_WORDS.handled.label, status: "verified" },
  inconclusive: { label: LAB_OUTCOME_WORDS.inconclusive.label, status: "unverified" },
  not_testable: { label: LAB_OUTCOME_WORDS.not_testable.label, status: "off" },
  failed: { label: LAB_OUTCOME_WORDS.failed.label, status: "unverified" },
};

const seconds = (ms: number | null) => (ms === null ? null : ms < 1000 ? "under 1 s" : `${Math.round(ms / 1000)} s`);

/** Why a past incident put this scenario here (ADR 0145), in words and with a link to it. */
function IncidentNote({ incident }: { incident: NonNullable<FailureFuture["incident"]> }) {
  const link = (
    <Link href={`/app/incidents/${incident.number}`} className="font-medium text-accent hover:underline">
      problem #{incident.number}
    </Link>
  );
  return (
    <p className="flex max-w-[68ch] items-start gap-2 text-sm leading-relaxed">
      <SirenIcon size={16} weight="bold" className="mt-0.5 shrink-0 text-caution" aria-hidden />
      <span>
        {incident.exact ? <>This happened before: {link}, &ldquo;{incident.title}&rdquo;, came from a change to a file this one edits.</> : <>Seen before: {link}, &ldquo;{incident.title}&rdquo;, opened within a day of a change to a file this one edits.</>}
      </span>
    </p>
  );
}

/** What one finished trial did: the AI-written test, the command, and the output, so a person can judge it. */
function TrialDetail({ trial }: { trial: FailureTrialView }) {
  return (
    <details className="group rounded-sm border border-line bg-surface">
      <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium text-ink-2 hover:text-ink">What the trial did</summary>
      <div className="grid gap-3 border-t border-line p-3 text-sm">
        {trial.reason ? <p className="leading-relaxed text-ink-2">{trial.reason}</p> : null}
        {trial.expects ? (
          <p className="leading-relaxed">
            <span className="font-medium">The test expects: </span>
            {trial.expects}
          </p>
        ) : null}
        {trial.command ? (
          <dl className="grid gap-1 text-xs text-ink-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-3">
            <dt>Command</dt>
            <dd className="min-w-0 break-all font-mono text-[0.78125rem] text-ink-2">{trial.command}</dd>
            {trial.exitCode !== null ? (
              <>
                <dt>Exit code</dt>
                <dd className="font-mono text-[0.78125rem] text-ink-2">
                  {trial.exitCode}
                  {seconds(trial.durationMs) ? <span className="font-sans text-ink-3"> in {seconds(trial.durationMs)}</span> : null}
                </dd>
              </>
            ) : null}
            {trial.model ? (
              <>
                <dt>Test written by</dt>
                <dd className="text-ink-2">{modelName(trial.model)}</dd>
              </>
            ) : null}
          </dl>
        ) : null}
        {trial.test ? (
          <div className="grid gap-1">
            <p className="text-xs text-ink-3">
              The test, written by AI, at <span className="font-mono text-[0.78125rem]">{trial.testPath}</span>
            </p>
            <pre className="max-h-72 overflow-auto rounded-sm border border-line bg-canvas-2 p-3 font-mono text-[0.78125rem] leading-relaxed text-ink">{trial.test}</pre>
          </div>
        ) : null}
        {trial.output ? (
          <div className="grid gap-1">
            <p className="text-xs text-ink-3">The end of its output</p>
            <pre className="max-h-56 overflow-auto rounded-sm border border-line bg-canvas-2 p-3 font-mono text-[0.78125rem] leading-relaxed text-ink-2">{trial.output}</pre>
          </div>
        ) : null}
      </div>
    </details>
  );
}

/**
 * The Failure Futures Lab on a change waiting for review (ADR 0135): failure
 * scenarios from the lines the change adds, each hypothetical until a person
 * tries it. A trial's result is what one AI-written test observed in a
 * disposable sandbox, shown with the test itself.
 */
export function FailureFuturesCard({
  proposalId,
  taskId,
  futures,
  trials,
  disabledReason,
}: {
  proposalId: string;
  taskId: string;
  futures: readonly FailureFuture[];
  trials: readonly FailureTrialView[];
  disabledReason: string | null;
}) {
  const running = trials.find((t) => t.status === "running") ?? null;
  const latest = (kind: string) => trials.find((t) => t.kind === kind) ?? null;

  return (
    <section aria-labelledby="failure-futures-heading" className="grid gap-4 rounded-md border border-line bg-canvas-2/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="failure-futures-heading" className="flex items-center gap-2 text-base font-medium">
          <WarningIcon size={20} className="shrink-0 text-ink-3" aria-hidden /> Failure futures
        </h3>
        <span className="text-xs text-ink-3">Nothing is applied</span>
      </div>
      <p className="max-w-[68ch] text-sm leading-relaxed text-ink-2">
        Failures this change could meet, found in the lines it adds and in this project&apos;s past problems. Each one is hypothetical until you try it. Then Farbaek writes one test
        that simulates the failure, and a throwaway test space runs it with this change.
      </p>

      {running ? (
        <p role="status" className="flex items-center gap-2 text-sm">
          <StatusGlyph status="working" />
          Trying &ldquo;{futures.find((f) => f.kind === running.kind)?.title ?? "a failure"}&rdquo;, started <RelativeTime iso={running.startedAt} />. This page updates by itself.
        </p>
      ) : null}
      <LiveRefresh active={running !== null} everyMs={4_000} />

      {futures.length === 0 ? (
        <p className="text-sm leading-relaxed text-ink-2">
          This change adds no lines that suggest a failure Farbaek looks for: webhooks, network calls, database writes, credentials, input parsing, dates, retries or settings.
        </p>
      ) : (
        <ul className="grid divide-y divide-line rounded-sm border border-line bg-surface">
          {futures.map((f) => {
            const trial = latest(f.kind);
            const shown = STATUS[trial?.status ?? "hypothetical"];
            return (
              <li key={f.kind} className="grid gap-2.5 px-3 py-3.5 sm:px-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 text-[0.9375rem] font-medium leading-snug">{f.title}</p>
                  <StatusBadge status={shown.status} label={shown.label} />
                </div>
                {f.incident ? <IncidentNote incident={f.incident} /> : null}
                <p className="max-w-[68ch] text-sm leading-relaxed text-ink-2">{f.risk}</p>
                <ul className="grid gap-1">
                  {f.evidence.map((e) => (
                    <li key={`${e.path}:${e.line}`} className="grid min-w-0 gap-0.5 text-xs text-ink-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-3">
                      <span className="font-mono text-[0.78125rem] text-ink-2">
                        {e.path}:{e.line}
                      </span>
                      <span className="min-w-0 truncate font-mono text-[0.78125rem]" title={e.snippet}>
                        {e.snippet}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-ink-3">The trial: {f.trial}</p>
                {trial && trial.status !== "running" ? <TrialDetail trial={trial} /> : null}
                {trial?.status === "running" ? null : <TryFailure proposalId={proposalId} taskId={taskId} kind={f.kind} again={trial !== null} disabled={Boolean(disabledReason) || running !== null} />}
              </li>
            );
          })}
        </ul>
      )}

      {futures.length > 0 ? (
        <p className="text-xs leading-relaxed text-ink-3">Estimate: each trial uses one AI call from your workspace&apos;s usage and up to 15 minutes of test space time.</p>
      ) : null}
      {disabledReason && futures.length > 0 ? <p className="text-sm text-ink-3">{disabledReason}</p> : null}
    </section>
  );
}
