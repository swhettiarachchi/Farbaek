/**
 * Permissions per person (ADR 0087). Owners and admins can turn three
 * permissions off for a member. Every permission is on by default; owners
 * and admins always have all three, and viewers have none. The rules here
 * mirror the database's (migration v55), which enforces them again through
 * the rows that record who acted.
 */

export const PERMISSIONS = ["approve", "publish", "run_agents"] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Only withheld permissions are stored: { approve: false }. */
export type WithheldPermissions = Partial<Record<Permission, false>>;

export const PERMISSION_LABELS: Record<Permission, { title: string; detail: string }> = {
  approve: { title: "Approve changes", detail: "Apply changes that need a person's approval, their own or anyone's." },
  publish: { title: "Publish and launch", detail: "Publish sites, roll them back or take them offline, launch to a connected host, and open pull requests on GitHub." },
  run_agents: { title: "Start agent runs", detail: "Let the agent build a task, or compare candidates in the Arena. Runs use the workspace's AI allowance." },
};

const WITHHELD_WORDS: Record<Permission, string> = {
  approve: "approving changes",
  publish: "publishing and launching",
  run_agents: "starting agent runs",
};

const CANT: Record<Permission, string> = {
  approve: "Can't approve changes.",
  publish: "Can't publish or launch.",
  run_agents: "Can't start agent runs.",
};

/** The stored value, keeping only known permissions that are turned off. */
export function parsePermissions(raw: unknown): WithheldPermissions {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: WithheldPermissions = {};
  for (const p of PERMISSIONS) if ((raw as Record<string, unknown>)[p] === false) out[p] = false;
  return out;
}

/** Whether someone with `role` and these stored permissions may do `permission`. */
export function may(role: string | null, permissions: WithheldPermissions, permission: Permission): boolean {
  if (role === "owner" || role === "admin") return true;
  if (role === "member") return permissions[permission] !== false;
  return false;
}

/** The permissions a member has turned off, in a fixed order. */
export function withheldList(permissions: WithheldPermissions): Permission[] {
  return PERMISSIONS.filter((p) => permissions[p] === false);
}

/** Why the control is unavailable, for the person it's withheld from. */
export function withheldReason(permission: Permission): string {
  return `An owner or admin turned off ${WITHHELD_WORDS[permission]} for you in this workspace.`;
}

/** Why a member's control is off, or null. Viewers' and other roles' limits are explained by their own reasons. */
export function withheldFor(role: string | null, permissions: WithheldPermissions, permission: Permission): string | null {
  return role === "member" && permissions[permission] === false ? withheldReason(permission) : null;
}

/** What a role allows, in words, for the People list. */
export function roleAllows(role: string): string {
  if (role === "owner" || role === "admin") return "Approves changes, publishes and launches, and starts agent runs.";
  if (role === "viewer") return "Reads everything, changes nothing.";
  return "";
}

/** "Can't approve changes. Can't start agent runs.", or null when nothing is withheld. */
export function withheldSummary(permissions: WithheldPermissions): string | null {
  const off = withheldList(permissions);
  return off.length ? off.map((p) => CANT[p]).join(" ") : null;
}
