/**
 * Who on Farbaek's staff may do what in Office Space (ADR 0032). Five fixed
 * roles with conditions, deny by default. The database repeats this matrix
 * in private.staff_can and refuses anything outside it; this copy decides
 * what the console shows and is the first check in every action.
 */

export const STAFF_ROLES = ["owner", "admin", "support", "trust_safety", "viewer"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const ROLE_LABELS: Record<StaffRole, string> = {
  owner: "Owner",
  admin: "Admin",
  support: "Support",
  trust_safety: "Trust and safety",
  viewer: "Viewer",
};

export const ROLE_SUMMARIES: Record<StaffRole, string> = {
  owner: "Everything, including staff, kill switches and large usage additions. Severe actions need a fresh authenticator code.",
  admin: "Reads everything, suspends workspaces, takes sites offline, adds AI usage up to a cap, runs announcements and replays payment events.",
  support: "Reads workspaces and people, answers support requests, and can extend a trial once.",
  trust_safety: "Reads everything and handles abuse: answers reports, suspends workspaces and takes sites offline.",
  viewer: "Reads the console and the audit log, not support requests. Email addresses are masked.",
};

export const OFFICE_ACTIONS = [
  "console.read",
  "people.read_email",
  "audit.read_all",
  "audit.verify",
  "staff.read",
  "staff.manage",
  "workspace.suspend",
  "site.block",
  "usage.add",
  "trial.extend",
  "flags.set",
  "announcements.manage",
  "support.read",
  "support.reply",
  "devices.own",
  "models.canary",
  "models.switch",
  "billing.products",
  "billing.replay",
  "billing.go_live",
] as const;
export type OfficeAction = (typeof OFFICE_ACTIONS)[number];

const ALL: readonly StaffRole[] = STAFF_ROLES;

/** The matrix. Anything not listed is refused. */
export const PERMISSIONS: Record<OfficeAction, readonly StaffRole[]> = {
  "console.read": ALL,
  "people.read_email": ["owner", "admin", "support", "trust_safety"],
  "audit.read_all": ["owner", "admin", "viewer"],
  "audit.verify": ["owner", "admin"],
  "staff.read": ALL,
  "staff.manage": ["owner"],
  "workspace.suspend": ["owner", "admin", "trust_safety"],
  "site.block": ["owner", "admin", "trust_safety"],
  "usage.add": ["owner", "admin"],
  "trial.extend": ["owner", "admin", "support"],
  "flags.set": ["owner"],
  "announcements.manage": ["owner", "admin"],
  "support.read": ["owner", "admin", "support", "trust_safety"],
  "support.reply": ["owner", "admin", "support", "trust_safety"],
  // Approving and removing your own Office Space devices (ADR 0069).
  "devices.own": ALL,
  // The Model Change Canary (ADR 0090): a canary spends Farbaek's AI credit; switching a tier changes every workspace's model.
  "models.canary": ["owner", "admin"],
  "models.switch": ["owner"],
  // Payments (ADR 0100): creating provider products sets what checkout charges; a replay re-reads a subscription from the provider.
  "billing.products": ["owner"],
  "billing.replay": ["owner", "admin"],
  // Turning live payments on or off (ADR 0104): owners, with a fresh authenticator code.
  "billing.go_live": ["owner"],
};

/** Actions that need a fresh authenticator code in the same request, whatever the input. */
const ALWAYS_STEP_UP: ReadonlySet<OfficeAction> = new Set(["staff.manage", "flags.set", "models.switch", "billing.go_live"]);

/** AI usage additions above this many units need a fresh authenticator code too. */
export const USAGE_STEP_UP_UNITS = 1_000_000;

/** The most AI usage each role may add in one go, in units (1 unit = $0.0001 of list cost). */
export const USAGE_CAPS: Partial<Record<StaffRole, number>> = { owner: 5_000_000, admin: 500_000 };

/** The most trial days each role may add at once (migration v22). Support may extend a trial only once; no trial runs past 44 days. */
export const TRIAL_EXTEND_CAPS: Partial<Record<StaffRole, number>> = { owner: 30, admin: 14, support: 7 };

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && (STAFF_ROLES as readonly string[]).includes(value);
}

export function can(role: StaffRole | null | undefined, action: OfficeAction): boolean {
  if (!role || !isStaffRole(role)) return false;
  return PERMISSIONS[action]?.includes(role) ?? false;
}

export function needsStepUp(action: OfficeAction, input: { units?: number } = {}): boolean {
  if (ALWAYS_STEP_UP.has(action)) return true;
  return action === "usage.add" && (input.units ?? 0) > USAGE_STEP_UP_UNITS;
}

export function usageCap(role: StaffRole): number {
  return USAGE_CAPS[role] ?? 0;
}

/** "jo•••@example.com": enough to recognise, not enough to copy. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "•••";
  const local = email.slice(0, at);
  return `${local.slice(0, Math.min(2, local.length))}•••${email.slice(at)}`;
}

/** The roles the person with `actor` may hand out. Only owners manage staff, and nobody changes their own role. */
export function assignableRoles(actor: StaffRole): readonly StaffRole[] {
  return actor === "owner" ? STAFF_ROLES : [];
}
