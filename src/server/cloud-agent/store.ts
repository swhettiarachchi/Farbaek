/**
 * Cloud runs in the database (migration 16). Writes go through the
 * service-role functions; pages read runs and events through the person's
 * own client, so Row Level Security decides what they see.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { LIVE_STATUSES, RUN_STATUSES, type CloudRunMode, type RunEventKind, type RunStatus } from "@/core/agent/cloud-run";
import type { ProposalState } from "@/core/agent/inbox";
import { EFFORTS, type Effort } from "@/core/agent/routing";
import type { ProposalInput } from "@/server/agent/service";
import type { RpcResult } from "@/server/workspace/use-cases";

export interface RunPatch {
  status?: Exclude<RunStatus, "starting">;
  model?: string;
  addSteps?: number;
  addInputTokens?: number;
  addOutputTokens?: number;
  sandboxSessionId?: string;
  outcome?: string;
  finish?: { summary: string; steps: string[]; risks: string[]; checks: string[] };
  events?: { kind: RunEventKind; payload: object }[];
}

export interface RunStore {
  start(input: { orgId: string; actor: string; taskId: string; effort: Effort; mode: CloudRunMode; contractVersion: number; contractSha256: string }): Promise<RpcResult<string>>;
  update(runId: string, patch: RunPatch): Promise<RpcResult<null>>;
  createRunProposal(runId: string, input: ProposalInput): Promise<RpcResult<string>>;
  interruptStale(before: Date): Promise<number>;
}

export function createSupabaseRunStore(admin: SupabaseClient): RunStore {
  async function rpc<T>(fn: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<RpcResult<T>> {
    const { data, error } = await admin.rpc(fn, args);
    if (error) return { ok: false, error: error.message };
    const parsed = schema.safeParse(data);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: "UNEXPECTED_RESPONSE" };
  }
  const none = z.null().or(z.literal("")).transform(() => null);
  return {
    start: (i) =>
      rpc(
        "app_start_agent_run",
        { p_org: i.orgId, p_actor: i.actor, p_task: i.taskId, p_effort: i.effort, p_mode: i.mode, p_contract_version: i.contractVersion, p_contract_sha256: i.contractSha256 },
        z.string(),
      ),
    update: (runId, p) =>
      rpc(
        "app_update_agent_run",
        {
          p_run: runId,
          p_status: p.status ?? null,
          p_model: p.model?.slice(0, 100) ?? null,
          p_add_steps: p.addSteps ?? 0,
          p_add_input_tokens: p.addInputTokens ?? 0,
          p_add_output_tokens: p.addOutputTokens ?? 0,
          p_sandbox_session: p.sandboxSessionId ?? null,
          p_outcome: p.outcome?.slice(0, 2000) ?? null,
          p_finish: p.finish ?? null,
          p_events: p.events?.length ? p.events : null,
        },
        none,
      ),
    createRunProposal: (runId, i) =>
      rpc(
        "app_create_run_proposal",
        {
          p_run: runId,
          p_task: i.taskId,
          p_actor: i.actor,
          p_contract_version: i.contractVersion,
          p_plan: i.plan,
          p_changes: i.changes.map((c) => ({ path: c.path, kind: c.kind, base_revision: c.baseRevision, content: c.content, sha256: c.sha256, reason: c.reason })),
          p_dropped: [],
          p_violations: i.violations,
          p_sha256: i.sha256,
          p_model: i.usage.model.slice(0, 100) || null,
          p_input_tokens: i.usage.inputTokens,
          p_output_tokens: i.usage.outputTokens,
          p_expected_task_version: i.expectedTaskVersion,
          p_steps: i.steps,
          p_policy: { outcome: i.policy.outcome, version: i.policy.policyVersion, findings: i.policy.findings },
          p_evaluation_limit: i.evaluationLimit,
          p_period_start: i.period.start.toISOString(),
          p_period_end: i.period.end.toISOString(),
        },
        z.string(),
      ),
    async interruptStale(before) {
      const r = await rpc("app_interrupt_stale_agent_runs", { p_stale_before: before.toISOString() }, z.coerce.number().int());
      return r.ok ? r.value : 0;
    },
  };
}

const RunRow = z.object({
  id: z.string(),
  task_id: z.string(),
  project_id: z.string(),
  started_by: z.string(),
  effort: z.enum(EFFORTS),
  mode: z.enum(["sandboxed", "review_only"]),
  status: z.enum(RUN_STATUSES),
  model: z.string().nullable(),
  steps: z.number().int(),
  input_tokens: z.coerce.number(),
  output_tokens: z.coerce.number(),
  outcome: z.string().nullable(),
  finish: z.object({ summary: z.string(), steps: z.array(z.string()), risks: z.array(z.string()), checks: z.array(z.string()) }).nullable(),
  proposal_id: z.string().nullable(),
  sandbox_session_id: z.string().nullable(),
  started_at: z.string(),
  ended_at: z.string().nullable(),
  tasks: z.object({ title: z.string() }).nullable(),
  projects: z.object({ name: z.string() }).nullable(),
});

export interface RunView {
  id: string;
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
  startedBy: string;
  effort: Effort;
  mode: CloudRunMode;
  status: RunStatus;
  model: string | null;
  steps: number;
  tokens: number;
  outcome: string | null;
  finish: { summary: string; steps: string[]; risks: string[]; checks: string[] } | null;
  proposalId: string | null;
  sandboxSessionId: string | null;
  startedAt: string;
  endedAt: string | null;
}

const RUN_SELECT = "id, task_id, project_id, started_by, effort, mode, status, model, steps, input_tokens, output_tokens, outcome, finish, proposal_id, sandbox_session_id, started_at, ended_at, tasks(title), projects(name)";

function toView(r: z.infer<typeof RunRow>): RunView {
  return {
    id: r.id,
    taskId: r.task_id,
    taskTitle: r.tasks?.title ?? "Task",
    projectId: r.project_id,
    projectName: r.projects?.name ?? "Project",
    startedBy: r.started_by,
    effort: r.effort,
    mode: r.mode,
    status: r.status,
    model: r.model,
    steps: r.steps,
    tokens: r.input_tokens + r.output_tokens,
    outcome: r.outcome,
    finish: r.finish,
    proposalId: r.proposal_id,
    sandboxSessionId: r.sandbox_session_id,
    startedAt: r.started_at,
    endedAt: r.ended_at,
  };
}

export async function listRuns(client: SupabaseClient, orgId: string, options: { taskId?: string; limit?: number } = {}): Promise<RunView[]> {
  let query = client.from("agent_runs").select(RUN_SELECT).eq("org_id", orgId).order("started_at", { ascending: false }).limit(options.limit ?? 30);
  if (options.taskId) query = query.eq("task_id", options.taskId);
  const { data, error } = await query;
  if (error) throw new Error(`Couldn't load runs: ${error.message}`);
  return z.array(RunRow).parse(data).map(toView);
}

/** The live runs' statuses only: the agent presence orb asks for this on every page. */
export async function liveRunStatuses(client: SupabaseClient, orgId: string): Promise<{ id: string; status: RunStatus }[]> {
  const { data, error } = await client.from("agent_runs").select("id, status").eq("org_id", orgId).in("status", [...LIVE_STATUSES]).order("started_at", { ascending: false }).limit(20);
  if (error) throw new Error(`Couldn't load live runs: ${error.message}`);
  return z.array(z.object({ id: z.string(), status: z.enum(RUN_STATUSES) })).parse(data);
}

/** The stored state of these proposals, read as the person; ids it can't see are simply missing. */
export async function proposalStates(client: SupabaseClient, orgId: string, ids: readonly string[]): Promise<Map<string, ProposalState>> {
  const unique = [...new Set(ids)].filter((id) => z.uuid().safeParse(id).success).slice(0, 100);
  if (unique.length === 0) return new Map();
  const { data, error } = await client.from("change_proposals").select("id, status").eq("org_id", orgId).in("id", unique);
  if (error) throw new Error(`Couldn't load proposals: ${error.message}`);
  const known = new Set<ProposalState>(["pending", "blocked", "applied", "discarded"]);
  return new Map(
    z
      .array(z.object({ id: z.string(), status: z.string() }))
      .parse(data)
      .map((p) => [p.id, known.has(p.status as ProposalState) ? (p.status as ProposalState) : "other"]),
  );
}

export interface RunUsage {
  /** Units settled for the run's model steps: their real, metered cost. */
  settledUnits: number;
  /** Steps whose usage was refunded (failed or stopped on Farbaek's side). */
  refunded: number;
}

/**
 * What a run has really used, from the usage ledger: its task's model steps
 * between the run's start and end, read as the person (Row Level Security).
 */
export async function getRunUsage(client: SupabaseClient, orgId: string, run: Pick<RunView, "taskId" | "startedAt" | "endedAt">): Promise<RunUsage> {
  let query = client
    .from("ai_credit_ledger")
    .select("credits, status")
    .eq("org_id", orgId)
    .eq("task_id", run.taskId)
    .in("operation", ["model_gateway", "agent_step"])
    .gte("created_at", run.startedAt)
    .limit(2_000);
  // A step reserved just before the end settles a moment later, so allow a minute past it.
  if (run.endedAt) query = query.lte("created_at", new Date(Date.parse(run.endedAt) + 60_000).toISOString());
  const { data, error } = await query;
  if (error) throw new Error(`Couldn't read the run's usage: ${error.message}`);
  const rows = z.array(z.object({ credits: z.coerce.number(), status: z.string() })).parse(data);
  return {
    settledUnits: rows.filter((r) => r.status === "settled").reduce((n, r) => n + Math.max(0, r.credits), 0),
    refunded: rows.filter((r) => r.status === "refunded").length,
  };
}

export async function getRun(client: SupabaseClient, orgId: string, runId: string): Promise<RunView | null> {
  if (!z.uuid().safeParse(runId).success) return null;
  const { data, error } = await client.from("agent_runs").select(RUN_SELECT).eq("org_id", orgId).eq("id", runId).maybeSingle();
  if (error) throw new Error(`Couldn't load the run: ${error.message}`);
  return data ? toView(RunRow.parse(data)) : null;
}

export interface RunEventView {
  id: number;
  kind: RunEventKind;
  payload: Record<string, unknown>;
  at: string;
}

/** Events after a cursor, oldest first, a page at a time. */
export async function listRunEvents(client: SupabaseClient, orgId: string, runId: string, after = 0, limit = 200): Promise<RunEventView[]> {
  const { data, error } = await client
    .from("agent_run_events")
    .select("id, kind, payload, created_at")
    .eq("org_id", orgId)
    .eq("run_id", runId)
    .gt("id", after)
    .order("id")
    .limit(limit);
  if (error) throw new Error(`Couldn't load the run's steps: ${error.message}`);
  return z
    .array(z.object({ id: z.coerce.number(), kind: z.enum(["model", "tool", "approval", "note", "command"]), payload: z.record(z.string(), z.unknown()), created_at: z.string() }))
    .parse(data)
    .map((e) => ({ id: e.id, kind: e.kind, payload: e.payload, at: e.created_at }));
}
