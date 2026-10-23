/**
 * The agent API's rules, independent of HTTP and Supabase (AgentStore).
 *
 * An agent acts for the person who paired it. Every request resolves the
 * agent token to that person's current role; reads need membership and
 * proposals need a contributor role. An agent's proposal is checked again
 * here exactly like one made in the web app (paths, file screening, base
 * revisions, contract checks, policy, the evaluation allowance) and then
 * created by the same SQL function, tagged with the agent. The desktop app's
 * own checks are never trusted. The agent's model steps go through the model
 * gateway (gateway.ts) and are metered from the workspace's usage.
 */
import { z } from "zod";
import { WORKSPACE_LIMITS } from "@/config/workspace";
import { AGENT_MODES } from "@/core/agent/modes";
import { checkQuota } from "@/core/billing/entitlements";
import { resolveEffectivePlan, type BillingSnapshot } from "@/core/billing/trial";
import { usagePeriod, type BillingPeriod } from "@/core/billing/usage";
import { checkProposal, proposalHash, type ProposedChange, type Violation } from "@/core/realityloop/change-proposal";
import type { IntentContract } from "@/core/realityloop/contract";
import type { TaskState } from "@/core/realityloop/task-machine";
import { sha256Hex } from "@/core/trust/canonical-json";
import { evaluateChangePolicy, type PolicyDecision } from "@/core/trust/policy";
import { checkPath, screenFile } from "@/core/workspace/files";
import { MESSAGES, codeFromDatabaseError, planSteps, type RpcResult, type TransitionStep, type WriteErrorCode } from "@/server/workspace/use-cases";
import { CONTRIBUTOR_ROLES, type OrgRole } from "@/server/workspace/types";
import { newAgentToken, normalizePairingCode, sha256 } from "./tokens";

export interface AgentIdentity {
  agentId: string;
  orgId: string;
  userId: string;
  /** The paired person's role now; null once they've left the workspace. */
  role: OrgRole | null;
  name: string;
}

export interface AgentTaskSummary {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  updatedAt: string;
}

export interface AgentProjectFile {
  path: string;
  revision: number;
  sha256: string;
  sizeBytes: number;
}

/** Where one of an agent's own proposals stands in Farbaek (the Approval Wallet, ADR 0042). */
export interface AgentProposalStatus {
  id: string;
  taskId: string;
  status: "pending" | "blocked" | "applied" | "discarded";
  sha256: string;
  createdAt: string;
  /** After this a pending proposal can only be discarded. */
  expiresAt: string;
  decidedAt: string | null;
  appliedSha256: string | null;
  /** The latest ProofPack for it: unverified when applied, then the checks' result. */
  proofPack: { digest: string; status: "unverified" | "partially_verified" | "verified" | "failed" } | null;
}

export interface AgentStore {
  session(tokenSha256: string): Promise<AgentIdentity | null>;
  rateLimit(key: string, windowSeconds: number, limit: number): Promise<boolean>;
  billing(orgId: string): Promise<BillingSnapshot | null>;
  workspaceName(orgId: string): Promise<string | null>;
  /** The workspace an open (unredeemed, unexpired) code belongs to. */
  pairingOrg(codeSha256: string): Promise<string | null>;
  redeemPairing(input: { codeSha256: string; tokenSha256: string; name: string; platform: string; appVersion: string | null; agentLimit: number | null }): Promise<RpcResult<{ agentId: string; orgId: string }>>;
  readyTasks(orgId: string): Promise<AgentTaskSummary[]>;
  loadTask(orgId: string, taskId: string): Promise<{ id: string; title: string; projectId: string; state: TaskState; version: number } | null>;
  approvedContract(orgId: string, taskId: string): Promise<{ version: number; sha256: string; body: IntentContract } | null>;
  project(orgId: string, projectId: string): Promise<{ id: string; name: string; archived: boolean } | null>;
  projectFiles(orgId: string, projectId: string): Promise<AgentProjectFile[]>;
  fileContents(orgId: string, projectId: string, files: readonly { path: string; revision: number }[]): Promise<Map<string, string>>;
  countEvaluations(orgId: string, period: BillingPeriod): Promise<number>;
  createAgentProposal(input: {
    agentId: string;
    taskId: string;
    actor: string;
    contractVersion: number;
    plan: { summary: string; steps: string[]; risks: string[]; checks: string[] };
    changes: ProposedChange[];
    violations: Violation[];
    sha256: string;
    usage: { model: string; inputTokens: number; outputTokens: number };
    expectedTaskVersion: number;
    steps: TransitionStep[];
    policy: PolicyDecision;
    evaluationLimit: number | null;
    period: BillingPeriod;
  }): Promise<RpcResult<string>>;
  revokeAgent(agentId: string, actor: string): Promise<RpcResult<null>>;
  /** One proposal this agent made, in its workspace; null for anyone else's. */
  agentProposal(orgId: string, agentId: string, proposalId: string): Promise<AgentProposalStatus | null>;
  newEventId(): string;
  now(): Date;
}

export type AgentErrorCode = WriteErrorCode | "UNAUTHENTICATED" | "RATE_LIMITED" | "INVALID_REQUEST" | "TOO_LARGE" | "RUN_CAP_REACHED";
export type AgentResult<T> = { ok: true; value: T } | { ok: false; status: number; code: AgentErrorCode; message: string };

const STATUS: Partial<Record<AgentErrorCode, number>> = {
  UNAUTHENTICATED: 401,
  AGENT_REVOKED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  PAIRING_CLOSED: 410,
  RATE_LIMITED: 429,
  RUN_CAP_REACHED: 402,
  INVALID_REQUEST: 400,
  INVALID_PAIRING: 400,
  INVALID_PATH: 422,
  INVALID_PROPOSAL: 422,
  SECRET_IN_CONTENT: 422,
  FILE_TOO_LARGE: 422,
  TOO_LARGE: 413,
  ENTITLEMENT_UNAVAILABLE: 503,
  QUOTA_EXCEEDED: 402,
  TRIAL_CAP_REACHED: 402,
  UNKNOWN: 500,
};

export function agentFail(code: AgentErrorCode, message?: string): { ok: false; status: number; code: AgentErrorCode; message: string } {
  const fallback = code in MESSAGES ? MESSAGES[code as WriteErrorCode] : "The request couldn't be completed.";
  return { ok: false, status: STATUS[code] ?? 409, code, message: message ?? fallback };
}

const PLATFORMS = ["windows", "macos", "linux"] as const;

export const PairBody = z.object({
  code: z.string().max(40),
  name: z.string().trim().min(1).max(60),
  platform: z.enum(PLATFORMS),
  appVersion: z
    .string()
    .regex(/^[0-9A-Za-z.+-]{1,40}$/)
    .optional(),
});

/** Redeems a pairing code. The token in the result is shown to the app once; only its hash is kept. */
export async function pairAgent(store: AgentStore, body: unknown, clientKey: string): Promise<AgentResult<{ token: string; agentId: string; workspace: { id: string; name: string } }>> {
  if (!(await store.rateLimit("agent:pair", 60, 60)) || !(await store.rateLimit(`agent:pair:${clientKey}`, 60, 10))) {
    return agentFail("RATE_LIMITED", "Too many pairing attempts in the last minute. Wait a minute and try again.");
  }
  const parsed = PairBody.safeParse(body);
  if (!parsed.success) return agentFail("INVALID_REQUEST", "Send the pairing code, a name for this computer (up to 60 characters) and its platform.");
  const code = normalizePairingCode(parsed.data.code);
  if (!code) return agentFail("INVALID_PAIRING", "A pairing code has 10 letters and digits, like ABCDE-23456.");
  const codeSha256 = sha256(code);
  const orgId = await store.pairingOrg(codeSha256);
  if (!orgId) return agentFail("PAIRING_CLOSED", "This code isn't valid, or it was already used or has expired. Create a new code in Farbaek.");

  const snapshot = await store.billing(orgId);
  const plan = snapshot ? resolveEffectivePlan(snapshot, store.now()) : null;
  if (!plan) return agentFail("ENTITLEMENT_UNAVAILABLE", "This workspace's plan couldn't be read, so pairing is paused. Try again later.");

  const token = newAgentToken();
  const redeemed = await store.redeemPairing({
    codeSha256,
    tokenSha256: sha256(token),
    name: parsed.data.name,
    platform: parsed.data.platform,
    appVersion: parsed.data.appVersion ?? null,
    agentLimit: plan.limits.agents,
  });
  if (!redeemed.ok) return agentFail(codeFromDatabaseError(redeemed.error));
  return { ok: true, value: { token, agentId: redeemed.value.agentId, workspace: { id: orgId, name: (await store.workspaceName(orgId)) ?? "Workspace" } } };
}

function requireMember(id: AgentIdentity): AgentResult<OrgRole> {
  return id.role ? { ok: true, value: id.role } : agentFail("UNAUTHENTICATED", "The person who paired this agent isn't in the workspace anymore. Pair the app again.");
}

export function requireAgentContributor(id: AgentIdentity): AgentResult<OrgRole> {
  const member = requireMember(id);
  if (!member.ok) return member;
  return CONTRIBUTOR_ROLES.includes(member.value) ? member : agentFail("FORBIDDEN", "The person who paired this agent can only view this workspace, so the agent can't propose changes.");
}

export async function agentProfile(store: AgentStore, id: AgentIdentity) {
  const member = requireMember(id);
  if (!member.ok) return member;
  return {
    ok: true as const,
    value: {
      agent: { id: id.agentId, name: id.name },
      workspace: { id: id.orgId, name: (await store.workspaceName(id.orgId)) ?? "Workspace" },
      role: member.value,
      canPropose: CONTRIBUTOR_ROLES.includes(member.value),
    },
  };
}

export async function listAgentTasks(store: AgentStore, id: AgentIdentity): Promise<AgentResult<AgentTaskSummary[]>> {
  const member = requireMember(id);
  if (!member.ok) return member;
  return { ok: true, value: await store.readyTasks(id.orgId) };
}

export async function agentTask(store: AgentStore, id: AgentIdentity, taskId: string) {
  const member = requireMember(id);
  if (!member.ok) return member;
  const task = await store.loadTask(id.orgId, taskId);
  if (!task) return agentFail("NOT_FOUND", "There's no such task in this workspace.");
  const [contract, project, files] = await Promise.all([store.approvedContract(id.orgId, task.id), store.project(id.orgId, task.projectId), store.projectFiles(id.orgId, task.projectId)]);
  if (!project) return agentFail("NOT_FOUND", "The task's project doesn't exist anymore.");
  return {
    ok: true as const,
    value: {
      task: { id: task.id, title: task.title, state: task.state, version: task.version, readyForChange: task.state === "CONTRACT_APPROVED" && contract !== null && !project.archived },
      project: { id: project.id, name: project.name, archived: project.archived },
      contract: contract ? { version: contract.version, sha256: contract.sha256, body: contract.body } : null,
      files,
    },
  };
}

/** Where one of this agent's own proposals stands: waiting, applied (and verified), discarded, or past its window. */
export async function agentProposal(store: AgentStore, id: AgentIdentity, proposalId: string): Promise<AgentResult<AgentProposalStatus>> {
  const member = requireMember(id);
  if (!member.ok) return member;
  const found = await store.agentProposal(id.orgId, id.agentId, proposalId);
  return found ? { ok: true, value: found } : agentFail("NOT_FOUND", "This agent made no such proposal in this workspace.");
}

/** One page of the task's project files with their content, at most `maxBytes` of content or 300 files, after the `after` path. */
export async function agentTaskFiles(store: AgentStore, id: AgentIdentity, taskId: string, after: string | null, maxBytes = 2 * 1024 * 1024) {
  const member = requireMember(id);
  if (!member.ok) return member;
  const task = await store.loadTask(id.orgId, taskId);
  if (!task) return agentFail("NOT_FOUND", "There's no such task in this workspace.");
  const all = await store.projectFiles(id.orgId, task.projectId);
  const rest = after === null ? all : all.filter((f) => f.path > after);
  const page: AgentProjectFile[] = [];
  let bytes = 0;
  for (const f of rest) {
    if (page.length >= 300 || (page.length > 0 && bytes + f.sizeBytes > maxBytes)) break;
    page.push(f);
    bytes += f.sizeBytes;
  }
  const contents = await store.fileContents(id.orgId, task.projectId, page);
  const files = page.flatMap((f) => {
    const content = contents.get(f.path);
    return content === undefined ? [] : [{ path: f.path, revision: f.revision, sha256: f.sha256, content }];
  });
  const last = page.at(-1)?.path ?? null;
  return { ok: true as const, value: { files, next: rest.length > page.length ? last : null, total: all.length } };
}

const Line = z.string().max(300);
export const ProposalBody = z.object({
  contractVersion: z.number().int().positive(),
  contractSha256: z.string().regex(/^[0-9a-f]{64}$/),
  plan: z.object({ summary: z.string().trim().min(1).max(2_000), steps: z.array(Line).max(20), risks: z.array(Line).max(20), checks: z.array(Line).max(20) }),
  changes: z
    .array(z.object({ path: z.string().max(300), kind: z.enum(["create", "edit"]), baseRevision: z.number().int().min(0), content: z.string().max(WORKSPACE_LIMITS.maxFileBytes), reason: z.string().max(500) }))
    .min(1)
    .max(30),
  notProposed: z.array(z.object({ path: z.string().max(300), reason: Line })).max(100).default([]),
  usage: z.object({ model: z.string().trim().min(1).max(100), inputTokens: z.number().int().min(0), outputTokens: z.number().int().min(0) }),
  mode: z.enum(AGENT_MODES),
});

export interface AgentProposalResult {
  proposalId: string;
  status: "pending" | "blocked";
  violations: Violation[];
  policy: { outcome: string; findings: { rule: string; outcome: string; detail: string }[] };
}

/** Who made a proposal: a paired desktop agent, or a cloud run (ADR 0022). Its steps are tagged with this. */
export type ProposalSource = { kind: "agent"; agentId: string } | { kind: "run"; runId: string };

export type ProposalInput = Parameters<AgentStore["createAgentProposal"]>[0] extends infer T ? Omit<T, "agentId"> : never;

/** What checking an agent's work needs. AgentStore fits; cloud runs bring their own. */
export type ProposalChecks = Pick<AgentStore, "loadTask" | "approvedContract" | "project" | "projectFiles" | "billing" | "countEvaluations" | "newEventId" | "now">;

/**
 * Checks an agent's finished work exactly like a proposal made in the web
 * app (paths, file screening, base revisions, the contract, policy, the
 * evaluation allowance) and prepares the proposal. The caller creates it
 * with the SQL function for its source.
 */
export async function prepareAgentProposal(
  store: ProposalChecks,
  id: Pick<AgentIdentity, "orgId" | "userId">,
  source: ProposalSource,
  taskId: string,
  body: unknown,
): Promise<AgentResult<{ input: ProposalInput; blocked: boolean }>> {
  const parsed = ProposalBody.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return agentFail("INVALID_REQUEST", `The proposal isn't valid: ${issue?.path.join(".") || "body"}: ${issue?.message ?? "invalid"}.`);
  }
  const input = parsed.data;

  const task = await store.loadTask(id.orgId, taskId);
  if (!task) return agentFail("NOT_FOUND", "There's no such task in this workspace.");
  if (task.state !== "CONTRACT_APPROVED") return agentFail("INVALID_TRANSITION", "This task isn't waiting for a change: its contract isn't approved, or another proposal is open.");
  const contract = await store.approvedContract(id.orgId, task.id);
  if (!contract || contract.version !== input.contractVersion || contract.sha256 !== input.contractSha256) {
    return agentFail("CONTRACT_CHANGED", "The task's approved contract changed since the agent started. Start a new run on the current contract.");
  }
  const project = await store.project(id.orgId, task.projectId);
  if (!project) return agentFail("NOT_FOUND");
  if (project.archived) return agentFail("PROJECT_ARCHIVED");

  const current = new Map((await store.projectFiles(id.orgId, task.projectId)).map((f) => [f.path, f]));
  const seen = new Set<string>();
  const changes: ProposedChange[] = [];
  for (const c of input.changes) {
    const checked = checkPath(c.path);
    if (!checked.ok) return agentFail("INVALID_PATH", `${c.path.slice(0, 120)}: ${checked.reason}`);
    if (seen.has(checked.path)) return agentFail("INVALID_PROPOSAL", `${checked.path} appears twice.`);
    seen.add(checked.path);
    const screened = screenFile(checked.path, c.content, new TextEncoder().encode(c.content).length, WORKSPACE_LIMITS.maxFileBytes);
    if (!screened.ok) {
      return screened.reason === "too_large"
        ? agentFail("FILE_TOO_LARGE")
        : screened.reason === "secret_content"
          ? agentFail("SECRET_IN_CONTENT")
          : agentFail("INVALID_PATH", `${checked.path} can't be part of a proposal (${screened.reason.replace(/_/g, " ")}).`);
    }
    const existing = current.get(checked.path);
    if (c.kind === "edit" && (!existing || existing.revision !== c.baseRevision)) return agentFail("FILE_CHANGED", `${checked.path} changed in Farbaek since the agent copied it. Start a new run.`);
    if (c.kind === "create" && (existing || c.baseRevision !== 0)) return agentFail("FILE_CHANGED", `${checked.path} already exists in Farbaek. Start a new run.`);
    changes.push({ path: checked.path, kind: c.kind, baseRevision: c.baseRevision, content: c.content, sha256: await sha256Hex(c.content), reason: c.reason.replace(/\s+/g, " ").trim().slice(0, 500) || "Changed by Farbaek Agent." });
  }

  // A proposal is a governed evaluation, whoever made it.
  const now = store.now();
  const snapshot = await store.billing(id.orgId);
  const plan = snapshot ? resolveEffectivePlan(snapshot, now) : null;
  const period = usagePeriod(plan?.source === "trial" ? snapshot?.trial : undefined, null, now);
  const evaluations = checkQuota(plan, "evaluations", { used: await store.countEvaluations(id.orgId, period) });
  if (!evaluations.allowed) {
    return evaluations.code === "QUOTA_EXCEEDED" || evaluations.code === "TRIAL_CAP_REACHED" ? agentFail("EVALUATION_LIMIT") : agentFail(evaluations.code, evaluations.message);
  }

  const violations = checkProposal(contract.body, changes);
  const policy = await evaluateChangePolicy({ files: changes, contractViolations: violations });
  const blocked = policy.outcome === "BLOCK";
  const sha = await proposalHash({ taskId: task.id, contractVersion: contract.version, contractSha256: contract.sha256, changes });
  const planned = planSteps(store, { ...task, orgId: id.orgId }, id.userId, ["propose_plan", "evaluate_policy", blocked ? "block" : "require_approval"]);
  if (!planned.ok) return agentFail(planned.code);
  const actorId = source.kind === "agent" ? `agent:${source.agentId}` : `run:${source.runId}`;
  const steps = planned.steps.map((s, i) => (i === 0 ? { ...s, actor_kind: "agent" as const, actor_id: actorId } : { ...s, actor_kind: "system" as const, actor_id: "farbaek" }));

  const left = input.notProposed.slice(0, 5).map((n) => `Left out ${n.path.slice(0, 120)}: ${n.reason}`);
  return {
    ok: true,
    value: {
      blocked,
      input: {
        taskId: task.id,
        actor: id.userId,
        contractVersion: contract.version,
        plan: { summary: input.plan.summary, steps: input.plan.steps, risks: [...input.plan.risks, ...left].slice(0, 20), checks: input.plan.checks },
        changes,
        violations,
        sha256: sha,
        usage: input.usage,
        expectedTaskVersion: task.version,
        steps,
        policy,
        evaluationLimit: plan?.limits.evaluationsPerMonth ?? null,
        period,
      },
    },
  };
}

export function proposalResult(proposalId: string, prepared: { input: ProposalInput; blocked: boolean }): AgentProposalResult {
  const { violations, policy } = prepared.input;
  return {
    proposalId,
    status: prepared.blocked ? "blocked" : "pending",
    violations,
    policy: { outcome: policy.outcome, findings: policy.findings.map((f) => ({ rule: f.rule, outcome: f.outcome, detail: f.detail })) },
  };
}

export async function submitAgentProposal(store: AgentStore, id: AgentIdentity, taskId: string, body: unknown): Promise<AgentResult<AgentProposalResult>> {
  const role = requireAgentContributor(id);
  if (!role.ok) return role;
  if (!(await store.rateLimit(`agent:propose:${id.agentId}`, 60, 10))) return agentFail("RATE_LIMITED", "Too many proposals from this agent in the last minute.");
  const prepared = await prepareAgentProposal(store, id, { kind: "agent", agentId: id.agentId }, taskId, body);
  if (!prepared.ok) return prepared;
  const created = await store.createAgentProposal({ agentId: id.agentId, ...prepared.value.input });
  if (!created.ok) return agentFail(codeFromDatabaseError(created.error));
  return { ok: true, value: proposalResult(created.value, prepared.value) };
}

export async function unpairAgent(store: AgentStore, id: AgentIdentity): Promise<AgentResult<null>> {
  const revoked = await store.revokeAgent(id.agentId, id.userId);
  return revoked.ok ? { ok: true, value: null } : agentFail(codeFromDatabaseError(revoked.error));
}
