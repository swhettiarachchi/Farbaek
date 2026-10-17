/**
 * Invitations to a workspace. The link carries a random token; Farbaek keeps
 * only its SHA-256, so stored data can't be turned back into working links.
 * The rules here mirror the database's (migration 13), which enforces them
 * again: owners invite admins, members or viewers; admins invite members or
 * viewers; nobody is invited as owner.
 */
import { sha256Hex } from "../trust/canonical-json";

export const INVITATION_DAYS = 7;
export const INVITE_ROLES = ["admin", "member", "viewer"] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

export const INVITE_ROLE_LABELS: Record<InviteRole, { title: string; detail: string }> = {
  admin: { title: "Admin", detail: "Manages people, projects and approvals, like an owner except billing." },
  member: { title: "Member", detail: "Works on projects and tasks, and approves ordinary changes." },
  viewer: { title: "Viewer", detail: "Reads everything, changes nothing." },
};

/** The roles someone with `actor` may invite. */
export function invitableRoles(actor: string | null): InviteRole[] {
  if (actor === "owner") return ["admin", "member", "viewer"];
  if (actor === "admin") return ["member", "viewer"];
  return [];
}

/** Lower-cased and trimmed, or null when it isn't a plausible email address. */
export function normalizeInviteEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length < 3 || email.length > 254) return null;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}

/** 32 random bytes, base64url: the secret part of an invitation link. */
export function newInvitationToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A token as it can appear in a link: base64url, 43 characters. */
export function isInvitationToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function invitationTokenHash(token: string): Promise<string> {
  return sha256Hex(token);
}

export function invitationExpiry(now: Date): Date {
  return new Date(now.getTime() + INVITATION_DAYS * 86_400_000);
}
