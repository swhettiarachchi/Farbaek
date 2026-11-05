/**
 * Pairing and revoking Farbaek Agents from the web app (migration 14).
 * A contributor creates a one-time code, shown once for 10 minutes, and
 * types it into the desktop app. The plan's agent limit is checked here and
 * again in the database. Owners and admins revoke any agent; the person who
 * paired one can revoke it too, and the same people set its permission lease
 * (ADR 0117).
 */
import { checkLeaseInput, type LeaseInput } from "@/core/agent/lease";
import { resolveEffectivePlan } from "@/core/billing/trial";
import type { WithheldPermissions } from "@/core/workspace/permissions";
import { PAIRING_MINUTES, newPairingCode, normalizePairingCode, sha256 } from "@/server/agent/tokens";
import { CONTRIBUTOR_ROLES } from "./types";
import { codeFromDatabaseError, fail, requirePermission, type RpcResult, type WriteDeps, type WriteResult } from "./use-cases";

export interface AgentAdminDeps {
  createAgentPairing(input: { orgId: string; actor: string; codeSha256: string; expiresAt: string; agentLimit: number | null }): Promise<RpcResult<string>>;
  revokeAgent(input: { agentId: string; actor: string }): Promise<RpcResult<null>>;
  /** Returns when the new lease ends. */
  setAgentLease(input: LeaseInput & { agentId: string; actor: string }): Promise<RpcResult<string>>;
}

export async function createAgentPairing(deps: WriteDeps & AgentAdminDeps, input: { orgId: string; userId: string; permissions?: WithheldPermissions }): Promise<WriteResult<{ code: string; expiresAt: string }>> {
  const role = await deps.role(input.orgId);
  if (!role) return fail("NOT_FOUND");
  if (!CONTRIBUTOR_ROLES.includes(role)) return fail("FORBIDDEN", "Viewers can't pair agents, since agents suggest changes.");
  const allowed = requirePermission(role, input.permissions ?? {}, "run_agents");
  if (!allowed.ok) return allowed;
  const snapshot = await deps.billing(input.orgId);
  if (!snapshot) return fail("ENTITLEMENT_UNAVAILABLE");
  const plan = resolveEffectivePlan(snapshot, deps.now());

  const code = newPairingCode();
  const expiresAt = new Date(deps.now().getTime() + PAIRING_MINUTES * 60_000).toISOString();
  const created = await deps.createAgentPairing({ orgId: input.orgId, actor: input.userId, codeSha256: sha256(normalizePairingCode(code)!), expiresAt, agentLimit: plan.limits.agents });
  if (!created.ok) return fail(codeFromDatabaseError(created.error));
  return { ok: true, value: { code, expiresAt } };
}

export async function revokeAgent(deps: WriteDeps & AgentAdminDeps, input: { orgId: string; userId: string; agentId: string }): Promise<WriteResult<null>> {
  const role = await deps.role(input.orgId);
  if (!role) return fail("NOT_FOUND");
  const r = await deps.revokeAgent({ agentId: input.agentId, actor: input.userId });
  if (!r.ok) return fail(codeFromDatabaseError(r.error));
  return r;
}

/**
 * Renews, narrows or widens an agent's lease. Anyone in the workspace may ask;
 * the database allows only owners, admins and the person who paired it, and
 * records the change in the audit log.
 */
export async function setAgentLease(
  deps: WriteDeps & AgentAdminDeps,
  input: { orgId: string; userId: string; agentId: string; lease: { days: unknown; projects: unknown; capabilities: unknown; actionsPerHour: unknown } },
): Promise<WriteResult<{ expiresAt: string }>> {
  const role = await deps.role(input.orgId);
  if (!role) return fail("NOT_FOUND");
  const lease = checkLeaseInput(input.lease);
  if (!lease.ok) return fail("INVALID_LEASE", lease.message);
  const r = await deps.setAgentLease({ ...lease.value, agentId: input.agentId, actor: input.userId });
  if (!r.ok) return fail(codeFromDatabaseError(r.error));
  return { ok: true, value: { expiresAt: r.value } };
}
