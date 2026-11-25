import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { LIMIT_WINDOW_HOURS, NOTES_GIVEN } from "@/core/automation/agents";
import type { Schedule } from "@/core/automation/schedule";
import type { TaskOptions } from "@/core/automation/tasks";
import type { Person, ScheduledTask, StoreResult, TaskRun } from "./store";

/**
 * Agents (stage 275, ADR 0282): a person's helpers that keep working toward a goal. An agent is read as its owner through row-level
 * security and written only through the service-only functions, which check the person again. Its schedule, runs, pause and chat
 * are its task's (`store.ts`); this file holds what is the agent's own.
 */

/** The database's refusals arrive as the exception's own word (P0001), or FORBIDDEN (42501). */
const refusal = (error: { message?: string; code?: string }): { ok: false; code: string } => {
  const word = /^[A-Z_]{3,40}$/.exec((error.message ?? "").trim())?.[0];
  return { ok: false, code: word ?? (error.code === "42501" ? "FORBIDDEN" : "UNAVAILABLE") };
};

export interface AgentWrite {
  agentId: string | null;
  baseVersion: number | null;
  name: string;
  goal: string;
  runsLimit: number;
  useMemory: boolean;
  schedule: Schedule;
  options: TaskOptions;
  nextRunAt: Date | null;
  maxActive: number;
  maxAgents: number;
}

export async function saveAgent(admin: SupabaseClient, who: Person, i: AgentWrite): Promise<StoreResult<{ id: string; taskId: string; version: number }>> {
  const { data, error } = await admin.rpc("app_personal_agent_save", {
    p_org: who.orgId,
    p_actor: who.userId,
    p_agent: i.agentId,
    p_base_version: i.baseVersion,
    p_name: i.name,
    p_goal: i.goal,
    p_runs_limit: i.runsLimit,
    p_use_memory: i.useMemory,
    p_schedule: i.schedule,
    p_options: i.options,
    p_next_run_at: i.nextRunAt?.toISOString() ?? null,
    p_max_active: i.maxActive,
    p_max_agents: i.maxAgents,
  });
  if (error) return refusal(error);
  const row = z.array(z.object({ id: z.uuid(), task_id: z.uuid(), version: z.number().int() })).safeParse(data);
  return row.success && row.data[0] ? { ok: true, value: { id: row.data[0].id, taskId: row.data[0].task_id, version: row.data[0].version } } : { ok: false, code: "UNAVAILABLE" };
}

export async function archiveAgent(admin: SupabaseClient, who: Person, agentId: string): Promise<StoreResult<null>> {
  const { error } = await admin.rpc("app_personal_agent_archive", { p_org: who.orgId, p_actor: who.userId, p_agent: agentId });
  return error ? refusal(error) : { ok: true, value: null };
}

export async function clearAgentNotes(admin: SupabaseClient, who: Person, agentId: string): Promise<StoreResult<null>> {
  const { error } = await admin.rpc("app_personal_agent_notes_clear", { p_org: who.orgId, p_actor: who.userId, p_agent: agentId });
  return error ? refusal(error) : { ok: true, value: null };
}

/** An agent as its page shows it: who it is, and the task that does its work. */
export interface Agent {
  id: string;
  name: string;
  goal: string;
  runsLimit: number;
  useMemory: boolean;
  /** Notes from runs that started before this are no longer given to it. */
  notesFrom: string | null;
  version: number;
  createdAt: string;
  task: ScheduledTask;
}

const agentRow = z.object({
  id: z.uuid(),
  name: z.string(),
  goal: z.string(),
  runs_limit: z.number().int(),
  use_memory: z.boolean(),
  notes_from: z.string().nullable(),
  version: z.number().int(),
  created_at: z.string(),
});

/**
 * The person's agents in this workspace, newest first, each with its task from the tasks already read. Null when they couldn't be
 * read (never shown as "none"). An agent whose task is missing isn't listed: it has nothing to show or to press.
 */
export async function listAgents(client: SupabaseClient, orgId: string, tasks: readonly ScheduledTask[]): Promise<Agent[] | null> {
  const { data, error } = await client.from("personal_agents").select("id, name, goal, runs_limit, use_memory, notes_from, version, created_at").eq("org_id", orgId).is("archived_at", null).order("created_at", { ascending: false }).limit(100);
  if (error) return null;
  const rows = z.array(agentRow).safeParse(data ?? []);
  if (!rows.success) return null;
  const byAgent = new Map(tasks.filter((t) => t.agentId).map((t) => [t.agentId!, t]));
  return rows.data.flatMap((r) => {
    const task = byAgent.get(r.id);
    return task ? [{ id: r.id, name: r.name, goal: r.goal, runsLimit: r.runs_limit, useMemory: r.use_memory, notesFrom: r.notes_from, version: r.version, createdAt: r.created_at, task }] : [];
  });
}

/** An agent's latest runs, newest first, from the runs already read for the page. */
export function latestRuns(agent: Agent, runs: readonly TaskRun[], most = 5): TaskRun[] {
  return runs.filter((r) => r.taskId === agent.task.id).slice(0, most);
}

/** What an agent's card says in numbers; null for one that couldn't be counted, and the card then says so rather than guess. */
export interface AgentCounts {
  /** Runs counted against its limit, as the runner counts them (v108): those that made a turn, due within the limit's window. */
  runsIn30Days: number | null;
  /** Notes its next run will be given: from runs that finished after the notes were last cleared, eight at most. */
  notesGiven: number | null;
}

/**
 * The two counts for each agent, asked of the database with the same rules it uses when the agent runs: a page reads only the
 * latest runs, and an agent that works every hour makes more than that.
 */
export async function agentCounts(client: SupabaseClient, agents: readonly Agent[], now: Date): Promise<Map<string, AgentCounts>> {
  const since = new Date(now.getTime() - LIMIT_WINDOW_HOURS * 3_600_000).toISOString();
  const counted = await Promise.all(
    agents.map(async (a): Promise<[string, AgentCounts]> => {
      const made = client.from("scheduled_task_runs").select("id", { count: "exact", head: true }).eq("task_id", a.task.id).in("status", ["done", "failed"]).not("message_id", "is", null).gt("due_at", since);
      let notes = client.from("scheduled_task_runs").select("id", { count: "exact", head: true }).eq("task_id", a.task.id).eq("status", "done").not("note", "is", null);
      if (a.notesFrom) notes = notes.gt("started_at", a.notesFrom);
      const [runs, kept] = await Promise.all([made, notes]);
      return [a.id, { runsIn30Days: runs.error || runs.count === null ? null : runs.count, notesGiven: kept.error || kept.count === null ? null : Math.min(NOTES_GIVEN, kept.count) }];
    }),
  );
  return new Map(counted);
}
