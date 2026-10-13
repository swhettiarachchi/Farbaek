/**
 * Write use cases. Each one authenticates nothing itself (the caller passes
 * the signed-in user's id), checks role and entitlements with the shared
 * TypeScript rules, then asks the database to apply the change atomically.
 * Supabase details live behind WriteDeps so this logic is unit-tested.
 */
import { checkQuota } from "@/core/billing/entitlements";
import { resolveEffectivePlan, type BillingSnapshot } from "@/core/billing/trial";
import { contractHash, type IntentContract } from "@/core/realityloop/contract";
import { contractFromForm, type ContractFormValues } from "@/core/realityloop/contract-form";
import { transition, type TaskEventType, type TaskSnapshot, type TaskState } from "@/core/realityloop/task-machine";
import { WORKSPACE_LIMITS } from "@/config/workspace";
import { formatBytes } from "@/core/workspace/files";
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
  | "INVALID_CONTRACT"
  | "CONTRACT_CHANGED"
  | "INVALID_PATH"
  | "FILE_TOO_LARGE"
  | "IMPORT_TOO_LARGE"
  | "PROJECT_TOO_LARGE"
  | "FILE_CHANGED"
  | "NOTHING_TO_IMPORT"
  | "SECRET_IN_CONTENT"
  | "NO_CONTEXT"
  | "CONTEXT_TOO_LARGE"
  | "NO_APPLICABLE_CHANGES"
  | "INVALID_PROPOSAL"
  | "PROPOSAL_CLOSED"
  | "PROPOSAL_CHANGED"
  | "NOTHING_TO_APPLY"
  | "AI_UNAVAILABLE"
  | "AI_REFUSED"
  | "AI_INCOMPLETE"
  | "AI_BUSY"
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
  loadTask(orgId: string, taskId: string): Promise<{ id: string; projectId: string; state: TaskState; version: number; eventIds: string[] } | null>;
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
  INVALID_CONTRACT: "The contract isn't complete.",
  CONTRACT_CHANGED: "The contract changed since you opened it. Reload to see the latest version, then try again.",
  INVALID_PATH: `That file path isn't allowed. Use a path inside the project, without "." or ".." folders.`,
  FILE_TOO_LARGE: `Files can be up to ${formatBytes(WORKSPACE_LIMITS.maxFileBytes)}.`,
  IMPORT_TOO_LARGE: `One import can hold up to ${formatBytes(WORKSPACE_LIMITS.maxImportBytes)} of text. Import a smaller folder, for example src.`,
  PROJECT_TOO_LARGE: `A project can hold up to ${formatBytes(WORKSPACE_LIMITS.maxProjectBytes)} in ${WORKSPACE_LIMITS.maxProjectFiles.toLocaleString("en-US")} files. Nothing was changed.`,
  FILE_CHANGED: "Someone changed this file while you were looking at it. Reload to see the latest version.",
  NOTHING_TO_IMPORT: "None of the selected files can be imported.",
  SECRET_IN_CONTENT: "This looks like it contains a secret, such as a private key or an API token. Remove it and try again. Keep secrets in environment variables.",
  NO_CONTEXT: "Choose the files the change needs, up to 20.",
  CONTEXT_TOO_LARGE: "The chosen files are too large to send together. Choose fewer or smaller files, up to 300 KB in total.",
  NO_APPLICABLE_CHANGES: "The proposal had no changes that could be applied safely.",
  INVALID_PROPOSAL: "The proposal isn't valid, so nothing was changed.",
  PROPOSAL_CLOSED: "This proposal was already applied or discarded. Reload to see the latest state.",
  PROPOSAL_CHANGED: "The proposal changed since you reviewed it. Reload and review it again.",
  NOTHING_TO_APPLY: "Every change was rejected, so there's nothing to apply. Discard the proposal instead.",
  AI_UNAVAILABLE: "AI isn't available right now.",
  AI_REFUSED: "The model declined to draft this contract. Write it yourself, or reword the task and try again.",
  AI_INCOMPLETE: "The draft came back incomplete. Try again, or write the contract yourself.",
  AI_BUSY: "The AI provider is busy. Try again in a minute.",
  UNKNOWN: "Something went wrong and nothing was changed. Try again in a moment.",
};

export const fail = <T>(code: WriteErrorCode, message = MESSAGES[code]): WriteResult<T> => ({ ok: false, code, message });

/** Maps an error raised by an app_* database function to a result code. */
export function codeFromDatabaseError(message: string): WriteErrorCode {
  for (const code of [
    "FORBIDDEN",
    "INVALID_NAME",
    "INVALID_TITLE",
    "DUPLICATE_NAME",
    "NOT_FOUND",
    "QUOTA_EXCEEDED",
    "VERSION_CONFLICT",
    "CONTRACT_CHANGED",
    "INVALID_CONTRACT",
    "INVALID_PATH",
    "FILE_TOO_LARGE",
    "IMPORT_TOO_LARGE",
    "PROJECT_TOO_LARGE",
    "FILE_CHANGED",
    "INVALID_PROPOSAL",
    "PROPOSAL_CLOSED",
    "NOTHING_TO_APPLY",
  ] as const) {
    if (message.includes(code)) return code;
  }
  return "UNKNOWN";
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
  deps: WriteDeps,
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
  if (!events) return fail("INVALID_TRANSITION", "The contract can't change once the task has moved past planning.");

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
  if (!/^[0-9a-f]{64}$/.test(input.sha256)) return fail("CONTRACT_CHANGED");

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
