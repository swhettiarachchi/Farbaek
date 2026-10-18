/**
 * Invitations (migration 13). Owners and admins create a one-time link for an
 * email address and role; the link is shown once, since no email provider is
 * connected yet. The invited person signs in with that address and accepts.
 * Seats are counted from the workspace's plan here and again in the database,
 * with open invitations holding a seat.
 */
import { resolveEffectivePlan, type BillingSnapshot } from "@/core/billing/trial";
import {
  invitableRoles,
  invitationExpiry,
  invitationTokenHash,
  isInvitationToken,
  newInvitationToken,
  normalizeInviteEmail,
  type InviteRole,
} from "@/core/workspace/invitations";
import type { OrgRole } from "./types";
import { MESSAGES, codeFromDatabaseError, fail, type RpcResult, type WriteDeps, type WriteResult } from "./use-cases";

export interface InvitationPreview {
  orgId: string;
  orgName: string;
  role: OrgRole;
  email: string;
  expiresAt: string;
  state: "open" | "accepted" | "revoked" | "expired";
}

export interface InvitationDeps {
  createInvitation(input: { orgId: string; actor: string; email: string; role: InviteRole; tokenSha256: string; expiresAt: string; seatLimit: number | null }): Promise<RpcResult<string>>;
  revokeInvitation(input: { invitationId: string; actor: string }): Promise<RpcResult<null>>;
  /** Read as the system: the invited person isn't a member yet. */
  invitationPreview(tokenSha256: string): Promise<InvitationPreview | null>;
  /** The inviting workspace's billing, read as the system for the same reason. */
  orgBillingAsSystem(orgId: string): Promise<BillingSnapshot | null>;
  acceptInvitation(input: { tokenSha256: string; actor: string; seatLimit: number | null }): Promise<RpcResult<string>>;
}

const CLOSED: Record<Exclude<InvitationPreview["state"], "open">, string> = {
  accepted: "This invitation was already used. If it was yours, the workspace is in your list.",
  revoked: "This invitation was revoked. Ask the person who invited you for a new one.",
  expired: "This invitation has expired. Ask the person who invited you for a new one.",
};

function seatLimitFor(snapshot: BillingSnapshot | null, now: Date): { ok: true; seats: number | null } | { ok: false } {
  if (!snapshot) return { ok: false };
  return { ok: true, seats: resolveEffectivePlan(snapshot, now).limits.seats };
}

export async function createInvitation(
  deps: WriteDeps & InvitationDeps,
  input: { orgId: string; userId: string; email: unknown; role: unknown },
): Promise<WriteResult<{ token: string; email: string; role: InviteRole; expiresAt: string }>> {
  const actorRole = await deps.role(input.orgId);
  if (!actorRole) return fail("NOT_FOUND");
  const allowed = invitableRoles(actorRole);
  if (allowed.length === 0) return fail("FORBIDDEN", "Only owners and admins can invite people.");
  const role = allowed.find((r) => r === input.role);
  if (!role) return fail("FORBIDDEN", actorRole === "admin" ? "Admins can invite members and viewers. An owner can invite admins." : MESSAGES.FORBIDDEN);
  const email = normalizeInviteEmail(input.email);
  if (!email) return fail("INVALID_EMAIL");

  const seats = seatLimitFor(await deps.billing(input.orgId), deps.now());
  if (!seats.ok) return fail("ENTITLEMENT_UNAVAILABLE");

  const token = newInvitationToken();
  const expiresAt = invitationExpiry(deps.now()).toISOString();
  const created = await deps.createInvitation({ orgId: input.orgId, actor: input.userId, email, role, tokenSha256: await invitationTokenHash(token), expiresAt, seatLimit: seats.seats });
  if (!created.ok) return fail(codeFromDatabaseError(created.error));
  return { ok: true, value: { token, email, role, expiresAt } };
}

export async function revokeInvitation(deps: WriteDeps & InvitationDeps, input: { orgId: string; userId: string; invitationId: string }): Promise<WriteResult<null>> {
  const actorRole = await deps.role(input.orgId);
  if (!actorRole) return fail("NOT_FOUND");
  if (invitableRoles(actorRole).length === 0) return fail("FORBIDDEN", "Only owners and admins can revoke invitations.");
  const r = await deps.revokeInvitation({ invitationId: input.invitationId, actor: input.userId });
  if (!r.ok) return fail(codeFromDatabaseError(r.error));
  return r;
}

/** What the invitation page shows: null for a link that doesn't match any invitation. */
export async function previewInvitation(deps: Pick<InvitationDeps, "invitationPreview">, token: string): Promise<InvitationPreview | null> {
  if (!isInvitationToken(token)) return null;
  return deps.invitationPreview(await invitationTokenHash(token));
}

export async function acceptInvitation(deps: InvitationDeps & { now(): Date }, input: { userId: string; token: string }): Promise<WriteResult<{ orgId: string }>> {
  const preview = await previewInvitation(deps, input.token);
  if (!preview) return fail("NOT_FOUND", "This invitation link isn't valid. Check that you copied all of it.");
  if (preview.state !== "open") return fail("INVITATION_CLOSED", CLOSED[preview.state]);
  const seats = seatLimitFor(await deps.orgBillingAsSystem(preview.orgId), deps.now());
  if (!seats.ok) return fail("ENTITLEMENT_UNAVAILABLE");
  const r = await deps.acceptInvitation({ tokenSha256: await invitationTokenHash(input.token), actor: input.userId, seatLimit: seats.seats });
  if (!r.ok) {
    const code = codeFromDatabaseError(r.error);
    return fail(code, code === "SEAT_LIMIT" ? "Every seat in this workspace is taken. Ask the person who invited you to free one." : MESSAGES[code]);
  }
  return { ok: true, value: { orgId: r.value } };
}
