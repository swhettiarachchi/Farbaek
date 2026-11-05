/**
 * Fixing what failed checks found (ADR 0101). From a task whose checks
 * failed, a person starts a fix: a new task in the same project, linked to
 * the first, whose contract starts as the approved one plus a line naming
 * what failed. It's a draft: the person reviews and approves it as always,
 * then starts the agent. If the fix's own checks fail too, its AI usage is
 * given back from the plan's retry reserve (`settleFixRetry`).
 */
import { formFromContract } from "@/core/realityloop/contract-form";
import type { WithheldPermissions } from "@/core/workspace/permissions";
import { TERMINAL_STATES } from "@/core/realityloop/task-machine";
import { createTask, fail, requirePermission, saveContract, codeFromDatabaseError, type RpcResult, type WriteDeps, type WriteResult } from "./use-cases";
import { CONTRIBUTOR_ROLES, type ContractRecord, type OrgRole, type Task, type TaskFix } from "./types";

/** Task states a fix can start from: the checks ran and didn't all pass. */
export const FIXABLE_STATES: ReadonlySet<Task["state"]> = new Set(["FAILED", "PARTIALLY_VERIFIED"]);

export interface FixDeps {
  write: WriteDeps;
  task(orgId: string, taskId: string): Promise<Task | null>;
  contract(orgId: string, taskId: string): Promise<ContractRecord | null>;
  /** The names of the checks that didn't pass in the task's latest receipt. */
  failedChecks(orgId: string, taskId: string): Promise<string[]>;
  fixFor(orgId: string, taskId: string): Promise<TaskFix | null>;
  link(input: { orgId: string; actor: string; taskId: string; sourceId: string }): Promise<RpcResult<null>>;
}

export interface FixPerson {
  orgId: string;
  userId: string;
  role: OrgRole;
  permissions: WithheldPermissions;
}

/** Whether a fix already started for a task is still open (not ended in any way). */
export function fixIsOpen(fix: TaskFix | null): boolean {
  return fix !== null && !TERMINAL_STATES.has(fix.state) && !FIXABLE_STATES.has(fix.state);
}

export function fixTitle(title: string): string {
  const full = `Fix: ${title}`;
  return full.length <= 200 ? full : `${full.slice(0, 199)}…`;
}

/** The line added to the fix's contract, so the agent knows what to look at first. */
export function fixNote(title: string, failed: readonly string[]): string {
  const what = failed.length ? `${failed.slice(0, 5).join(", ")}${failed.length > 5 ? ` and ${failed.length - 5} more` : ""}` : "its checks";
  const note = `The last attempt at "${title.slice(0, 80)}" didn't pass ${failed.length ? `these checks: ${what}` : what}. Run them, fix what they found, and keep everything else the same.`;
  return note.slice(0, 300);
}

export async function startFix(deps: FixDeps, person: FixPerson, sourceTaskId: string): Promise<WriteResult<{ taskId: string }>> {
  if (!CONTRIBUTOR_ROLES.includes(person.role)) return fail("FORBIDDEN");
  const allowed = requirePermission(person.role, person.permissions, "run_agents");
  if (!allowed.ok) return allowed;

  const source = await deps.task(person.orgId, sourceTaskId);
  if (!source) return fail("NOT_FOUND");
  if (!FIXABLE_STATES.has(source.state)) return fail("INVALID_TRANSITION", "Only a task whose checks failed can be fixed this way.");
  const contract = await deps.contract(person.orgId, source.id);
  if (!contract || contract.status !== "approved") return fail("INVALID_TRANSITION", "The task's plan isn't approved, so there's nothing to fix toward.");
  const existing = await deps.fixFor(person.orgId, source.id);
  if (fixIsOpen(existing)) return fail("INVALID_TRANSITION", `A fix is already open: ${existing!.title}`);

  const created = await createTask(deps.write, { orgId: person.orgId, userId: person.userId, projectId: source.projectId, title: fixTitle(source.title) });
  if (!created.ok) return created;
  const taskId = created.value;
  const linked = await deps.link({ orgId: person.orgId, actor: person.userId, taskId, sourceId: source.id });
  if (!linked.ok) return fail(codeFromDatabaseError(linked.error), linked.error.includes("FIX_OPEN") ? "A fix for this task is already open." : undefined);

  const form = formFromContract(contract.body);
  const note = fixNote(source.title, await deps.failedChecks(person.orgId, source.id).catch(() => []));
  form.assumptions = [form.assumptions, note].filter(Boolean).join("\n");
  // A new task starts at version 0 with no contract. If this save fails, the task is still linked and the person writes the contract.
  await saveContract(deps.write, { orgId: person.orgId, userId: person.userId, taskId, expectedTaskVersion: 0, basedOn: 0, form });
  return { ok: true, value: { taskId } };
}
