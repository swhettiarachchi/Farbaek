import { ArrowRightIcon, TerminalWindowIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import { LiveRefresh } from "@/components/app/live-refresh";
import { LocalTime, RelativeTime } from "@/components/ui/local-time";
import { StatusBadge, StatusGlyph, type Status } from "@/components/ui/status-badge";
import { compareArena, type ArenaChange, type ArenaCheckState, type ArenaVerdict } from "@/core/realityloop/arena";
import type { ArenaRecord } from "@/server/arena/store";
import { TryChange } from "./try-change";

// Each check's state is a status kind with its icon (ADR 0183), its word in the kind's colour.
const STATE: Record<ArenaCheckState, { word: string; status: Status; className: string }> = {
  passed: { word: "Passed", status: "verified", className: "text-verified" },
  failed: { word: "Failed", status: "failed", className: "text-failed" },
  not_run: { word: "Didn't run", status: "unverified", className: "text-unverified" },
};

// What the change did to a check: anything still passing is verified, anything still failing needs a look.
const CHANGE: Record<ArenaChange, { word: string; status: Status }> = {
  breaks: { word: "Breaks", status: "failed" },
  fixes: { word: "Fixes", status: "verified" },
  still_passes: { word: "Still passes", status: "verified" },
  still_fails: { word: "Still fails", status: "attention" },
  not_run: { word: "No result", status: "unverified" },
};

const VERDICT: Record<ArenaVerdict, { text: string; status: Status; className: string }> = {
  breaks_checks: { text: "This change breaks a check that passes now.", status: "failed", className: "text-failed" },
  incomplete: { text: "Some checks didn't run, so this trial can't say how the change does.", status: "unverified", className: "text-unverified" },
  fixes_checks: { text: "This change fixes every check that fails now.", status: "verified", className: "text-verified" },
  keeps_passing: { text: "Every check still passes with this change.", status: "verified", className: "text-verified" },
  still_failing: { text: "Some checks fail both now and with this change.", status: "attention", className: "text-caution" },
};

const seconds = (ms: number | null) => (ms === null ? null : ms < 1000 ? "under 1 s" : `${Math.round(ms / 1000)} s`);

function State({ state, ms }: { state: ArenaCheckState; ms: number | null }) {
  const { word, status, className } = STATE[state];
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <StatusGlyph status={status} />
      <span className="font-medium">{word}</span>
      {state !== "not_run" && seconds(ms) ? <span className="text-xs text-ink-3">{seconds(ms)}</span> : null}
    </span>
  );
}

function ChangeWord({ change }: { change: ArenaChange }) {
  const { word, status } = CHANGE[change];
  return <StatusBadge status={status} label={word} />;
}

/**
 * The Future-State Arena on a change waiting for review (ADR 0076): run the
 * contract's checks on the current files and with this change, in one
 * disposable sandbox, and compare. Results are observed; the time it takes
 * is an estimate, and says so. A trial never verifies the change.
 */
export function ArenaPanel({ proposalId, taskId, checks, run, disabledReason }: { proposalId: string; taskId: string; checks: readonly string[]; run: ArenaRecord | null; disabledReason: string | null }) {
  const running = run?.status === "running";
  const compared = run && run.baseline ? compareArena(run.baseline, run.candidate ?? []) : null;
  const verdict = run?.status === "done" && compared ? VERDICT[compared.verdict] : null;

  return (
    <section aria-labelledby="arena-heading" className="grid gap-4 rounded-md border border-line bg-canvas-2/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="arena-heading" className="flex items-center gap-2 text-base font-medium">
          <TerminalWindowIcon size={20} className="shrink-0 text-ink-3" aria-hidden /> Try it before you approve
        </h3>
        <span className="text-xs text-ink-3">Nothing is applied</span>
      </div>
      <p className="max-w-[68ch] text-sm leading-relaxed text-ink-2">
        Farbaek tries this change on a throwaway copy: it runs the checks on your current files, then again with this change. Your project isn&apos;t touched, and a trial never
        counts as verified.
      </p>

      {running ? (
        <p role="status" className="flex items-center gap-2 text-sm">
          <StatusGlyph status="working" />
          Trying it on a copy, started <RelativeTime iso={run.startedAt} />. This page updates by itself.
        </p>
      ) : null}
      <LiveRefresh active={running} everyMs={3_000} />

      {verdict ? (
        <p className={`flex items-start gap-2 text-[0.9375rem] font-medium ${verdict.className}`}>
          <StatusGlyph status={verdict.status} size={20} className="mt-px" />
          <span>{verdict.text}</span>
        </p>
      ) : null}
      {run?.status === "failed" ? (
        <p className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
          <span>{run.failure}</span>
        </p>
      ) : null}

      {compared && compared.rows.length > 0 ? (
        <div className="grid gap-2">
          <ul className="grid divide-y divide-line rounded-sm border border-line bg-surface">
            {compared.rows.map((row, i) => (
              <li key={`${row.name}-${i}`} className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
                <span className="min-w-0 truncate font-mono text-[0.8125rem] text-ink" title={row.name}>
                  {row.name}
                </span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="sr-only">Now:</span>
                  <State state={row.before} ms={run!.baseline?.[i]?.durationMs ?? null} />
                  <ArrowRightIcon size={14} weight="bold" className="text-ink-3" aria-label="with this change" />
                  {run!.candidate ? <State state={row.after} ms={run!.candidate[i]?.durationMs ?? null} /> : <State state="not_run" ms={null} />}
                  {run?.status === "done" ? <ChangeWord change={row.change} /> : null}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs leading-relaxed text-ink-3">
            Observed in this trial{run?.finishedAt ? <>, finished <LocalTime iso={run.finishedAt} /></> : null}. Left: your current files. Right: with this change.
          </p>
        </div>
      ) : !running ? (
        <div className="grid gap-2">
          <p className="text-sm font-medium">Checks it runs</p>
          <ul className="grid gap-1">
            {checks.map((c) => (
              <li key={c} className="min-w-0 break-all font-mono text-[0.8125rem] text-ink-2">
                {c}
              </li>
            ))}
          </ul>
          <p className="text-xs leading-relaxed text-ink-3">Estimate: it uses up to 20 minutes of your plan&apos;s test space time, usually a few.</p>
        </div>
      ) : null}

      {running ? null : <TryChange proposalId={proposalId} taskId={taskId} again={run !== null} disabledReason={disabledReason} />}
    </section>
  );
}
