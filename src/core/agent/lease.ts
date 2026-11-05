/**
 * Permission leases for paired agents (ADR 0117, spec §9). A lease says what
 * a Farbaek Agent may do, on which projects, how many times an hour and until
 * when. The server checks it on every agent request; the database refuses a
 * lease outside these limits too (migration v74). These are the shared rules
 * the web app, the server and the desktop app read a lease with.
 */

export const AGENT_CAPABILITIES = ["read", "propose", "model", "mesh"] as const;
export type AgentCapability = (typeof AGENT_CAPABILITIES)[number];

export interface AgentLease {
  expiresAt: string;
  /** Null: every project in the workspace. */
  projects: string[] | null;
  capabilities: AgentCapability[];
  actionsPerHour: number;
}

export const LEASE_LIMITS = { maxDays: 90, minActionsPerHour: 10, maxActionsPerHour: 5_000, maxProjects: 100, defaultActionsPerHour: 600 } as const;

/** The lengths offered on the Agents page. */
export const LEASE_DAY_CHOICES = [7, 30, 90] as const;

/** A lease this close to its end shows a notice on the Agents page. */
export const LEASE_WARNING_DAYS = 14;

export const CAPABILITY_LABELS: Record<AgentCapability, { title: string; detail: string }> = {
  read: { title: "Read tasks and files", detail: "See the tasks ready for work, their approved plans and the project's files." },
  propose: { title: "Suggest changes", detail: "Send a change for a person to review. A suggested change never applies itself." },
  model: { title: "Use Farbaek's AI", detail: "Model steps through Farbaek, counted against this workspace's AI usage." },
  mesh: { title: "Mesh transfers", detail: "Send files between your own devices through Farbaek's relay." },
};

export const LEASE_HELP = "An owner, an admin or the person who paired it can change its access on the Desktop app page.";

/**
 * What an agent request needs from the lease: one capability; "none" for the
 * agent's own profile, which still needs a lease that hasn't ended; or
 * "unpair", which always works so an agent can always be let go.
 */
export type LeaseNeed = AgentCapability | "none" | "unpair";

const CAPABILITY_WORDS: Record<AgentCapability, string> = {
  read: "reading tasks and files",
  propose: "suggesting changes",
  model: "using Farbaek's AI",
  mesh: "Mesh transfers",
};

/** Why the lease refuses a request, or null when it allows it. The server answers 403 with this. */
export function leaseRefusal(lease: Pick<AgentLease, "expiresAt" | "capabilities">, need: LeaseNeed, now: Date): { code: "LEASE_EXPIRED" | "OUTSIDE_LEASE"; message: string } | null {
  if (need === "unpair") return null;
  const ends = new Date(lease.expiresAt);
  // An unreadable end date is treated as ended: fail closed.
  if (!(ends.getTime() > now.getTime())) {
    const when = Number.isNaN(ends.getTime()) ? "" : ` on ${ends.toISOString().slice(0, 10)}`;
    return { code: "LEASE_EXPIRED", message: `This agent's access ended${when}. ${LEASE_HELP}` };
  }
  if (need !== "none" && !lease.capabilities.includes(need)) return { code: "OUTSIDE_LEASE", message: `This agent's access doesn't allow ${CAPABILITY_WORDS[need]}. ${LEASE_HELP}` };
  return null;
}

/** Mesh's relay sends many small requests by design, and unpairing must always work, so neither counts against the hourly limit. */
export function countsAgainstLease(need: LeaseNeed): boolean {
  return need !== "mesh" && need !== "unpair";
}

/** Each capability as the end of "May ...". */
const CAPABILITY_PHRASES: Record<AgentCapability, string> = {
  read: "read tasks and files",
  propose: "suggest changes",
  model: "use Farbaek's AI",
  mesh: "send Mesh transfers",
};

export type LeaseState = "active" | "ending_soon" | "ended";

const DAY_MS = 86_400_000;

/** Whole days left, rounded up; 0 once the lease has ended. */
export function leaseDaysLeft(lease: Pick<AgentLease, "expiresAt">, now: Date): number {
  const left = Date.parse(lease.expiresAt) - now.getTime();
  return Number.isFinite(left) && left > 0 ? Math.ceil(left / DAY_MS) : 0;
}

export function leaseState(lease: Pick<AgentLease, "expiresAt">, now: Date): LeaseState {
  const days = leaseDaysLeft(lease, now);
  return days === 0 ? "ended" : days <= LEASE_WARNING_DAYS ? "ending_soon" : "active";
}

/** One sentence for what the lease allows, in the order the capabilities are listed. */
export function leaseSummary(lease: Pick<AgentLease, "projects" | "capabilities" | "actionsPerHour">): string {
  const can = AGENT_CAPABILITIES.filter((c) => lease.capabilities.includes(c)).map((c) => CAPABILITY_PHRASES[c]);
  const where = lease.projects === null ? "every project" : lease.projects.length === 1 ? "1 project" : `${lease.projects.length} projects`;
  return `May ${joinWords(can)}, on ${where}, up to ${lease.actionsPerHour.toLocaleString("en-US")} requests an hour.`;
}

function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

export interface LeaseInput {
  days: number;
  projects: string[] | null;
  capabilities: AgentCapability[];
  actionsPerHour: number;
}

/** Checks a lease someone set on the Agents page; the database checks it again. */
export function checkLeaseInput(input: { days: unknown; projects: unknown; capabilities: unknown; actionsPerHour: unknown }): { ok: true; value: LeaseInput } | { ok: false; message: string } {
  const days = Number(input.days);
  if (!Number.isInteger(days) || days < 1 || days > LEASE_LIMITS.maxDays) return { ok: false, message: `Access lasts 1 to ${LEASE_LIMITS.maxDays} days.` };
  const actionsPerHour = Number(input.actionsPerHour);
  if (!Number.isInteger(actionsPerHour) || actionsPerHour < LEASE_LIMITS.minActionsPerHour || actionsPerHour > LEASE_LIMITS.maxActionsPerHour) {
    return { ok: false, message: `Choose ${LEASE_LIMITS.minActionsPerHour} to ${LEASE_LIMITS.maxActionsPerHour.toLocaleString("en-US")} requests an hour.` };
  }
  const caps = Array.isArray(input.capabilities) ? input.capabilities : [];
  if (!caps.every((c): c is AgentCapability => (AGENT_CAPABILITIES as readonly unknown[]).includes(c))) return { ok: false, message: "That isn't something an agent can be allowed to do." };
  const capabilities = AGENT_CAPABILITIES.filter((c) => caps.includes(c));
  if (capabilities.length === 0) return { ok: false, message: "Allow the agent at least one thing, or revoke it instead." };
  let projects: string[] | null = null;
  if (input.projects !== null) {
    if (!Array.isArray(input.projects) || !input.projects.every((p) => typeof p === "string" && /^[0-9a-f-]{36}$/i.test(p))) return { ok: false, message: "Choose projects from this workspace." };
    projects = [...new Set(input.projects as string[])];
    if (projects.length === 0) return { ok: false, message: "Choose at least one project, or every project." };
    if (projects.length > LEASE_LIMITS.maxProjects) return { ok: false, message: `Choose at most ${LEASE_LIMITS.maxProjects} projects, or every project.` };
  }
  return { ok: true, value: { days, projects, capabilities, actionsPerHour } };
}
