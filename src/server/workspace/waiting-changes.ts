/**
 * The changes waiting in a workspace, as this person sees them (ADR 0174). Home's card and the Approvals badge read the same
 * thing, so one never promises what the other doesn't show.
 */
import { sortWaiting, type WaitingChanges, type WaitingTask } from "@/core/realityloop/needs-you";
import { may, type WithheldPermissions } from "@/core/workspace/permissions";
import { CONTRIBUTOR_ROLES, MANAGER_ROLES, type OrgRole, type Task, type WorkspaceReader } from "./types";

/** A workspace rarely has more than this waiting. Beyond it, the Approvals page says how many more. */
const MAX_WAITING_READ = 25;

export async function waitingChanges(
  reader: Pick<WorkspaceReader, "getLatestProposal">,
  input: {
    orgId: string;
    tasks: readonly Pick<Task, "id" | "title" | "state" | "projectId">[];
    archivedProjects: ReadonlySet<string>;
    role: OrgRole | null;
    permissions: WithheldPermissions;
    /** The demo is a tour of what people see, so it shows what someone who can act would. */
    tour?: boolean;
  },
  now: Date,
): Promise<WaitingChanges> {
  const open = await Promise.all(
    input.tasks
      .filter((t) => t.state === "APPROVAL_PENDING" && !input.archivedProjects.has(t.projectId))
      .slice(0, MAX_WAITING_READ)
      .map(async (t): Promise<WaitingTask> => {
        const proposal = await reader.getLatestProposal(input.orgId, t.id).catch(() => null);
        return { id: t.id, title: t.title, change: proposal ? { status: proposal.status, createdAt: proposal.createdAt, expiresAt: proposal.expiresAt, escalated: proposal.policy?.outcome === "ESCALATE" } : null };
      }),
  );
  const tour = input.tour === true;
  return sortWaiting(
    open,
    {
      canAct: tour || (input.role !== null && CONTRIBUTOR_ROLES.includes(input.role)),
      canApprove: tour || may(input.role, input.permissions, "approve"),
      canApproveEscalated: tour || (input.role !== null && MANAGER_ROLES.includes(input.role)),
    },
    now,
  );
}
