/**
 * The workspace's activity log (ADR 0119, spec §9 "history" and §12 Activity):
 * each audit event the database records, as one plain sentence, a category
 * and, where there's a page for it, a link. The events themselves come from
 * the audit log, which every member can read under row security; nothing
 * here decides who sees what.
 */

export const ACTIVITY_CATEGORIES = [
  { id: "people", label: "People" },
  { id: "projects", label: "Projects and files" },
  { id: "changes", label: "Tasks and changes" },
  { id: "agents", label: "Agents" },
  { id: "sites", label: "Sites" },
  { id: "trust", label: "Policies and checks" },
  { id: "billing", label: "Billing and usage" },
  { id: "farbaek", label: "Farbaek" },
] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number]["id"];

/** The action prefixes each category covers; the database filters on them. */
export const CATEGORY_PREFIXES: Record<ActivityCategory, string[]> = {
  people: ["organization.", "member.", "invitation.", "workspace."],
  projects: ["project.", "capsule.", "skill.", "preview.", "sandbox."],
  changes: ["task.", "contract.", "proposal.", "workflow.", "change.", "verification.", "proofpack.", "arena.", "watch."],
  agents: ["agent.", "agents.", "mesh."],
  sites: ["site.", "launch.", "provider."],
  trust: ["policy.", "autonomy.", "security."],
  billing: ["billing.", "usage.", "trial."],
  farbaek: ["farbaek."],
};

export interface ActivityEvent {
  id: number;
  action: string;
  target: string | null;
  metadata: Record<string, unknown>;
  /** The person who acted; null when Farbaek did. */
  actorId: string | null;
  occurredAt: string;
}

export function categoryOf(action: string): ActivityCategory | null {
  for (const c of ACTIVITY_CATEGORIES) if (CATEGORY_PREFIXES[c.id].some((p) => action.startsWith(p))) return c.id;
  return null;
}

/** What happened, as the end of "<who> ...". */
const VERBS: Record<string, string> = {
  "organization.created": "created the workspace",
  "member.role_changed": "changed a member's role",
  "member.permissions_changed": "changed a member's permissions",
  "member.removed": "removed a member",
  "member.left": "left the workspace",
  "member.account_deleted": "deleted their Farbaek account",
  "invitation.created": "invited someone",
  "invitation.accepted": "joined through an invitation",
  "invitation.revoked": "withdrew an invitation",
  "workspace.suspended": "paused the workspace",
  "workspace.restored": "restored the workspace",
  "workspace.model_key_set": "set the workspace's own AI key",
  "workspace.model_key_removed": "removed the workspace's own AI key",
  "workspace.github_connected": "connected GitHub",
  "workspace.github_disconnected": "disconnected GitHub",
  "project.created": "created a project",
  "project.archived": "archived a project",
  "project.files_imported": "imported files into a project",
  "project.file_deleted": "deleted a file",
  "project.github_linked": "linked a project to a GitHub repository",
  "project.github_unlinked": "unlinked a project from its GitHub repository",
  "capsule.exported": "exported a project capsule",
  "capsule.imported": "imported a project capsule",
  "skill.pinned": "approved a project skill",
  "skill.unpinned": "withdrew approval of a project skill",
  "preview.opened": "opened a preview",
  "sandbox.session_requested": "started a sandbox session",
  "task.created": "created a task",
  "task.transition": "moved a task to its next step",
  "task.fix_started": "started a fix",
  "task.pull_request_opened": "opened a pull request on GitHub",
  "task.mode_changed": "changed a task's mode",
  "agent.tools_pinned": "pinned an agent's tools at first use",
  "agent.tools_quarantined": "paused an agent whose tools changed",
  "agent.tools_approved": "approved an agent's changed tools",
  "task.note_written": "had the AI write a note on a task",
  "contract.saved": "saved a task's intent contract",
  "contract.approved": "approved a task's intent contract",
  "proposal.created": "proposed a change",
  "proposal.applied": "applied a change",
  "proposal.discarded": "discarded a change",
  "proposal.lens_suggested": "suggested a review lens",
  "proposal.second_checked": "asked a second model to check a change",
  "change.recovered": "undid an applied change",
  "verification.started": "started verification",
  "verification.finished": "finished verification",
  "proofpack.verification_recorded": "recorded a ProofPack verification",
  "workflow.created": "created a workflow",
  "workflow.approved": "approved a workflow",
  "workflow.continued": "continued a workflow",
  "workflow.step_started": "started a workflow step",
  "workflow.finished": "finished a workflow",
  "workflow.cancelled": "cancelled a workflow",
  "arena.started": "started an Arena comparison",
  "arena.finished": "finished an Arena comparison",
  "failure_future.started": "started a failure trial",
  "failure_future.finished": "finished a failure trial",
  "mutation.started": "started a mutation trial",
  "mutation.finished": "finished a mutation trial",
  "watch.on": "turned on outcome watching",
  "watch.off": "turned off outcome watching",
  "agent.pairing_created": "created an agent pairing code",
  "agent.paired": "paired an agent",
  "agent.revoked": "revoked an agent",
  "agent.lease_set": "changed an agent's lease",
  "agent.proposal_submitted": "submitted a change through an agent",
  "agent.run_started": "started an agent run",
  "agent.run_proposal_submitted": "submitted a change through an agent run",
  "agents.paused": "paused agents",
  "agents.resumed": "resumed agents",
  "mesh.relay_reachable": "made a device reachable through Farbaek",
  "mesh.relay_unreachable": "stopped a device being reachable through Farbaek",
  "mesh.relay_session": "started a Mesh transfer through Farbaek",
  "site.published": "published a site",
  "site.unpublished": "took a site offline",
  "site.rolled_back": "rolled a site back",
  "site.domain_added": "added a domain",
  "site.domain_removed": "removed a domain",
  "site.domain_verified": "verified a domain",
  "site.domain_unverified": "saw a domain stop verifying",
  "site.blocked": "blocked a site",
  "site.unblocked": "unblocked a site",
  "launch.authorized": "authorized a launch",
  "provider.connected": "connected a provider",
  "provider.disconnected": "disconnected a provider",
  "policy.rules_activated": "activated new workspace rules",
  "autonomy.changed": "changed autonomy limits",
  "autonomy.suspended": "suspended autonomy",
  "security.check_started": "started security checks",
  "security.check_finished": "finished security checks",
  "billing.checkout_started": "started a checkout",
  "billing.subscription_changed": "changed the plan",
  "billing.test_plan_ended": "ended a test plan",
  "billing.topup_started": "started buying more AI usage",
  "billing.topup_paid": "bought more AI usage",
  "billing.topup_cap_set": "set a monthly limit for buying AI usage",
  "usage.added": "added AI usage",
  "usage.free_retry": "gave back usage for a failed attempt",
  "trial.extended": "extended the trial",
  "farbaek.workspace_suspended": "paused this workspace",
  "farbaek.workspace_restored": "restored this workspace",
  "farbaek.site_blocked": "took a site offline",
  "farbaek.site_unblocked": "let a site go live again",
  "farbaek.trial_extended": "extended the trial",
  "farbaek.usage_added": "added AI usage",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The page an event points at, when there's one and its target is an id. */
export function activityHref(event: Pick<ActivityEvent, "action" | "target">): string | null {
  if (!event.target || !UUID.test(event.target)) return null;
  if (event.action.startsWith("task.") || event.action.startsWith("contract.")) return `/app/tasks/${event.target}`;
  if (event.action.startsWith("project.")) return `/app/projects/${event.target}`;
  if (event.action.startsWith("workflow.")) return `/app/workflows/${event.target}`;
  return null;
}

/** A short, safe name from the event's details, when it records one. */
function detailName(metadata: Record<string, unknown>): string | null {
  for (const key of ["name", "title", "project_name", "domain", "path", "repository"]) {
    const v = metadata[key];
    if (typeof v === "string" && v.trim()) return v.trim().replace(/\s+/g, " ").slice(0, 80);
  }
  return null;
}

/**
 * The event as a sentence. `actor` is already in words ("You", "A teammate",
 * "Farbaek"). An action this list doesn't know is still shown, by its name.
 */
export function describeActivity(event: ActivityEvent, actor: string): { category: ActivityCategory | null; text: string; href: string | null } {
  const verb = VERBS[event.action];
  const name = detailName(event.metadata);
  const text = verb ? `${actor} ${verb}${name ? `: ${name}` : ""}.` : `${actor} recorded ${event.action}${name ? `: ${name}` : ""}.`;
  return { category: categoryOf(event.action), text, href: activityHref(event) };
}

/** One spreadsheet cell, quoted, and kept from being read as a formula. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function activityCsv(rows: { occurredAt: string; actor: string; action: string; target: string | null; text: string; metadata: Record<string, unknown> }[]): string {
  const head = ["occurred_at", "actor", "action", "target", "description", "details"].map(csvCell).join(",");
  return [head, ...rows.map((r) => [r.occurredAt, r.actor, r.action, r.target ?? "", r.text, JSON.stringify(r.metadata)].map(csvCell).join(","))].join("\r\n") + "\r\n";
}
