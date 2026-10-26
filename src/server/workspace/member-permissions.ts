/**
 * Permissions per person (ADR 0087): owners and admins turn permissions off
 * for members, on plans that include it. Turning one back on is always
 * allowed, so a workspace that leaves the plan is never stuck with less.
 * The database checks who may, and enforces each permission again.
 */
import { checkFeature } from "@/core/billing/entitlements";
import { resolveEffectivePlan } from "@/core/billing/trial";
import { PERMISSIONS, type Permission, type WithheldPermissions } from "@/core/workspace/permissions";
import { MANAGER_ROLES, type OrgRole } from "./types";
import { codeFromDatabaseError, fail, type RpcResult, type WriteDeps, type WriteResult } from "./use-cases";

export const PERMISSIONS_NOT_IN_PLAN = "Permissions per person are included in Max and up.";

export interface MemberPermissionDeps {
  /** Someone in the workspace, read as the signed-in person. */
  member(orgId: string, userId: string): Promise<{ role: OrgRole; permissions: WithheldPermissions } | null>;
  setPermissions(input: { orgId: string; actor: string; userId: string; permissions: Record<Permission, boolean> }): Promise<RpcResult<unknown>>;
}

export async function setMemberPermissions(
  deps: Pick<WriteDeps, "role" | "billing" | "now"> & MemberPermissionDeps,
  input: { orgId: string; userId: string; memberId: string; permissions: Record<Permission, boolean> },
): Promise<WriteResult<null>> {
  const role = await deps.role(input.orgId);
  if (!role) return fail("NOT_FOUND");
  if (!MANAGER_ROLES.includes(role)) return fail("FORBIDDEN", "Only an owner or admin can change someone's permissions.");
  const member = await deps.member(input.orgId, input.memberId);
  if (!member) return fail("NOT_FOUND", "That person isn't in this workspace any more. Reload the page.");
  if (member.role !== "member") return fail("INVALID_PERMISSIONS");
  const turningOff = PERMISSIONS.some((p) => !input.permissions[p] && member.permissions[p] !== false);
  if (turningOff) {
    const snapshot = await deps.billing(input.orgId);
    const feature = checkFeature(snapshot ? resolveEffectivePlan(snapshot, deps.now()) : null, "advanced_rbac");
    if (!feature.allowed) return fail(feature.code, feature.code === "FEATURE_NOT_IN_PLAN" ? PERMISSIONS_NOT_IN_PLAN : feature.message);
  }
  const r = await deps.setPermissions({ orgId: input.orgId, actor: input.userId, userId: input.memberId, permissions: input.permissions });
  return r.ok ? { ok: true, value: null } : fail(codeFromDatabaseError(r.error));
}
