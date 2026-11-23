/**
 * A Generate Plan run as a job (stage 229, ADR 0239): its real stages, as the server reaches them, so the surveyor can leave the page
 * and come back to the same state. Nothing here is a percentage or a guess: a stage is waiting, running, done, failed or skipped.
 */
import { z } from "zod";

export const JOB_STAGE_STATES = ["waiting", "running", "done", "failed", "skipped"] as const;
export type JobStageState = (typeof JOB_STAGE_STATES)[number];
export const JOB_STAGE_IDS = ["import", "draw", "sketches"] as const;
export type JobStageId = (typeof JOB_STAGE_IDS)[number];

export const jobStageSchema = z.object({
  id: z.enum(JOB_STAGE_IDS),
  label: z.string().max(120),
  state: z.enum(JOB_STAGE_STATES),
  detail: z.string().max(300).optional(),
  /** When the stage began working, and how long it took once finished (stage 235): measured on the server, never estimated. */
  startedAt: z.string().max(40).optional(),
  ms: z.number().int().min(0).max(86_400_000).optional(),
});
export type JobStage = z.infer<typeof jobStageSchema>;

export const jobRowSchema = z.object({
  id: z.string().uuid(),
  state: z.enum(["running", "done", "failed", "interrupted"]),
  stages: z.array(jobStageSchema).max(12).catch([]),
  /** `finishedLater`: the run was cut off and finished afterwards (stage 235), so its start-to-finish time measures nothing. */
  result: z.object({ next: z.string().max(300).optional(), message: z.string().max(500).optional(), finishedLater: z.boolean().optional() }).catch({}),
  started_at: z.string(),
  updated_at: z.string(),
});
export type JobRow = z.infer<typeof jobRowSchema>;

/** A running job with no word for this long was cut off by a restart: shown as interrupted, as the sweep marks it. */
export const JOB_STALE_MS = 15 * 60_000;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Generate Plan's stages: importing the files, drawing the plan, and reading the sketches when there are any. With `now`, the first is timed. */
export function generateStages(files: number, sketches: number, now?: Date): JobStage[] {
  return [
    { id: "import", label: `Importing ${plural(files, "file", "files")}`, state: "running", ...(now ? { startedAt: now.toISOString() } : {}) },
    { id: "draw", label: "Drawing the plan", state: "waiting" },
    { id: "sketches", label: sketches > 0 ? `Reading ${plural(sketches, "sketch", "sketches")} with Claude` : "No sketches to read", state: sketches > 0 ? "waiting" : "skipped" },
  ];
}

/**
 * The stages with one changed, and the next waiting stage started when this one finishes, done or failed (a plan that couldn't be
 * drawn still has its sketches read). A detail is cut to what a stage holds, so a long one never loses the whole list.
 */
export function advance(stages: readonly JobStage[], id: JobStageId, state: JobStageState, detail?: string, now?: Date): JobStage[] {
  const at = now?.toISOString();
  // With the clock: a stage that starts working records when, and one that finishes records how long it took.
  const timed = (s: JobStage, to: JobStageState): JobStage => {
    if (!now) return s;
    if (to === "running" && !s.startedAt) return { ...s, startedAt: at! };
    if ((to === "done" || to === "failed") && s.startedAt) return { ...s, ms: Math.max(0, Math.min(86_400_000, Math.round(now.getTime() - new Date(s.startedAt).getTime()))) };
    return s;
  };
  const next = stages.map((s) => (s.id === id ? timed({ ...s, state, ...(detail ? { detail: detail.length > 300 ? `${detail.slice(0, 299)}…` : detail } : {}) }, state) : s));
  if (state !== "done" && state !== "failed") return next;
  const after = next.findIndex((s) => s.id === id) + 1;
  return next.map((s, i) => (i === after && s.state === "waiting" ? timed({ ...s, state: "running" as const }, "running") : s));
}

/** A measured time as a reader says it: "0.4 s", "12 s", "2 min 5 s". */
export function tookText(ms: number): string {
  if (ms < 9_950) return `${(ms / 1000).toFixed(1)} s`;
  // Whole seconds first, so 59.6 s says "1 min", never "60 s", and 119.6 s "2 min", never "1 min 60 s".
  const all = Math.round(ms / 1000);
  if (all < 60) return `${all} s`;
  const m = Math.floor(all / 60);
  const sec = all % 60;
  return sec === 0 ? `${m} min` : `${m} min ${sec} s`;
}

/** The version a Generate Plan project is created on: a run cut off before drawing leaves the plan there. */
export const FIRST_VERSION = 1;

/** Whether a cut-off run stopped after its files were imported and before its plan was drawn, by its own record. */
export function stoppedBeforeDrawing(job: Pick<JobRow, "state" | "updated_at" | "stages">, now: Date): boolean {
  if (jobState(job, now) !== "interrupted") return false;
  const importing = job.stages.find((s) => s.id === "import");
  const drawing = job.stages.find((s) => s.id === "draw");
  return importing?.state === "done" && (drawing?.state === "waiting" || drawing?.state === "running");
}

/**
 * Whether a cut-off run can be finished from where it stopped (stage 235): it stopped after its files were imported, which the project
 * keeps, and the plan is still on the version the run created it on. A plan saved since (drawn from the Draft step, edited, or drawn by
 * the run just before it was cut off) is never drawn over. Sketch photos live in the browser until they're read, so a cut-off read
 * can't be finished here: it is read again from the Draft step.
 */
export function finishable(job: Pick<JobRow, "state" | "updated_at" | "stages">, now: Date, latestVersion: number): boolean {
  return latestVersion === FIRST_VERSION && stoppedBeforeDrawing(job, now);
}

/** How a job shows: a running job silent for longer than the limit is shown as interrupted. */
export function jobState(job: Pick<JobRow, "state" | "updated_at">, now: Date): JobRow["state"] {
  if (job.state !== "running") return job.state;
  return now.getTime() - new Date(job.updated_at).getTime() > JOB_STALE_MS ? "interrupted" : "running";
}

/** Whether every stage left is finished, so the job is over. */
export const allFinished = (stages: readonly JobStage[]) => stages.every((s) => s.state === "done" || s.state === "skipped" || s.state === "failed");
