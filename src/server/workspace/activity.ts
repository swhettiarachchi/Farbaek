import { describeActivity, withinHistory, type ActivityCategory, type ActivityEvent } from "@/core/workspace/activity";
import type { AppContext } from "./context";
import type { OrgRole } from "./types";

export interface ActivityRow extends ActivityEvent {
  actor: string;
  text: string;
  category: ActivityCategory | null;
  href: string | null;
}

const ROLE_WORDS: Record<OrgRole, string> = { owner: "An owner", admin: "An admin", member: "A member", viewer: "A viewer" };

/**
 * The workspace's activity (ADR 0119), each event with who did it in words:
 * "You", the address a teammate was invited at when this person can see it,
 * their role otherwise, "A former member" once they've left, and "Farbaek"
 * for what Farbaek did. Read through the person's own session.
 */
export async function loadActivity(
  ctx: AppContext,
  orgId: string,
  options: { category: ActivityCategory | null; before: number | null; limit: number; since?: Date | null },
): Promise<ActivityRow[]> {
  const [all, members, invitations] = await Promise.all([
    ctx.reader.listActivity(orgId, { category: options.category, before: options.before, limit: options.limit }),
    ctx.reader.listMembers(orgId).catch(() => []),
    // Only owners and admins can read invitations; everyone else sees roles.
    ctx.reader.listInvitations(orgId).catch(() => []),
  ]);
  // The plan's history (stage 176): events are newest first, so the window ends the list and its paging.
  const events = withinHistory(all, options.since ?? null);
  const emailOf = new Map(invitations.flatMap((i) => (i.acceptedBy ? [[i.acceptedBy, i.email] as const] : [])));
  const roleOf = new Map(members.map((m) => [m.userId, m.role] as const));
  const actorName = (id: string | null) => {
    if (id === null) return "Farbaek";
    if (id === ctx.user.id) return "You";
    const email = emailOf.get(id);
    if (email) return email;
    const role = roleOf.get(id);
    return role ? ROLE_WORDS[role] : "A former member";
  };
  return events.map((e) => {
    const actor = actorName(e.actorId);
    return { ...e, actor, ...describeActivity(e, actor) };
  });
}
