/**
 * Continue on my computer (ADR 0139): a contributor hands a task to one of
 * the workspace's desktop agents, and that agent reports the checks it ran.
 * Writes go through the service-role `app_*handoff*` functions, which
 * re-check the person or the agent; the report's digest is worked out here,
 * never taken from the agent. Pages read handoffs through the person's own
 * client, so Row Level Security decides what they see.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { HANDOFF_STATUSES, HandoffCheckResultSchema, HandoffReportSchema, handoffDigest, type HandoffCheckResult, type HandoffReport, type HandoffStatus, anyCheckForComputer } from "@/core/agent/handoff";
import { trialChecksFor } from "@/server/arena/runner";
import { CONTRIBUTOR_ROLES, type OrgRole } from "@/server/workspace/types";
import { codeFromDatabaseError, fail, requirePermission, type RpcResult, type WriteResult } from "@/server/workspace/use-cases";
import type { WithheldPermissions } from "@/core/workspace/permissions";
import { agentFail, leaseCoversProject, OUTSIDE_LEASE, type AgentIdentity, type AgentResult, type AgentStore } from "./service";

export interface HandoffSummary {
  id: string;
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
  note: string | null;
  checks: string[];
  proposal: { id: string; sha256: string } | null;
  status: HandoffStatus;
  createdAt: string;
  expiresAt: string;
}

export interface HandoffDetail extends HandoffSummary {
  /** The change waiting for review, as the desktop needs it to build its copy. */
  change: { summary: string; steps: string[]; risks: string[]; files: { path: string; kind: "create" | "edit"; content: string }[] } | null;
}

export interface HandoffStore {
  openFor(orgId: string, agentId: string): Promise<HandoffSummary[]>;
  detail(orgId: string, agentId: string, id: string): Promise<HandoffDetail | null>;
  latestPendingProposal(orgId: string, taskId: string): Promise<{ id: string; projectId: string } | null>;
  request(input: { orgId: string; actor: string; taskId: string; agentId: string; proposalId: string | null; checks: string[]; note: string | null }): Promise<RpcResult<string>>;
  cancel(input: { id: string; actor: string }): Promise<RpcResult<null>>;
  open(input: { orgId: string; agentId: string; id: string }): Promise<RpcResult<null>>;
  finish(input: { orgId: string; agentId: string; id: string } & ({ status: "done"; report: HandoffReport; digest: string; reason: string | null } | { status: "failed"; reason: string })): Promise<RpcResult<null>>;
}

const nothing = z.null().or(z.literal("")).transform(() => null);

const Row = z.object({
  id: z.string(),
  task_id: z.string(),
  note: z.string().nullable(),
  checks: z.array(z.string()),
  proposal_id: z.string().nullable(),
  proposal_sha256: z.string().nullable(),
  status: z.enum(HANDOFF_STATUSES),
  created_at: z.string(),
  expires_at: z.string(),
  tasks: z.object({ title: z.string(), project_id: z.string(), projects: z.object({ name: z.string() }).nullable() }).nullable(),
});
const SELECT = "id, task_id, note, checks, proposal_id, proposal_sha256, status, created_at, expires_at, tasks(title, project_id, projects(name))";

const toSummary = (r: z.infer<typeof Row>): HandoffSummary => ({
  id: r.id,
  taskId: r.task_id,
  taskTitle: r.tasks?.title ?? "Task",
  projectId: r.tasks?.project_id ?? "",
  projectName: r.tasks?.projects?.name ?? "Project",
  note: r.note,
  checks: r.checks,
  proposal: r.proposal_id && r.proposal_sha256 ? { id: r.proposal_id, sha256: r.proposal_sha256 } : null,
  status: r.status,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
});

const ProposalRow = z.object({
  plan: z.object({ summary: z.string().catch(""), steps: z.array(z.string()).catch([]), risks: z.array(z.string()).catch([]) }).catch({ summary: "", steps: [], risks: [] }),
  changes: z.array(z.object({ path: z.string(), kind: z.enum(["create", "edit"]), content: z.string() })),
});

export function createSupabaseHandoffStore(admin: SupabaseClient): HandoffStore {
  async function rpc<T>(fn: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<RpcResult<T>> {
    const { data, error } = await admin.rpc(fn, args);
    if (error) return { ok: false, error: error.message };
    const parsed = schema.safeParse(data);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: "UNEXPECTED_RESPONSE" };
  }
  return {
    async openFor(orgId, agentId) {
      const { data, error } = await admin
        .from("agent_handoffs")
        .select(SELECT)
        .eq("org_id", orgId)
        .eq("agent_id", agentId)
        .in("status", ["waiting", "opened"])
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw new Error(`Couldn't read the handoffs: ${error.message}`);
      return (data ?? []).flatMap((d) => {
        const r = Row.safeParse(d);
        return r.success ? [toSummary(r.data)] : [];
      });
    },
    async detail(orgId, agentId, id) {
      if (!z.uuid().safeParse(id).success) return null;
      const { data, error } = await admin.from("agent_handoffs").select(SELECT).eq("org_id", orgId).eq("agent_id", agentId).eq("id", id).maybeSingle();
      if (error) throw new Error(`Couldn't read the handoff: ${error.message}`);
      const r = Row.safeParse(data);
      if (!r.success) return null;
      const summary = toSummary(r.data);
      if (!summary.proposal) return { ...summary, change: null };
      const p = await admin.from("change_proposals").select("plan, changes").eq("org_id", orgId).eq("id", summary.proposal.id).maybeSingle();
      const parsed = ProposalRow.safeParse(p.data);
      return { ...summary, change: parsed.success ? { ...parsed.data.plan, files: parsed.data.changes } : null };
    },
    async latestPendingProposal(orgId, taskId) {
      const { data } = await admin.from("change_proposals").select("id, project_id").eq("org_id", orgId).eq("task_id", taskId).eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data ? { id: String(data.id), projectId: String(data.project_id) } : null;
    },
    request: (i) =>
      rpc("app_request_handoff", { p_org: i.orgId, p_actor: i.actor, p_task: i.taskId, p_agent: i.agentId, p_proposal: i.proposalId, p_checks: i.checks, p_note: i.note }, z.string()),
    cancel: (i) => rpc("app_cancel_handoff", { p_handoff: i.id, p_actor: i.actor }, nothing),
    open: (i) => rpc("app_agent_open_handoff", { p_org: i.orgId, p_agent: i.agentId, p_handoff: i.id }, nothing),
    finish: (i) =>
      rpc(
        "app_agent_finish_handoff",
        {
          p_org: i.orgId,
          p_agent: i.agentId,
          p_handoff: i.id,
          p_status: i.status,
          p_result: i.status === "done" ? i.report : null,
          p_digest: i.status === "done" ? i.digest : null,
          p_reason: i.reason,
        },
        nothing,
      ),
  };
}

// The agent's side

function member(id: AgentIdentity): AgentResult<null> {
  return id.role ? { ok: true, value: null } : agentFail("UNAUTHENTICATED", "The person who paired this agent isn't in the workspace anymore. Pair the app again.");
}

/** The handoffs waiting for this agent, inside its lease. */
export async function agentHandoffs(store: HandoffStore, id: AgentIdentity): Promise<AgentResult<HandoffSummary[]>> {
  const m = member(id);
  if (!m.ok) return m;
  return { ok: true, value: (await store.openFor(id.orgId, id.agentId)).filter((h) => leaseCoversProject(id, h.projectId)) };
}

export async function agentHandoff(store: HandoffStore, id: AgentIdentity, handoffId: string): Promise<AgentResult<HandoffDetail>> {
  const m = member(id);
  if (!m.ok) return m;
  const found = await store.detail(id.orgId, id.agentId, handoffId);
  if (!found) return agentFail("NOT_FOUND", "There's no such handoff for this computer.");
  if (!leaseCoversProject(id, found.projectId)) return agentFail("FORBIDDEN", OUTSIDE_LEASE);
  return { ok: true, value: found };
}

export async function agentOpenHandoff(store: HandoffStore, id: AgentIdentity, handoffId: string): Promise<AgentResult<null>> {
  const found = await agentHandoff(store, id, handoffId);
  if (!found.ok) return found;
  const r = await store.open({ orgId: id.orgId, agentId: id.agentId, id: handoffId });
  return r.ok ? { ok: true, value: null } : agentFail(codeFromDatabaseError(r.error), "This handoff can't be opened now: it ran, lapsed or was withdrawn.");
}

export const HandoffResultBody = z.discriminatedUnion("status", [
  z.object({ status: z.literal("done"), report: HandoffReportSchema }),
  z.object({ status: z.literal("failed"), reason: z.string().trim().min(1).max(500) }),
]);

/** The agent's report, once. Its digest is worked out here from exactly what was received. */
export async function agentFinishHandoff(store: HandoffStore, id: AgentIdentity, handoffId: string, body: unknown): Promise<AgentResult<{ digest: string | null }>> {
  const parsed = HandoffResultBody.safeParse(body);
  if (!parsed.success) return agentFail("INVALID_REQUEST", "The report isn't in the expected shape.");
  const found = await agentHandoff(store, id, handoffId);
  if (!found.ok) return found;
  if (parsed.data.status === "done" && parsed.data.report.proposalSha256 !== (found.value.proposal?.sha256 ?? null)) {
    return agentFail("INVALID_REQUEST", "The report is for a different version of the change than this handoff.");
  }
  if (parsed.data.status === "failed") {
    const r = await store.finish({ orgId: id.orgId, agentId: id.agentId, id: handoffId, status: "failed", reason: parsed.data.reason });
    return r.ok ? { ok: true, value: { digest: null } } : agentFail(codeFromDatabaseError(r.error), "This handoff can't take a report now.");
  }
  const digest = await handoffDigest(handoffId, parsed.data.report);
  const r = await store.finish({ orgId: id.orgId, agentId: id.agentId, id: handoffId, status: "done", report: parsed.data.report, digest, reason: null });
  return r.ok ? { ok: true, value: { digest } } : agentFail(codeFromDatabaseError(r.error), "This handoff can't take a report now.");
}

// The person's side

export interface HandoffPerson {
  orgId: string;
  userId: string;
  role: OrgRole;
  permissions: WithheldPermissions;
}

/** Hands a task to an agent: the contract's checks (or Farbaek's for the kind of project) and the change waiting, if any. */
export async function requestHandoff(
  deps: { handoffs: HandoffStore; checks: Pick<AgentStore, "loadTask" | "approvedContract" | "projectFiles" | "fileContents"> },
  person: HandoffPerson,
  input: { taskId: string; agentId: string; note: string | null },
): Promise<WriteResult<{ handoffId: string }>> {
  if (!CONTRIBUTOR_ROLES.includes(person.role)) return fail("FORBIDDEN", "Viewers can't hand tasks to a computer. Ask a member, admin or owner.");
  const allowed = requirePermission(person.role, person.permissions, "run_agents");
  if (!allowed.ok) return allowed;
  const task = await deps.checks.loadTask(person.orgId, input.taskId);
  if (!task) return fail("NOT_FOUND");
  const proposal = await deps.handoffs.latestPendingProposal(person.orgId, task.id);
  const checks = await trialChecksFor(deps, person.orgId, { taskId: task.id, projectId: task.projectId });
  if (checks.length === 0) return fail("INVALID_TRANSITION", "The plan lists no checks, and Farbaek has none for this kind of project, so there's nothing for your computer to run.");
  // A check that can't go is skipped there and says why, so the rest still run. With none left, there's nothing to send.
  if (!anyCheckForComputer(checks)) return fail("INVALID_TRANSITION", "This task's checks only run in a test space, so there's nothing for your computer to run. Run them from this page instead.");
  const r = await deps.handoffs.request({ orgId: person.orgId, actor: person.userId, taskId: task.id, agentId: input.agentId, proposalId: proposal?.id ?? null, checks: checks.slice(0, 20), note: input.note?.trim() || null });
  if (!r.ok) {
    if (r.error.includes("HANDOFF_OPEN")) return fail("INVALID_TRANSITION", "This task is already waiting on that computer.");
    if (r.error.includes("AGENT_NOT_FOUND")) return fail("NOT_FOUND", "That isn't one of your paired computers. A task can only go to a computer you paired yourself.");
    return fail(codeFromDatabaseError(r.error));
  }
  return { ok: true, value: { handoffId: r.value } };
}

export async function cancelHandoff(deps: { handoffs: HandoffStore }, person: HandoffPerson, handoffId: string): Promise<WriteResult<null>> {
  if (!CONTRIBUTOR_ROLES.includes(person.role)) return fail("FORBIDDEN");
  const r = await deps.handoffs.cancel({ id: handoffId, actor: person.userId });
  return r.ok ? { ok: true, value: null } : fail(codeFromDatabaseError(r.error), "It already ran, lapsed or was withdrawn.");
}

export interface HandoffView {
  id: string;
  agentName: string;
  note: string | null;
  checks: string[];
  status: HandoffStatus;
  result: HandoffCheckResult[] | null;
  digest: string | null;
  reason: string | null;
  proposalSha256: string | null;
  createdAt: string;
  expiresAt: string;
  finishedAt: string | null;
}

const ViewRow = z.object({
  id: z.string(),
  note: z.string().nullable(),
  checks: z.array(z.string()),
  status: z.enum(HANDOFF_STATUSES),
  result: z.object({ checks: z.array(z.unknown()) }).passthrough().nullable(),
  result_digest: z.string().nullable(),
  reason: z.string().nullable(),
  proposal_sha256: z.string().nullable(),
  created_at: z.string(),
  expires_at: z.string(),
  finished_at: z.string().nullable(),
  agents: z.object({ name: z.string() }).nullable(),
});

/** A task's handoffs, newest first, read as the person. An open one past its day reads as lapsed. */
export async function readHandoffs(client: SupabaseClient, orgId: string, taskId: string, now = new Date()): Promise<HandoffView[]> {
  const { data, error } = await client
    .from("agent_handoffs")
    .select("id, note, checks, status, result, result_digest, reason, proposal_sha256, created_at, expires_at, finished_at, agents(name)")
    .eq("org_id", orgId)
    .eq("task_id", taskId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(`Couldn't read the handoffs: ${error.message}`);
  return (data ?? []).flatMap((d) => {
    const r = ViewRow.safeParse(d);
    if (!r.success) return [];
    const v = r.data;
    const lapsed = (v.status === "waiting" || v.status === "opened") && Date.parse(v.expires_at) < now.getTime();
    return [
      {
        id: v.id,
        agentName: v.agents?.name ?? "A computer",
        note: v.note,
        checks: v.checks,
        status: lapsed ? "expired" : v.status,
        result: v.result ? v.result.checks.flatMap((c) => (HandoffCheckResultSchema.safeParse(c).success ? [HandoffCheckResultSchema.parse(c)] : [])) : null,
        digest: v.result_digest,
        reason: lapsed ? "Nobody ran it within a day, so it lapsed." : v.reason,
        proposalSha256: v.proposal_sha256,
        createdAt: v.created_at,
        expiresAt: v.expires_at,
        finishedAt: v.finished_at,
      },
    ];
  });
}
