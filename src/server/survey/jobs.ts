import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { advance, allFinished, jobRowSchema, type JobRow, type JobStage, type JobStageId, type JobStageState } from "@/core/survey/autosurvey/job";
import { surveyStore, type Actor } from "./store";

/**
 * AutoSurvey's jobs on the server (stage 229, ADR 0239). Recording a job never stands in the way of the work: a job that can't be
 * started or updated (the v102 migration not yet applied, a database hiccup) leaves the plan exactly as it would be without one.
 */

/** One job of one project by its id, read through row-level security (so only the workspace's own), or null. */
export async function loadJob(client: SupabaseClient, jobId: string, projectId: string): Promise<JobRow | null> {
  if (!z.string().uuid().safeParse(jobId).success || !z.string().uuid().safeParse(projectId).success) return null;
  try {
    const { data, error } = await client.from("survey_jobs").select("id, state, stages, result, started_at, updated_at").eq("id", jobId).eq("project_id", projectId).maybeSingle();
    if (error || !data) return null;
    const row = jobRowSchema.safeParse(data);
    return row.success ? row.data : null;
  } catch {
    return null;
  }
}

/** The project's latest job, read through row-level security, or null. */
export async function loadLatestJob(client: SupabaseClient, projectId: string): Promise<JobRow | null> {
  if (!z.string().uuid().safeParse(projectId).success) return null;
  try {
    const { data, error } = await client.from("survey_jobs").select("id, state, stages, result, started_at, updated_at").eq("project_id", projectId).order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (error || !data) return null;
    const row = jobRowSchema.safeParse(data);
    return row.success ? row.data : null;
  } catch {
    return null;
  }
}

/** A job being run in this request: its stages kept here, and written as they change. */
export class JobTracker {
  private constructor(
    private readonly admin: SupabaseClient,
    private readonly orgId: string,
    readonly id: string | null,
    public stages: JobStage[],
    private result: { next?: string; message?: string } = {},
  ) {}

  static async start(admin: SupabaseClient, actor: Actor, projectId: string, stages: JobStage[]): Promise<JobTracker> {
    let id: string | null = null;
    try {
      const r = await surveyStore.jobStart(admin, actor, { projectId, stages });
      id = r.ok ? r.value : null;
    } catch {
      id = null;
    }
    return new JobTracker(admin, actor.orgId, id, stages);
  }

  /** Picks up a job another request started, by its id, with its stages as stored. */
  static resume(admin: SupabaseClient, orgId: string, job: JobRow): JobTracker {
    return new JobTracker(admin, orgId, job.id, job.stages, job.result);
  }

  /** One stage changed; the job ends when nothing is left to do, with its result. */
  async stage(id: JobStageId, state: JobStageState, detail?: string, result: { next?: string; message?: string } = {}): Promise<void> {
    this.stages = advance(this.stages, id, state, detail);
    // Nothing to import means nothing more to do: what was still waiting is skipped, so the job ends.
    if (id === "import" && state === "failed") this.stages = this.stages.map((s) => (s.state === "waiting" || (s.state === "running" && s.id !== id) ? { ...s, state: "skipped" as const } : s));
    this.result = { ...this.result, ...result };
    const over = allFinished(this.stages);
    const failed = this.stages.some((s) => s.state === "failed" && (s.id === "import" || s.id === "draw"));
    await this.write(over ? (failed ? "failed" : "done") : "running");
  }

  async write(state: "running" | "done" | "failed" | "interrupted"): Promise<void> {
    if (!this.id) return;
    try {
      await surveyStore.jobUpdate(this.admin, this.orgId, { jobId: this.id, stages: this.stages, state, result: this.result });
    } catch {
      // A record that can't be written never stops the work.
    }
  }
}
