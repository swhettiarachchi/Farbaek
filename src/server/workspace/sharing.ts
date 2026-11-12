/**
 * Sharing one project (ADR 0188, migration v91): guests and read-only links.
 *
 * - A guest is invited to one project by email and never joins the
 *   workspace. "view" reads it; "edit" also changes its files and adds
 *   tasks. Everything else (AI, test spaces, approving, publishing) stays
 *   with members, in the database as well as here.
 * - A read-only link shows a project's current files to anyone who has it,
 *   until it expires or someone turns it off. Credentials files and content
 *   that looks like a key are never shown.
 *
 * Tokens are 32 random bytes; Farbaek keeps only their SHA-256, like
 * workspace invitations (ADR 0017).
 */
import { resolveEffectivePlan, type BillingSnapshot } from "@/core/billing/trial";
import { invitationExpiry, invitationTokenHash, isInvitationToken, newInvitationToken, normalizeInviteEmail } from "@/core/workspace/invitations";
import { type GuestAccess, type LinkLifetime, type LinkState, isGuestAccess, isLinkLifetime, linkExpiry } from "@/core/workspace/sharing";
import { MESSAGES, codeFromDatabaseError, fail, type RpcResult, type WriteResult } from "./use-cases";

export interface ProjectInvitationPreview {
  orgId: string;
  orgName: string;
  projectId: string;
  projectName: string;
  access: GuestAccess;
  email: string;
  expiresAt: string;
  state: "open" | "accepted" | "revoked" | "expired";
}

export interface ProjectSharing {
  canShare: boolean;
  guests: { userId: string; email: string; access: GuestAccess; since: string }[];
  invitations: { id: string; email: string; access: GuestAccess; expiresAt: string }[];
  links: { id: string; createdAt: string; expiresAt: string | null; allowDownload: boolean; lastOpenedAt: string | null }[];
}

export interface SharedProject {
  projectId: string;
  projectName: string;
  projectDescription: string | null;
  orgId: string;
  orgName: string;
  access: GuestAccess;
  since: string;
  archived: boolean;
  suspended: boolean;
}

export interface ShareView {
  state: "live";
  project: { id: string; name: string; description: string | null };
  allowDownload: boolean;
  expiresAt: string | null;
  files: { path: string; sizeBytes: number; encoding: "utf8" | "base64"; updatedAt: string }[];
  site: { name: string } | null;
  verified: boolean;
}

export type ShareLookup = ShareView | { state: Exclude<LinkState, "live"> };

export interface SharingDeps {
  now(): Date;
  /** The workspace's billing, read as the system: a guest or an invited person isn't a member. */
  orgBillingAsSystem(orgId: string): Promise<BillingSnapshot | null>;
  /** The project's workspace, read as the system. */
  projectOrg(projectId: string): Promise<string | null>;
  createInvitation(input: { projectId: string; actor: string; email: string; access: GuestAccess; tokenSha256: string; expiresAt: string; seatLimit: number | null }): Promise<RpcResult<string>>;
  revokeInvitation(input: { invitationId: string; actor: string }): Promise<RpcResult<null>>;
  invitationPreview(tokenSha256: string): Promise<ProjectInvitationPreview | null>;
  acceptInvitation(input: { tokenSha256: string; actor: string; seatLimit: number | null }): Promise<RpcResult<string>>;
  setGuestAccess(input: { projectId: string; actor: string; userId: string; access: GuestAccess; seatLimit: number | null }): Promise<RpcResult<null>>;
  removeGuest(input: { projectId: string; actor: string; userId: string }): Promise<RpcResult<null>>;
  sharing(input: { projectId: string; actor: string }): Promise<RpcResult<ProjectSharing>>;
  sharedWithMe(userId: string): Promise<SharedProject[]>;
  createLink(input: { projectId: string; actor: string; tokenSha256: string; expiresAt: string | null; allowDownload: boolean }): Promise<RpcResult<string>>;
  revokeLink(input: { linkId: string; actor: string }): Promise<RpcResult<null>>;
  shareView(tokenSha256: string): Promise<ShareLookup>;
  shareFile(tokenSha256: string, path: string): Promise<{ path: string; content: string; encoding: "utf8" | "base64"; sizeBytes: number } | null>;
  /** Every current file of a live link that allows downloads, in one read; null when it can't be read. */
  shareFiles(tokenSha256: string): Promise<{ path: string; content: string; encoding: "utf8" | "base64"; sizeBytes: number }[] | null>;
}

const CLOSED: Record<Exclude<ProjectInvitationPreview["state"], "open">, string> = {
  accepted: "This invitation was already used. If it was yours, the project is under Shared with you.",
  revoked: "This invitation was revoked. Ask the person who invited you for a new one.",
  expired: "This invitation has expired. Ask the person who invited you for a new one.",
};

async function seatLimit(deps: SharingDeps, orgId: string): Promise<{ ok: true; seats: number | null } | { ok: false }> {
  const snapshot = await deps.orgBillingAsSystem(orgId);
  if (!snapshot) return { ok: false };
  return { ok: true, seats: resolveEffectivePlan(snapshot, deps.now()).limits.seats };
}

const done = <T>(r: RpcResult<T>): WriteResult<T> => (r.ok ? r : fail(codeFromDatabaseError(r.error)));

export async function inviteGuest(
  deps: SharingDeps,
  input: { userId: string; projectId: string; email: unknown; access: unknown },
): Promise<WriteResult<{ token: string; email: string; access: GuestAccess; expiresAt: string }>> {
  const email = normalizeInviteEmail(input.email);
  if (!email) return fail("INVALID_EMAIL");
  if (!isGuestAccess(input.access)) return fail("INVALID_INVITATION", "Choose Can view or Can edit.");
  const orgId = await deps.projectOrg(input.projectId);
  if (!orgId) return fail("NOT_FOUND");
  const seats = await seatLimit(deps, orgId);
  if (!seats.ok) return fail("ENTITLEMENT_UNAVAILABLE");

  const token = newInvitationToken();
  const expiresAt = invitationExpiry(deps.now()).toISOString();
  const created = await deps.createInvitation({ projectId: input.projectId, actor: input.userId, email, access: input.access, tokenSha256: await invitationTokenHash(token), expiresAt, seatLimit: seats.seats });
  if (!created.ok) {
    const code = codeFromDatabaseError(created.error);
    if (code === "ALREADY_MEMBER") return fail(code, "That person is already in your workspace, so they can already open this project.");
    if (code === "SEAT_LIMIT") return fail(code, "Every seat on this plan is taken, and an editor uses one. Invite them to view instead, or free a seat.");
    if (code === "FORBIDDEN") return fail(code, "Only owners, admins and members who may publish can share a project.");
    return fail(code);
  }
  return { ok: true, value: { token, email, access: input.access, expiresAt } };
}

export async function revokeGuestInvitation(deps: SharingDeps, input: { userId: string; invitationId: string }): Promise<WriteResult<null>> {
  return done(await deps.revokeInvitation({ invitationId: input.invitationId, actor: input.userId }));
}

/** What the invitation page shows: null for a link that doesn't match a project invitation. */
export async function previewGuestInvitation(deps: Pick<SharingDeps, "invitationPreview">, token: string): Promise<ProjectInvitationPreview | null> {
  if (!isInvitationToken(token)) return null;
  return deps.invitationPreview(await invitationTokenHash(token));
}

export async function acceptGuestInvitation(deps: SharingDeps, input: { userId: string; token: string }): Promise<WriteResult<{ projectId: string }>> {
  const preview = await previewGuestInvitation(deps, input.token);
  if (!preview) return fail("NOT_FOUND", "This invitation link isn't valid. Check that you copied all of it.");
  if (preview.state !== "open") return fail("INVITATION_CLOSED", CLOSED[preview.state]);
  const seats = await seatLimit(deps, preview.orgId);
  if (!seats.ok) return fail("ENTITLEMENT_UNAVAILABLE");
  const r = await deps.acceptInvitation({ tokenSha256: await invitationTokenHash(input.token), actor: input.userId, seatLimit: seats.seats });
  if (!r.ok) {
    const code = codeFromDatabaseError(r.error);
    if (code === "ALREADY_MEMBER") return fail(code, "You're already in this workspace, so you can open the project there.");
    if (code === "SEAT_LIMIT") return fail(code, "Every seat in this workspace is taken. Ask the person who invited you to free one, or to invite you to view.");
    return fail(code, MESSAGES[code]);
  }
  return { ok: true, value: { projectId: r.value } };
}

export async function changeGuestAccess(deps: SharingDeps, input: { userId: string; projectId: string; guestId: string; access: unknown }): Promise<WriteResult<null>> {
  if (!isGuestAccess(input.access)) return fail("INVALID_INVITATION", "Choose Can view or Can edit.");
  const orgId = await deps.projectOrg(input.projectId);
  if (!orgId) return fail("NOT_FOUND");
  const seats = await seatLimit(deps, orgId);
  if (!seats.ok) return fail("ENTITLEMENT_UNAVAILABLE");
  return done(await deps.setGuestAccess({ projectId: input.projectId, actor: input.userId, userId: input.guestId, access: input.access, seatLimit: seats.seats }));
}

export async function removeGuest(deps: SharingDeps, input: { userId: string; projectId: string; guestId: string }): Promise<WriteResult<null>> {
  return done(await deps.removeGuest({ projectId: input.projectId, actor: input.userId, userId: input.guestId }));
}

export async function leaveSharedProject(deps: SharingDeps, input: { userId: string; projectId: string }): Promise<WriteResult<null>> {
  return done(await deps.removeGuest({ projectId: input.projectId, actor: input.userId, userId: input.userId }));
}

export async function createShareLink(
  deps: SharingDeps,
  input: { userId: string; projectId: string; lifetime: unknown; allowDownload: boolean },
): Promise<WriteResult<{ token: string; expiresAt: string | null }>> {
  if (!isLinkLifetime(input.lifetime)) return fail("INVALID_LINK");
  const token = newInvitationToken();
  const expiresAt = linkExpiry(input.lifetime as LinkLifetime, deps.now())?.toISOString() ?? null;
  const r = await deps.createLink({ projectId: input.projectId, actor: input.userId, tokenSha256: await invitationTokenHash(token), expiresAt, allowDownload: input.allowDownload });
  if (!r.ok) {
    const code = codeFromDatabaseError(r.error);
    if (code === "FORBIDDEN") return fail(code, "Only owners, admins and members who may publish can share a project.");
    return fail(code);
  }
  return { ok: true, value: { token, expiresAt } };
}

export async function revokeShareLink(deps: SharingDeps, input: { userId: string; linkId: string }): Promise<WriteResult<null>> {
  return done(await deps.revokeLink({ linkId: input.linkId, actor: input.userId }));
}

/** A link as someone opening it sees it. A token in the wrong shape is "none", without a database call. */
export async function openShareLink(deps: Pick<SharingDeps, "shareView">, token: string): Promise<ShareLookup> {
  if (!isInvitationToken(token)) return { state: "none" };
  return deps.shareView(await invitationTokenHash(token));
}

export async function openSharedFile(deps: Pick<SharingDeps, "shareFile">, token: string, path: string) {
  if (!isInvitationToken(token) || typeof path !== "string" || path.length === 0 || path.length > 300) return null;
  return deps.shareFile(await invitationTokenHash(token), path);
}

export async function openSharedFiles(deps: Pick<SharingDeps, "shareFiles">, token: string) {
  if (!isInvitationToken(token)) return null;
  return deps.shareFiles(await invitationTokenHash(token));
}
