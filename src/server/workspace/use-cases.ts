/**
 * Write use cases. Each one authenticates nothing itself (the caller passes
 * the signed-in user's id), checks role and entitlements with the shared
 * TypeScript rules, then asks the database to apply the change atomically.
 * Supabase details live behind WriteDeps so this logic is unit-tested.
 */
import { checkQuota } from "@/core/billing/entitlements";
import { resolveEffectivePlan, type BillingSnapshot } from "@/core/billing/trial";
import { transition, type TaskSnapshot, type TaskState } from "@/core/realityloop/task-machine";
import { CONTRIBUTOR_ROLES, type OrgRole } from "./types";

export type WriteErrorCode =
  | "FORBIDDEN"
  | "INVALID_NAME"
  | "INVALID_TITLE"
  | "DUPLICATE_NAME"
  | "NOT_FOUND"
  | "QUOTA_EXCEEDED"
  | "FEATURE_NOT_IN_PLAN"
  | "TRIAL_CAP_REACHED"
  | "BILLING_SUSPENDED"
  | "ENTITLEMENT_UNAVAILABLE"
  | "VERSION_CONFLICT"
  | "INVALID_TRANSITION"
  | "UNKNOWN";

export type WriteResult<T> = { ok: true; value: T } | { ok: false; code: WriteErrorCode; message: string };

export type RpcResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface WriteDeps {
  role(orgId: string): Promise<OrgRole | null>;
  billing(orgId: string): Promise<BillingSnapshot | null>;
  countActiveProjects(orgId: string): Promise<number>;
  loadTask(orgId: string, taskId: string): Promise<{ id: string; state: TaskState; version: number; eventIds: string[] } | null>;
  createProject(input: { orgId: string; actor: string; name: string; description: string | null; limit: number | null }): Promise<RpcResult<string>>;
  createTask(input: { orgId: string; actor: string; projectId: string; title: string }): Promise<RpcResult<string>>;
  applyTransition(input: {
    taskId: string;
    actor: string;
    eventId: string;
    eventType: string;
    from: TaskState;
    to: TaskState;
    expectedVersion: number;
  }): Promise<RpcResult<number>>;
  newEventId(): string;
  now(): Date;
}

const MESSAGES: Record<WriteErrorCode, string> = {
  FORBIDDEN: "Your role in this workspace can't make this change.",
  INVALID_NAME: "Use a name between 1 and 80 characters.",
  INVALID_TITLE: "Use a title between 1 and 200 characters.",
  DUPLICATE_NAME: "A project with this name already exists in this workspace.",
  NOT_FOUND: "That item doesn't exist or isn't in this workspace.",
  QUOTA_EXCEEDED: "You've reached this plan's project limit.",
  FEATURE_NOT_IN_PLAN: "This feature isn't included in your current plan.",
  TRIAL_CAP_REACHED: "You've reached a trial limit. Choose a plan to keep going, or continue on Free.",
  BILLING_SUSPENDED: "Paid features are paused until billing is resolved.",
  ENTITLEMENT_UNAVAILABLE: "Your plan couldn't be confirmed, so this change is paused. Try again in a moment.",
  VERSION_CONFLICT: "Someone changed this task while you were looking at it. Reload and try again.",
  INVALID_TRANSITION: "This task can't make that change from its current state.",
  UNKNOWN: "Something went wrong and nothing was changed. Try again in a moment.",
};

const fail = <T>(code: WriteErrorCode, message = MESSAGES[code]): WriteResult<T> => ({ ok: false, code, message });

/** Maps an error raised by an app_* database function to a result code. */
export function codeFromDatabaseError(message: string): WriteErrorCode {
  for (const code of ["FORBIDDEN", "INVALID_NAME", "INVALID_TITLE", "DUPLICATE_NAME", "NOT_FOUND", "QUOTA_EXCEEDED", "VERSION_CONFLICT"] as const) {
    if (message.includes(code)) return code;
  }
  return "UNKNOWN";
}

async function requireContributor(deps: WriteDeps, orgId: string): Promise<WriteResult<OrgRole>> {
  const role = await deps.role(orgId);
  if (!role) return fail("NOT_FOUND");
  if (!CONTRIBUTOR_ROLES.includes(role)) return fail("FORBIDDEN");
  return { ok: true, value: role };
}

export async function createProject(
  deps: WriteDeps,
  input: { orgId: string; userId: string; name: string; description?: string },
): Promise<WriteResult<string>> {
  const name = input.name.trim();
  if (name.length < 1 || name.length > 80) return fail("INVALID_NAME");
  const description = input.description?.trim() || null;

  const role = await requireContributor(deps, input.orgId);
  if (!role.ok) return role;

  const snapshot = await deps.billing(input.orgId);
  const plan = snapshot ? resolveEffectivePlan(snapshot, deps.now()) : null;
  const used = await deps.countActiveProjects(input.orgId);
  const quota = checkQuota(plan, "workspaces", { used });
  if (!quota.allowed) return fail(quota.code, quota.message);

  const result = await deps.createProject({
    orgId: input.orgId,
    actor: input.userId,
    name,
    description,
    limit: plan?.limits.workspaces ?? null,
  });
  if (!result.ok) return fail(codeFromDatabaseError(result.error));
  return result;
}

export async function createTask(
  deps: WriteDeps,
  input: { orgId: string; userId: string; projectId: string; title: string },
): Promise<WriteResult<string>> {
  const title = input.title.trim();
  if (title.length < 1 || title.length > 200) return fail("INVALID_TITLE");

  const role = await requireContributor(deps, input.orgId);
  if (!role.ok) return role;

  const result = await deps.createTask({ orgId: input.orgId, actor: input.userId, projectId: input.projectId, title });
  if (!result.ok) return fail(codeFromDatabaseError(result.error));
  return result;
}

export async function cancelTask(
  deps: WriteDeps,
  input: { orgId: string; userId: string; taskId: string; expectedVersion: number },
): Promise<WriteResult<number>> {
  const role = await requireContributor(deps, input.orgId);
  if (!role.ok) return role;

  const loaded = await deps.loadTask(input.orgId, input.taskId);
  if (!loaded) return fail("NOT_FOUND");

  // The shared state machine decides whether cancelling is allowed.
  const snapshot: TaskSnapshot = {
    id: loaded.id,
    orgId: input.orgId,
    state: loaded.state,
    version: loaded.version,
    history: loaded.eventIds.map((eventId) => ({
      eventId,
      type: "cancel",
      from: loaded.state,
      to: loaded.state,
      at: deps.now(),
      actor: { kind: "user", id: input.userId },
    })),
  };
  const eventId = deps.newEventId();
  const decided = transition(snapshot, { id: eventId, type: "cancel", at: deps.now(), actor: { kind: "user", id: input.userId } }, input.expectedVersion);
  if (!decided.ok) {
    return decided.code === "VERSION_CONFLICT" ? fail("VERSION_CONFLICT") : fail("INVALID_TRANSITION");
  }

  const applied = await deps.applyTransition({
    taskId: loaded.id,
    actor: input.userId,
    eventId,
    eventType: "cancel",
    from: loaded.state,
    to: decided.task.state,
    expectedVersion: input.expectedVersion,
  });
  if (!applied.ok) return fail(codeFromDatabaseError(applied.error));
  return applied;
}
