/**
 * Pairing and revoking Farbaek Agents from the web app (migration 14).
 * A contributor creates a one-time code, shown once for 10 minutes, and
 * types it into the desktop app. The plan's agent limit is checked here and
 * again in the database. Owners and admins revoke any agent; the person who
 * paired one can revoke it too.
 */
import { resolveEffectivePlan } from "@/core/billing/trial";
import { PAIRING_MINUTES, newPairingCode, normalizePairingCode, sha256 } from "@/server/agent/tokens";
import { CONTRIBUTOR_ROLES } from "./types";
import { codeFromDatabaseError, fail, type RpcResult, type WriteDeps, type WriteResult } from "./use-cases";

export interface AgentAdminDeps {
  createAgentPairing(input: { orgId: string; actor: string; codeSha256: string; expiresAt: string; agentLimit: number | null }): Promise<RpcResult<string>>;
  revokeAgent(input: { agentId: string; actor: string }): Promise<RpcResult<null>>;
}

export async function createAgentPairing(deps: WriteDeps & AgentAdminDeps, input: { orgId: string; userId: string }): Promise<WriteResult<{ code: string; expiresAt: string }>> {
  const role = await deps.role(input.orgId);
  if (!role) return fail("NOT_FOUND");
  if (!CONTRIBUTOR_ROLES.includes(role)) return fail("FORBIDDEN", "Viewers can't pair agents, since agents propose changes.");
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
