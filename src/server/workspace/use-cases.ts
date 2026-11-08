/**
 * Write use cases. Each one authenticates nothing itself (the caller passes
 * the signed-in user's id), checks role and entitlements with the shared
 * TypeScript rules, then asks the database to apply the change atomically.
 * Supabase details live behind WriteDeps so this logic is unit-tested.
 */
import { MODE_REFUSALS, type TaskMode } from "@/core/realityloop/modes";
import { log } from "@/server/observability/log";
import { checkQuota } from "@/core/billing/entitlements";
import { resolveEffectivePlan, type BillingSnapshot } from "@/core/billing/trial";
import { contractHash, type IntentContract } from "@/core/realityloop/contract";
import { contractFromForm, type ContractFormValues } from "@/core/realityloop/contract-form";
import { transition, type TaskEventType, type TaskSnapshot, type TaskState } from "@/core/realityloop/task-machine";
import { WORKSPACE_LIMITS } from "@/config/workspace";
import { formatBytes } from "@/core/workspace/files";
import { may, withheldReason, type Permission, type WithheldPermissions } from "@/core/workspace/permissions";
import { CONTRIBUTOR_ROLES, MANAGER_ROLES, type OrgRole } from "./types";

export type WriteErrorCode =
  | "FORBIDDEN"
  | "INVALID_NAME"
  | "INVALID_TITLE"
  | "DUPLICATE_NAME"
  | "NOT_FOUND"
  | "QUOTA_EXCEEDED"
  | "PLATFORM_DAILY_LIMIT"
  | "FEATURE_NOT_IN_PLAN"
  | "TRIAL_CAP_REACHED"
  | "BILLING_SUSPENDED"
  | "ENTITLEMENT_UNAVAILABLE"
  | "VERSION_CONFLICT"
  | "INVALID_TRANSITION"
  | "INVALID_CONTRACT"
  | "CONTRACT_CHANGED"
  | "INVALID_PATH"
  | "FILE_TOO_LARGE"
  | "IMPORT_TOO_LARGE"
  | "PROJECT_TOO_LARGE"
  | "FILE_CHANGED"
  | "IMAGE_PATH"
  | "INVALID_IMAGE"
  | "NOTHING_TO_IMPORT"
  | "SECRET_IN_CONTENT"
  | "NO_CONTEXT"
  | "CONTEXT_TOO_LARGE"
  | "NO_APPLICABLE_CHANGES"
  | "INVALID_PROPOSAL"
  | "PROPOSAL_CLOSED"
  | "PROPOSAL_CHANGED"
  | "PROPOSAL_EXPIRED"
  | "NOTHING_TO_APPLY"
  | "EVALUATION_LIMIT"
  | "APPROVER_ROLE_REQUIRED"
  | "PROJECT_ARCHIVED"
  | "ALREADY_ARCHIVED"
  | "PROOFPACK_CHAIN"
  | "INVALID_PROOFPACK"
  | "INVALID_EMAIL"
  | "ALREADY_MEMBER"
  | "ALREADY_INVITED"
  | "SEAT_LIMIT"
  | "INVITATION_CLOSED"
  | "WRONG_ACCOUNT"
  | "INVALID_INVITATION"
  | "NOT_RECOVERABLE"
  | "RECOVERY_CHANGED"
  | "INVALID_RECOVERY"
  | "POLICY_BLOCKED"
  // Operating modes (ADR 0131).
  | "MODE_NO_CHANGES"
  | "PAIR_TOO_LARGE"
  | "PAIR_NEEDS_PERSON"
  | "PROPOSAL_PENDING"
  | "WRONG_MODE"
  | "RECOVERY_UNVERIFIED"
  | "AGENT_LIMIT"
  | "PAIRING_CLOSED"
  | "INVALID_PAIRING"
  | "AGENT_REVOKED"
  | "INVALID_LEASE"
  | "AI_UNAVAILABLE"
  | "AI_REFUSED"
  | "AI_INCOMPLETE"
  | "AI_BUSY"
  | "WORKSPACE_SUSPENDED"
  | "PAUSED_BY_FARBAEK"
  | "SITE_BLOCKED"
  | "TEAM_TOO_LARGE"
  | "INVALID_AUTONOMY"
  | "INVALID_LIMITS"
  | "DUPLICATE_PATH"
  | "INVALID_IMPORT"
  | "INVALID_CONTENT"
  | "WORKSPACE_RULES_CHANGED"
  | "INVALID_RULES"
  | "RULES_NOT_TESTED"
  | "AGENTS_PAUSED"
  | "INVALID_INCIDENT"
  | "INCIDENT_RESOLVED"
  | "AUTONOMY_NOT_EARNED"
  | "AUTONOMY_DAILY_LIMIT"
  | "PERMISSION_WITHHELD"
  | "INVALID_PERMISSIONS"
  | "INVALID_WORKFLOW"
  | "WORKFLOW_CLOSED"
  | "CONTRACTS_NOT_APPROVED"
  | "NOT_AT_CHECKPOINT"
  // A request the page could never have sent as it stands, such as a malformed hash: the page is out of date.
  | "INVALID_REQUEST"
  | "UNKNOWN";

export type WriteResult<T> = { ok: true; value: T } | { ok: false; code: WriteErrorCode; message: string };

export type RpcResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** One transition decided by the TypeScript state machine, in the shape the SQL functions expect. */
export interface TransitionStep {
  event_id: string;
  event_type: TaskEventType;
  from: TaskState;
  to: TaskState;
  /** Who decided the step. The database records user steps as the signed-in actor. */
  actor_kind?: "user" | "agent" | "system";
  actor_id?: string;
}

export interface WriteDeps {
  role(orgId: string): Promise<OrgRole | null>;
  billing(orgId: string): Promise<BillingSnapshot | null>;
  countActiveProjects(orgId: string): Promise<number>;
  loadTask(orgId: string, taskId: string): Promise<{ id: string; projectId: string; state: TaskState; version: number; eventIds: string[]; mode?: TaskMode } | null>;
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
  saveContract(input: {
    taskId: string;
    actor: string;
    body: IntentContract;
    sha256: string;
    basedOn: number;
    expectedTaskVersion: number;
    steps: TransitionStep[];
  }): Promise<RpcResult<number>>;
  approveContract(input: {
    taskId: string;
    actor: string;
    version: number;
    sha256: string;
    expectedTaskVersion: number;
    steps: TransitionStep[];
  }): Promise<RpcResult<null>>;
  newEventId(): string;
  now(): Date;
}

export const MESSAGES: Record<WriteErrorCode, string> = {
  FORBIDDEN: "Your role in this workspace can't make this change.",
  MODE_NO_CHANGES: MODE_REFUSALS.MODE_NO_CHANGES,
  PAIR_TOO_LARGE: MODE_REFUSALS.PAIR_TOO_LARGE,
  PAIR_NEEDS_PERSON: MODE_REFUSALS.PAIR_NEEDS_PERSON,
  PROPOSAL_PENDING: "A change is waiting for review. Apply or discard it first.",
  WRONG_MODE: "That note doesn't match the task's mode.",
  INVALID_NAME: "Use a name between 1 and 80 characters.",
  INVALID_TITLE: "Use a title between 1 and 200 characters.",
  DUPLICATE_NAME: "A project with this name already exists in this workspace.",
  NOT_FOUND: "That item doesn't exist or isn't in this workspace.",
  QUOTA_EXCEEDED: "You've reached this plan's project limit.",
  PLATFORM_DAILY_LIMIT: "Farbaek has reached its AI limit for today, so AI work is paused until midnight UTC. Your workspace's own usage isn't affected.",
  FEATURE_NOT_IN_PLAN: "This feature isn't included in your current plan.",
  TRIAL_CAP_REACHED: "You've reached a trial limit. Choose a plan to keep going, or continue on Free.",
  BILLING_SUSPENDED: "Paid features are paused until billing is resolved.",
  ENTITLEMENT_UNAVAILABLE: "Your plan couldn't be confirmed, so this change is paused. Try again in a moment.",
  VERSION_CONFLICT: "Someone changed this task while you were looking at it. Reload and try again.",
  INVALID_TRANSITION: "This task can't make that change from its current state.",
  INVALID_CONTRACT: "The plan isn't complete.",
  CONTRACT_CHANGED: "The plan changed since you opened it. Reload to see the latest version, then try again.",
  INVALID_PATH: `That file path isn't allowed. Use a path inside the project, without "." or ".." folders.`,
  FILE_TOO_LARGE: `Files can be up to ${formatBytes(WORKSPACE_LIMITS.maxFileBytes)}.`,
  IMPORT_TOO_LARGE: `One import can hold up to ${formatBytes(WORKSPACE_LIMITS.maxImportBytes)} of text. Import a smaller folder, for example src.`,
  PROJECT_TOO_LARGE: `A project can hold up to ${formatBytes(WORKSPACE_LIMITS.maxProjectBytes)} in ${WORKSPACE_LIMITS.maxProjectFiles.toLocaleString("en-US")} files. Nothing was changed.`,
  FILE_CHANGED: "Someone changed this file while you were looking at it. Reload to see the latest version.",
  IMAGE_PATH: "That name ends like an image's, so it can only hold an image. Add images with Add an image, or choose another name.",
  INVALID_IMAGE: "That isn't an image Farbaek can store. Use a PNG, JPEG, GIF, WebP, AVIF or icon file up to 2 MB.",
  NOTHING_TO_IMPORT: "None of the selected files can be imported.",
  SECRET_IN_CONTENT: "This looks like it holds a key or password, such as a private key or an API token. Remove it and try again, and keep it in your host's settings, not in the code.",
  NO_CONTEXT: "Choose the files the change needs, up to 20.",
  CONTEXT_TOO_LARGE: "The chosen files are too large to send together. Choose fewer or smaller files, up to 300 KB in total.",
  NO_APPLICABLE_CHANGES: "There were no changes that could be applied safely.",
  INVALID_PROPOSAL: "This change isn't valid, so nothing was changed.",
  PROPOSAL_CLOSED: "This change was already applied or discarded. Reload to see the latest state.",
  PROPOSAL_CHANGED: "This change is different from the one you reviewed. Reload and review it again.",
  PROPOSAL_EXPIRED: "This change ran out of time, so it can't be approved. Discard it and ask the agent to try again with the files as they are now.",
  NOTHING_TO_APPLY: "Every change was left out, so there's nothing to apply. Discard the whole change instead.",
  EVALUATION_LIMIT: "This workspace has used its safety checks for this period, so new changes are paused until it resets or the plan changes.",
  APPROVER_ROLE_REQUIRED: "This change needs an owner or admin to approve it.",
  PROJECT_ARCHIVED: "This project is archived, so its files can't change.",
  ALREADY_ARCHIVED: "This project is already archived.",
  PROOFPACK_CHAIN: "Another change in this project was recorded at the same moment. Reload and approve again.",
  INVALID_PROOFPACK: "The record of this change's checks didn't match it, so nothing was applied.",
  INVALID_EMAIL: "Enter a valid email address.",
  ALREADY_MEMBER: "That person is already in this workspace.",
  ALREADY_INVITED: "That person already has an open invitation. Revoke it to create a new link.",
  SEAT_LIMIT: "Every seat on this plan is taken, counting open invitations. Revoke an invitation or free a seat first.",
  INVITATION_CLOSED: "This invitation was already used, revoked or has expired. Ask for a new one.",
  WRONG_ACCOUNT: "This invitation is for a different email address. Sign in with the address it was sent to.",
  INVALID_INVITATION: "The invitation isn't valid. Try again.",
  NOT_RECOVERABLE: "This task can't be undone from its current state. Verified and finished tasks are closed records.",
  RECOVERY_CHANGED: "The files changed since you reviewed the undo. Reload and review it again. Nothing was changed.",
  INVALID_RECOVERY: "The undo didn't match the change it was for, so nothing was changed. Reload and review it again.",
  POLICY_BLOCKED: "The rules stopped this undo, so nothing was changed.",
  RECOVERY_UNVERIFIED: "The restored files didn't match their earlier versions, so nothing was changed.",
  AI_UNAVAILABLE: "AI isn't available right now. Try again in a minute, or write it yourself.",
  AI_REFUSED: "The model declined to draft this plan. Write it yourself, or reword the task and try again.",
  AI_INCOMPLETE: "The draft came back incomplete. Try again, or write the plan yourself.",
  AI_BUSY: "The AI provider is busy. Try again in a minute.",
  AGENT_LIMIT: "Every agent on this plan is in use. Revoke one you no longer use, or change the plan.",
  PAIRING_CLOSED: "This pairing code was already used or has expired. Create a new code in Farbaek.",
  INVALID_PAIRING: "The pairing code isn't valid. Create a new code and try again.",
  AGENT_REVOKED: "This agent was revoked. Pair the app again to keep using it.",
  INVALID_LEASE: "These access settings aren't valid. Access lasts 1 to 90 days, allows at least one thing, covers projects in this workspace and 10 to 5,000 requests an hour.",
  WORKSPACE_SUSPENDED: "Farbaek has paused this workspace, so nothing in it can change right now. The notice at the top of the page says why and how to reach us.",
  PAUSED_BY_FARBAEK: "Farbaek has paused this for everyone for a short while. Your work is safe; try again soon.",
  SITE_BLOCKED: "Farbaek has taken this site offline, so it can't go live again for now. The notice on the project page says why.",
  TEAM_TOO_LARGE: "Up to 3 steps can run together. Untick one and try again.",
  INVALID_AUTONOMY: "Those settings for changes on their own aren't valid. Choose a level and limits within the ranges shown.",
  INVALID_LIMITS: "Those limits aren't allowed on this plan. Choose smaller ones.",
  DUPLICATE_PATH: "Two of the files have the same path. Rename one and try again. Nothing was changed.",
  INVALID_IMPORT: "That import isn't valid, so nothing was changed. Choose the files again.",
  INVALID_CONTENT: "One of the files holds something Farbaek can't store. Leave it out and try again. Nothing was changed.",
  WORKSPACE_RULES_CHANGED: "This workspace's rules changed while the change was being prepared, so nothing was saved. Try again.",
  INVALID_RULES: "These rules aren't valid. Fix the marked fields and try again.",
  RULES_NOT_TESTED: "These rules changed after they were tested. Test them against past changes again before activating them.",
  AGENTS_PAUSED: "Agents are paused in this workspace, so no agent runs or automatic changes start until an owner or admin resumes them on the Problems and pause page.",
  INVALID_INCIDENT: "That change to the problem isn't valid. Check the marked fields and try again.",
  INCIDENT_RESOLVED: "This problem is resolved, so it can't change any more. Report a new one if something else went wrong.",
  AUTONOMY_NOT_EARNED: "Bigger changes on their own aren't earned yet: it takes 10 changes applied on their own that passed their checks in the last 30 days, with none failing.",
  AUTONOMY_DAILY_LIMIT: "The workspace reached its daily limit of changes applied on their own. This change waits for a person.",
  PERMISSION_WITHHELD: "An owner or admin turned this off for you in this workspace. Ask one of them if you need it.",
  INVALID_PERMISSIONS: "Permissions are set for members only. Owners and admins have them all, and viewers have none.",
  INVALID_WORKFLOW: "A workflow needs a title and 2 to 8 steps, each with a title of at least 3 characters.",
  WORKFLOW_CLOSED: "This workflow has already moved on, so it can't do that any more. Reload the page.",
  CONTRACTS_NOT_APPROVED: "Every step's plan has to be approved before the workflow can be.",
  NOT_AT_CHECKPOINT: "The workflow isn't waiting at a checkpoint, so there's nothing to continue.",
  INVALID_REQUEST: "Reload the page and try again.",
  UNKNOWN: "Something went wrong and nothing was changed. Try again in a moment.",
};

export const fail = <T>(code: WriteErrorCode, message = MESSAGES[code]): WriteResult<T> => ({ ok: false, code, message });

/** Maps an error raised by an app_* database function to a result code. */
export function codeFromDatabaseError(message: string): WriteErrorCode {
  for (const code of [
    // Staff controls (ADR 0032) first: they can arrive from any function.
    "WORKSPACE_SUSPENDED",
    "PAUSED_BY_FARBAEK",
    "SITE_BLOCKED",
    "TEAM_TOO_LARGE",
    "INVALID_AUTONOMY",
    "INVALID_LIMITS",
    "DUPLICATE_PATH",
    "INVALID_IMPORT",
    "INVALID_CONTENT",
    "MODE_NO_CHANGES",
    "PAIR_TOO_LARGE",
    "PAIR_NEEDS_PERSON",
    "PROPOSAL_PENDING",
    "WRONG_MODE",
    "FORBIDDEN",
    "INVALID_NAME",
    "INVALID_TITLE",
    "DUPLICATE_NAME",
    "NOT_FOUND",
    "PLATFORM_DAILY_LIMIT",
    "QUOTA_EXCEEDED",
    "VERSION_CONFLICT",
    "CONTRACT_CHANGED",
    "INVALID_CONTRACT",
    "INVALID_PATH",
    "FILE_TOO_LARGE",
    "IMPORT_TOO_LARGE",
    "PROJECT_TOO_LARGE",
    "FILE_CHANGED",
    "IMAGE_PATH",
    "INVALID_PROPOSAL",
    "PROPOSAL_CLOSED",
    "PROPOSAL_EXPIRED",
    "NOTHING_TO_APPLY",
    "EVALUATION_LIMIT",
    "APPROVER_ROLE_REQUIRED",
    "PROOFPACK_CHAIN",
    "INVALID_PROOFPACK",
    "ALREADY_MEMBER",
    "ALREADY_INVITED",
    "SEAT_LIMIT",
    "INVITATION_CLOSED",
    "WRONG_ACCOUNT",
    "INVALID_INVITATION",
    "NOT_RECOVERABLE",
    "INVALID_RECOVERY",
    "POLICY_BLOCKED",
    "RECOVERY_UNVERIFIED",
    "PROJECT_ARCHIVED",
    "ALREADY_ARCHIVED",
    "AGENT_LIMIT",
    "PAIRING_CLOSED",
    "INVALID_PAIRING",
    "AGENT_REVOKED",
    "INVALID_LEASE",
    "WORKSPACE_RULES_CHANGED",
    "INVALID_RULES",
    "AGENTS_PAUSED",
    "INVALID_INCIDENT",
    "INCIDENT_RESOLVED",
    "AUTONOMY_NOT_EARNED",
    "AUTONOMY_DAILY_LIMIT",
    "PERMISSION_WITHHELD",
    "INVALID_PERMISSIONS",
    "INVALID_WORKFLOW",
    "WORKFLOW_CLOSED",
    "CONTRACTS_NOT_APPROVED",
    "NOT_AT_CHECKPOINT",
  ] as const) {
    if (message.includes(code)) return code;
  }
  // The person is told something vague, so this line is the only record of what really happened (ADR 0178).
  log("warn", "database.unknown_error", { error: message });
  return "UNKNOWN";
}

/** Members can have permissions turned off (ADR 0087); owners and admins have them all, and viewers none. */
export function requirePermission(role: OrgRole, permissions: WithheldPermissions, permission: Permission): WriteResult<null> {
  return may(role, permissions, permission) ? { ok: true, value: null } : fail("PERMISSION_WITHHELD", withheldReason(permission));
}

export async function requireContributor(deps: WriteDeps, orgId: string): Promise<WriteResult<OrgRole>> {
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

export interface ProjectAdminDeps {
  archiveProject(input: { projectId: string; actor: string }): Promise<RpcResult<null>>;
}

/** Owners and admins archive a project. The database re-checks the role and refuses a second archive. */
export async function archiveProject(deps: WriteDeps & ProjectAdminDeps, input: { orgId: string; userId: string; projectId: string }): Promise<WriteResult<null>> {
  const role = await deps.role(input.orgId);
  if (!role) return fail("NOT_FOUND");
  if (!MANAGER_ROLES.includes(role)) return fail("FORBIDDEN", "Only owners and admins can archive a project.");
  const result = await deps.archiveProject({ projectId: input.projectId, actor: input.userId });
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

/** Runs events through the shared state machine, collecting the steps to store. */
export function planSteps(
  deps: Pick<WriteDeps, "newEventId" | "now">,
  start: { id: string; orgId: string; state: TaskState; version: number },
  userId: string,
  events: TaskEventType[],
): { ok: true; steps: TransitionStep[] } | { ok: false; code: WriteErrorCode } {
  let snapshot: TaskSnapshot = { id: start.id, orgId: start.orgId, state: start.state, version: start.version, history: [] };
  const steps: TransitionStep[] = [];
  for (const type of events) {
    const id = deps.newEventId();
    const result = transition(snapshot, { id, type, at: deps.now(), actor: { kind: "user", id: userId } }, snapshot.version);
    if (!result.ok) return { ok: false, code: result.code === "VERSION_CONFLICT" ? "VERSION_CONFLICT" : "INVALID_TRANSITION" };
    steps.push({ event_id: id, event_type: type, from: snapshot.state, to: result.task.state });
    snapshot = result.task;
  }
  return { ok: true, steps };
}

/** The events that bring a task to CONTRACT_DRAFTED from where it is now, or null once the contract is fixed. */
export function draftingEvents(state: TaskState): TaskEventType[] | null {
  switch (state) {
    case "RECEIVED":
      return ["assemble_context", "draft_contract"];
    case "CONTEXT_ASSEMBLED":
      return ["draft_contract"];
    case "CONTRACT_DRAFTED":
    case "CONTRACT_APPROVED":
    case "BLOCKED":
      return ["revise_contract"];
    default:
      return null;
  }
}

export async function saveContract(
  deps: WriteDeps,
  input: { orgId: string; userId: string; taskId: string; expectedTaskVersion: number; basedOn: number; form: ContractFormValues },
): Promise<WriteResult<number>> {
  const role = await requireContributor(deps, input.orgId);
  if (!role.ok) return role;

  const task = await deps.loadTask(input.orgId, input.taskId);
  if (!task) return fail("NOT_FOUND");
  if (task.version !== input.expectedTaskVersion) return fail("VERSION_CONFLICT");

  const events = draftingEvents(task.state);
  if (!events) return fail("INVALID_TRANSITION", "The plan can't change once the task has moved past planning.");

  const built = contractFromForm(input.form, { organizationId: input.orgId, projectId: task.projectId }, input.basedOn + 1);
  if (!built.ok) return fail("INVALID_CONTRACT", built.message);

  const planned = planSteps(deps, { ...task, orgId: input.orgId }, input.userId, events);
  if (!planned.ok) return fail(planned.code);

  const sha256 = await contractHash(built.contract);
  const result = await deps.saveContract({
    taskId: task.id,
    actor: input.userId,
    body: built.contract,
    sha256,
    basedOn: input.basedOn,
    expectedTaskVersion: task.version,
    steps: planned.steps,
  });
  if (!result.ok) return fail(codeFromDatabaseError(result.error));
  return result;
}

export async function approveContract(
  deps: WriteDeps,
  input: { orgId: string; userId: string; taskId: string; expectedTaskVersion: number; version: number; sha256: string },
): Promise<WriteResult<null>> {
  const role = await requireContributor(deps, input.orgId);
  if (!role.ok) return role;
  // A malformed hash isn't a changed plan: the page sent something it never showed. A real mismatch is the database's CONTRACT_CHANGED below.
  if (!/^[0-9a-f]{64}$/.test(input.sha256)) return fail("INVALID_REQUEST");

  const task = await deps.loadTask(input.orgId, input.taskId);
  if (!task) return fail("NOT_FOUND");
  if (task.version !== input.expectedTaskVersion) return fail("VERSION_CONFLICT");

  const planned = planSteps(deps, { ...task, orgId: input.orgId }, input.userId, ["approve_contract"]);
  if (!planned.ok) return fail(planned.code);

  // The database checks the hash the reviewer saw against the stored version.
  const result = await deps.approveContract({
    taskId: task.id,
    actor: input.userId,
    version: input.version,
    sha256: input.sha256,
    expectedTaskVersion: task.version,
    steps: planned.steps,
  });
  if (!result.ok) return fail(codeFromDatabaseError(result.error));
  return result;
}
