import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { scheduleSchema, type Schedule } from "@/core/automation/schedule";
import { DEFAULT_OPTIONS, taskOptionsSchema, type TaskOptions } from "@/core/automation/tasks";

/**
 * Scheduled tasks in the database (stage 271, ADR 0278). People's changes and the runner's claims go through the service-role-only
 * functions of migration v106, which check the person again; a person's own tasks and runs are read as them, through row-level security.
 */

export type StoreResult<T> = { ok: true; value: T } | { ok: false; code: string };
/** The database's refusals arrive as the exception's own word (P0001), or FORBIDDEN (42501). */
const refusal = (error: { message?: string; code?: string }): { ok: false; code: string } => {
  const word = /^[A-Z_]{3,40}$/.exec((error.message ?? "").trim())?.[0];
  return { ok: false, code: word ?? (error.code === "42501" ? "FORBIDDEN" : "UNAVAILABLE") };
};

export interface Person {
  orgId: string;
  userId: string;
}

export interface TaskWrite {
  taskId: string | null;
  baseVersion: number | null;
  title: string;
  instruction: string;
  schedule: Schedule;
  options: TaskOptions;
  nextRunAt: Date | null;
  maxActive: number;
}

export async function saveTask(admin: SupabaseClient, who: Person, i: TaskWrite): Promise<StoreResult<{ id: string; version: number }>> {
  const { data, error } = await admin.rpc("app_scheduled_task_save", {
    p_org: who.orgId,
    p_actor: who.userId,
    p_task: i.taskId,
    p_base_version: i.baseVersion,
    p_title: i.title,
    p_instruction: i.instruction,
    p_schedule: i.schedule,
    p_options: i.options,
    p_next_run_at: i.nextRunAt?.toISOString() ?? null,
    p_max_active: i.maxActive,
  });
  if (error) return refusal(error);
  const row = z.array(z.object({ id: z.uuid(), version: z.number().int() })).safeParse(data);
  return row.success && row.data[0] ? { ok: true, value: row.data[0] } : { ok: false, code: "UNAVAILABLE" };
}

export async function setTaskState(admin: SupabaseClient, who: Person, taskId: string, state: "active" | "paused", nextRunAt: Date | null, maxActive: number): Promise<StoreResult<null>> {
  const { error } = await admin.rpc("app_scheduled_task_state", { p_org: who.orgId, p_actor: who.userId, p_task: taskId, p_state: state, p_next_run_at: nextRunAt?.toISOString() ?? null, p_max_active: maxActive });
  return error ? refusal(error) : { ok: true, value: null };
}

export async function runTaskNow(admin: SupabaseClient, who: Person, taskId: string): Promise<StoreResult<null>> {
  const { error } = await admin.rpc("app_scheduled_task_run_now", { p_org: who.orgId, p_actor: who.userId, p_task: taskId });
  return error ? refusal(error) : { ok: true, value: null };
}

export async function archiveTask(admin: SupabaseClient, who: Person, taskId: string): Promise<StoreResult<null>> {
  const { error } = await admin.rpc("app_scheduled_task_archive", { p_org: who.orgId, p_actor: who.userId, p_task: taskId });
  return error ? refusal(error) : { ok: true, value: null };
}

// ---- The runner's side ---------------------------------------------------------------------------------------------------------

const claimedSchema = z.object({
  run_id: z.uuid(),
  task_id: z.uuid(),
  org_id: z.uuid(),
  owner_id: z.uuid(),
  title: z.string(),
  instruction: z.string(),
  schedule: z.unknown(),
  options: z.unknown(),
  conversation_id: z.uuid().nullable(),
  due_at: z.string(),
  attempt: z.number().int(),
  runs_finished: z.number().int(),
  failures_in_row: z.number().int(),
});

export interface ClaimedRun {
  runId: string;
  taskId: string;
  orgId: string;
  ownerId: string;
  title: string;
  instruction: string;
  /** As stored: read by the runner, which pauses a task whose schedule no longer reads. */
  schedule: unknown;
  options: unknown;
  conversationId: string | null;
  dueAt: Date;
  attempt: number;
  runsFinished: number;
  failuresInRow: number;
}

export interface RunFinish {
  runId: string;
  attempt: number;
  status: "done" | "failed" | "skipped";
  detail: string | null;
  conversationId: string | null;
  messageId: string | null;
  nextRunAt: Date | null;
  retryAt: Date | null;
  pauseReason: string | null;
}

export interface ScheduledStore {
  /** Tasks that are due, each now leased to this runner; null when the database couldn't be asked. */
  claim(limit: number): Promise<ClaimedRun[] | null>;
  /** Records how a run went; false when this try had already been given up on, or it couldn't be recorded. */
  finish(i: RunFinish): Promise<boolean>;
  linkConversation(taskId: string, conversationId: string): Promise<void>;
}

export function createScheduledStore(admin: SupabaseClient): ScheduledStore {
  return {
    async claim(limit) {
      const { data, error } = await admin.rpc("app_scheduled_claim", { p_limit: limit });
      if (error) return null;
      const rows = z.array(claimedSchema).safeParse(data ?? []);
      if (!rows.success) return null;
      return rows.data.map((r) => ({
        runId: r.run_id,
        taskId: r.task_id,
        orgId: r.org_id,
        ownerId: r.owner_id,
        title: r.title,
        instruction: r.instruction,
        schedule: r.schedule,
        options: r.options,
        conversationId: r.conversation_id,
        dueAt: new Date(r.due_at),
        attempt: r.attempt,
        runsFinished: r.runs_finished,
        failuresInRow: r.failures_in_row,
      }));
    },
    async finish(i) {
      const { data, error } = await admin.rpc("app_scheduled_run_finish", {
        p_run: i.runId,
        p_attempt: i.attempt,
        p_status: i.status,
        p_detail: i.detail,
        p_conversation: i.conversationId,
        p_message: i.messageId,
        p_next_run_at: i.nextRunAt?.toISOString() ?? null,
        p_retry_at: i.retryAt?.toISOString() ?? null,
        p_pause_reason: i.pauseReason,
      });
      return !error && data === true;
    },
    async linkConversation(taskId, conversationId) {
      await admin.rpc("app_scheduled_task_conversation", { p_task: taskId, p_conversation: conversationId });
    },
  };
}

// ---- A person's own tasks, read as them ------------------------------------------------------------------------------------------

export interface ScheduledTask {
  id: string;
  title: string;
  instruction: string;
  /** Null when what's stored no longer reads as a schedule: shown as such, never guessed at. */
  schedule: Schedule | null;
  options: TaskOptions;
  state: "active" | "paused" | "ended";
  stateReason: string | null;
  conversationId: string | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: "done" | "failed" | "skipped" | null;
  runsFinished: number;
  version: number;
  createdAt: string;
}

export interface TaskRun {
  id: string;
  taskId: string;
  dueAt: string;
  status: "running" | "retrying" | "done" | "failed" | "skipped";
  detail: string | null;
  conversationId: string | null;
  finishedAt: string | null;
}

const taskRow = z.object({
  id: z.uuid(),
  title: z.string(),
  instruction: z.string(),
  schedule: z.unknown(),
  options: z.unknown(),
  state: z.enum(["active", "paused", "ended"]),
  state_reason: z.string().nullable(),
  conversation_id: z.uuid().nullable(),
  next_run_at: z.string().nullable(),
  last_run_at: z.string().nullable(),
  last_status: z.enum(["done", "failed", "skipped"]).nullable(),
  runs_finished: z.number().int(),
  version: z.number().int(),
  created_at: z.string(),
});

/** The person's tasks in this workspace, newest first; null when they couldn't be read (never shown as "none"). */
export async function listTasks(client: SupabaseClient, orgId: string): Promise<ScheduledTask[] | null> {
  const { data, error } = await client
    .from("scheduled_tasks")
    .select("id, title, instruction, schedule, options, state, state_reason, conversation_id, next_run_at, last_run_at, last_status, runs_finished, version, created_at")
    .eq("org_id", orgId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return null;
  const rows = z.array(taskRow).safeParse(data ?? []);
  if (!rows.success) return null;
  return rows.data.map((r) => {
    const schedule = scheduleSchema.safeParse(r.schedule);
    const options = taskOptionsSchema.safeParse(r.options);
    return {
      id: r.id,
      title: r.title,
      instruction: r.instruction,
      schedule: schedule.success ? schedule.data : null,
      options: options.success ? options.data : DEFAULT_OPTIONS,
      state: r.state,
      stateReason: r.state_reason,
      conversationId: r.conversation_id,
      nextRunAt: r.next_run_at,
      lastRunAt: r.last_run_at,
      lastStatus: r.last_status,
      runsFinished: r.runs_finished,
      version: r.version,
      createdAt: r.created_at,
    };
  });
}

const runRow = z.object({
  id: z.uuid(),
  task_id: z.uuid(),
  due_at: z.string(),
  status: z.enum(["running", "retrying", "done", "failed", "skipped"]),
  detail: z.string().nullable(),
  conversation_id: z.uuid().nullable(),
  finished_at: z.string().nullable(),
});

/** The latest runs of the person's tasks in this workspace, newest first. */
export async function listRuns(client: SupabaseClient, orgId: string, limit = 100): Promise<TaskRun[]> {
  const { data, error } = await client.from("scheduled_task_runs").select("id, task_id, due_at, status, detail, conversation_id, finished_at").eq("org_id", orgId).order("due_at", { ascending: false }).limit(limit);
  if (error) return [];
  const rows = z.array(runRow).safeParse(data ?? []);
  if (!rows.success) return [];
  return rows.data.map((r) => ({ id: r.id, taskId: r.task_id, dueAt: r.due_at, status: r.status, detail: r.detail, conversationId: r.conversation_id, finishedAt: r.finished_at }));
}

/** One of the person's own tasks, for an action that changes it. */
export async function readTask(client: SupabaseClient, orgId: string, taskId: string): Promise<ScheduledTask | null> {
  return (await listTasks(client, orgId))?.find((t) => t.id === taskId) ?? null;
}
