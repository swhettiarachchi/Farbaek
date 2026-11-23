import { ArrowsClockwiseIcon } from "@phosphor-icons/react/ssr";
import { finishable, jobState, stoppedBeforeDrawing, tookText, type JobRow, type JobStage } from "@/core/survey/autosurvey/job";
import { Card, CardTitle } from "@/components/app/primitives";
import { LiveRefresh } from "@/components/app/live-refresh";
import { RelativeTime } from "@/components/ui/local-time";
import { StatusBadge, StatusGlyph, type Status } from "@/components/ui/status-badge";
import { FinishRun } from "./finish-run";

const GLYPH: Record<JobStage["state"], Status> = { waiting: "pending", running: "working", done: "done", failed: "failed", skipped: "off" };
const STATE_WORDS: Record<JobStage["state"], string> = { waiting: "waiting", running: "working", done: "done", failed: "failed", skipped: "skipped" };

/** Shown while a run is going, cut off, or ended with a stage that failed in the last day; otherwise the plan speaks for itself. */
export function showJob(job: JobRow | null, now: Date): job is JobRow {
  if (!job) return false;
  const state = jobState(job, now);
  if (state === "running" || state === "interrupted") return true;
  return job.stages.some((s) => s.state === "failed") && now.getTime() - new Date(job.updated_at).getTime() < 24 * 3_600_000;
}

/**
 * Generate Plan's run, as the server reaches each stage (stage 229, ADR 0239): what's done, what's working, what failed and why. The
 * page refreshes itself while it runs, so a surveyor who left and came back sees it finish.
 */
export function JobProgress({ job, now, projectId, latestVersion, disabledReason = null }: { job: JobRow; now: Date; projectId: string; latestVersion: number; disabledReason?: string | null }) {
  const state = jobState(job, now);
  const running = state === "running";
  const problem = job.stages.some((s) => s.state === "failed");
  // Measured on the server as each stage finished (stage 235): shown only where it was measured, never estimated. A run finished after
  // it was cut off has no start-to-finish time worth saying: it includes the time it lay stopped.
  const total = (state === "done" || state === "failed") && !job.result.finishedLater ? new Date(job.updated_at).getTime() - new Date(job.started_at).getTime() : null;
  const canFinish = finishable(job, now, latestVersion);
  const savedSince = !canFinish && stoppedBeforeDrawing(job, now);
  return (
    <Card>
      <CardTitle icon={ArrowsClockwiseIcon}>{running ? "Working on your plan" : state === "interrupted" ? "This run was cut off" : "The last run"}</CardTitle>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
        <StatusBadge status={running ? "working" : state === "interrupted" ? "attention" : state === "failed" ? "failed" : problem ? "attention" : "done"} label={running ? "Working" : state === "interrupted" ? "Interrupted" : state === "failed" ? "Stopped" : problem ? "Needs a look" : "Finished"} />
        <span>
          Started <RelativeTime iso={job.started_at} />
          {running ? ". This page updates itself as each stage finishes." : total !== null && total >= 0 && job.stages.some((s) => s.ms !== undefined) ? ` and took ${tookText(total)} in all.` : "."}
        </span>
      </div>
      <ol className="mt-4 grid gap-2.5">
        {job.stages.map((s) => (
          <li key={s.id} className="flex items-start gap-2.5 text-sm">
            <StatusGlyph status={GLYPH[s.state]} className="mt-0.5" />
            <span className="grid gap-0.5">
              <span className={s.state === "skipped" ? "text-ink-3" : "text-ink"}>
                {s.label}
                {s.ms !== undefined && (s.state === "done" || s.state === "failed") ? <span className="text-ink-3">, {tookText(s.ms)}</span> : null}
                <span className="sr-only">: {STATE_WORDS[s.state]}</span>
              </span>
              {s.detail ? <span className="text-ink-2">{s.detail}</span> : null}
            </span>
          </li>
        ))}
      </ol>
      {state === "interrupted" && canFinish ? (
        <>
          <p className="mt-3 text-sm text-ink-2">This run stopped after its files were imported, before the plan was drawn. The project keeps every file, so Farbaek can draw the plan from them now. Sketch photos aren&apos;t kept until they&apos;re read: read them again from the Draft step.</p>
          <FinishRun projectId={projectId} jobId={job.id} disabledReason={disabledReason} />
        </>
      ) : savedSince ? (
        <p className="mt-3 text-sm text-ink-2">This run stopped before its record said the plan was drawn, and the plan has been saved since, so there&apos;s nothing to finish here: what was saved is on the plan. Read the sketches again from the Draft step.</p>
      ) : state === "interrupted" ? (
        <p className="mt-3 text-sm text-ink-2">This run stopped before it finished: the photos may not have reached Farbaek, or the server restarted. What was saved is on the plan: read the sketches again from the Draft step, or import a file again on the Import step.</p>
      ) : null}
      <LiveRefresh active={running} />
    </Card>
  );
}
