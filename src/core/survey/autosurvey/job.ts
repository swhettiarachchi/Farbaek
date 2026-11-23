/**
 * A Generate Plan run as a job (stage 229, ADR 0239): its real stages, as the server reaches them, so the surveyor can leave the page
 * and come back to the same state. Nothing here is a percentage or a guess: a stage is waiting, running, done, failed or skipped.
 */
import { z } from "zod";

export const JOB_STAGE_STATES = ["waiting", "running", "done", "failed", "skipped"] as const;
export type JobStageState = (typeof JOB_STAGE_STATES)[number];
export const JOB_STAGE_IDS = ["import", "draw", "sketches"] as const;
export type JobStageId = (typeof JOB_STAGE_IDS)[number];

export const jobStageSchema = z.object({ id: z.enum(JOB_STAGE_IDS), label: z.string().max(120), state: z.enum(JOB_STAGE_STATES), detail: z.string().max(300).optional() });
export type JobStage = z.infer<typeof jobStageSchema>;

export const jobRowSchema = z.object({
  id: z.string().uuid(),
  state: z.enum(["running", "done", "failed", "interrupted"]),
  stages: z.array(jobStageSchema).max(12).catch([]),
  result: z.object({ next: z.string().max(300).optional(), message: z.string().max(500).optional() }).catch({}),
  started_at: z.string(),
  updated_at: z.string(),
});
export type JobRow = z.infer<typeof jobRowSchema>;

/** A running job with no word for this long was cut off by a restart: shown as interrupted, as the sweep marks it. */
export const JOB_STALE_MS = 15 * 60_000;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Generate Plan's stages: importing the files, drawing the plan, and reading the sketches when there are any. */
export function generateStages(files: number, sketches: number): JobStage[] {
  return [
    { id: "import", label: `Importing ${plural(files, "file", "files")}`, state: "running" },
    { id: "draw", label: "Drawing the plan", state: "waiting" },
    { id: "sketches", label: sketches > 0 ? `Reading ${plural(sketches, "sketch", "sketches")} with Claude` : "No sketches to read", state: sketches > 0 ? "waiting" : "skipped" },
  ];
}

/**
 * The stages with one changed, and the next waiting stage started when this one finishes, done or failed (a plan that couldn't be
 * drawn still has its sketches read). A detail is cut to what a stage holds, so a long one never loses the whole list.
 */
export function advance(stages: readonly JobStage[], id: JobStageId, state: JobStageState, detail?: string): JobStage[] {
  const next = stages.map((s) => (s.id === id ? { ...s, state, ...(detail ? { detail: detail.length > 300 ? `${detail.slice(0, 299)}…` : detail } : {}) } : s));
  if (state !== "done" && state !== "failed") return next;
  const after = next.findIndex((s) => s.id === id) + 1;
  return next.map((s, i) => (i === after && s.state === "waiting" ? { ...s, state: "running" as const } : s));
}

/** How a job shows: a running job silent for longer than the limit is shown as interrupted. */
export function jobState(job: Pick<JobRow, "state" | "updated_at">, now: Date): JobRow["state"] {
  if (job.state !== "running") return job.state;
  return now.getTime() - new Date(job.updated_at).getTime() > JOB_STALE_MS ? "interrupted" : "running";
}

/** Whether every stage left is finished, so the job is over. */
export const allFinished = (stages: readonly JobStage[]) => stages.every((s) => s.state === "done" || s.state === "skipped" || s.state === "failed");
