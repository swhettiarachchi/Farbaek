/**
 * Notes for Learn and Audit tasks (ADR 0131): an explanation or an audit
 * report written by Claude, metered as task_note and refunded if it fails.
 * The files come from the task's contract scope; a task without a contract
 * gets a note on its title and the project's first files.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { approxTokens, reserveUnits } from "@/core/billing/rate-card";
import { pathScope } from "@/core/realityloop/change-proposal";
import { TaskNoteOutputSchema, acceptTaskNote, noteKindFor, taskNoteRequest, type NoteKind, type TaskMode, type TaskNoteOutput, type TaskNoteView } from "@/core/realityloop/modes";
import { routeModel } from "@/server/ai/routing";
import { TASK_NOTE_PROMPTS, taskNoteMessage, type TaskNoteWriter } from "@/server/ai/task-note-writer";
import { refundUsage, reserveUsage, resolvePlan, settleUsage, type AiUsageDeps, type ModelSource } from "./ai-usage";
import type { ProposalDeps } from "./proposals";
import { codeFromDatabaseError, fail, requireContributor, type RpcResult, type WriteDeps, type WriteResult } from "./use-cases";

export const MANUAL_NOTE = "Read the plan and the files yourself; nothing here changes the project.";

export interface TaskNoteDeps {
  taskForNote(orgId: string, taskId: string): Promise<{ id: string; projectId: string; title: string; mode: TaskMode } | null>;
  recordTaskNote(input: { taskId: string; actor: string; kind: NoteKind; body: TaskNoteOutput & { left: string[] }; model: string }): Promise<RpcResult<string>>;
}

type Deps = WriteDeps & AiUsageDeps & Pick<ProposalDeps, "approvedContract" | "projectFiles" | "fileContent"> & TaskNoteDeps;

const FAILURES = {
  REFUSED: "The AI declined to write this note, so it wasn't counted.",
  INCOMPLETE: "The note came back incomplete, so it wasn't counted. Try again.",
  PROVIDER_BUSY: "The AI provider is busy, so it wasn't counted. Try again in a minute.",
  PROVIDER_ERROR: "The note didn't finish, so it wasn't counted. Try again.",
} as const;

const TEXT = /\.(m?[jt]sx?|cjs|json|md|mdx|css|scss|html?|py|rb|go|rs|java|kt|swift|php|sql|ya?ml|toml|txt|sh|vue|svelte)$/i;

export async function writeTaskNote(deps: Deps, source: ModelSource<TaskNoteWriter>, input: { orgId: string; userId: string; taskId: string }): Promise<WriteResult<{ kind: NoteKind; noteId: string; model: string }>> {
  const role = await requireContributor(deps, input.orgId);
  if (!role.ok) return role;
  const task = await deps.taskForNote(input.orgId, input.taskId);
  if (!task) return fail("NOT_FOUND");
  const kind = noteKindFor(task.mode);
  if (!kind) return fail("INVALID_TRANSITION", "Notes are for Learn and Audit tasks. Switch the task's mode to get one.");

  // The files the contract names; without a contract, the project's first text files.
  const contract = await deps.approvedContract(input.orgId, task.id);
  const scope = contract ? pathScope(contract.body) : [];
  const listed = (await deps.projectFiles(input.orgId, task.projectId)).filter((f) => TEXT.test(f.path) && f.sizeBytes <= 200_000);
  const inScope = scope.length ? listed.filter((f) => scope.some((s) => f.path === s || f.path.startsWith(`${s}/`))) : listed;
  const picked = inScope.slice(0, 12);
  const contents = (await Promise.all(picked.map(async (f) => ({ path: f.path, file: await deps.fileContent(input.orgId, task.projectId, f.path) })))).flatMap((x) => (x.file ? [{ path: x.path, content: x.file.content }] : []));
  const { request, left } = taskNoteRequest(
    kind,
    task.title,
    contract ? { outcome: contract.body.outcome, resources: contract.body.scope.resources, acceptanceCriteria: contract.body.acceptanceCriteria.map((c) => c.statement) } : null,
    contents,
  );
  if (request.files.length === 0 && !request.contract) return fail("INVALID_TRANSITION", "There's nothing to read yet: the project has no text files and the task has no plan.");

  const billing = await resolvePlan(deps, input.orgId);
  if (!billing.ok) return billing;
  const writer = source.create(routeModel({ plan: billing.value.plan, family: source.family, step: "review", effort: "balanced" }));
  const units = reserveUnits(writer.model, approxTokens(TASK_NOTE_PROMPTS[kind]) + approxTokens(taskNoteMessage(request)) + 500, writer.maxOutputTokens);
  const reserved = await reserveUsage(deps, { orgId: input.orgId, userId: input.userId, taskId: task.id, operation: "task_note", units, manual: MANUAL_NOTE, billing: billing.value });
  if (!reserved.ok) return reserved;

  let outcome;
  try {
    outcome = await writer.write(request);
  } catch {
    outcome = { ok: false as const, failure: "PROVIDER_ERROR" as const, usage: null };
  }
  if (!outcome.ok) {
    await refundUsage(deps, { orgId: input.orgId, entryId: reserved.value.entryId, usage: outcome.usage, reason: "failed" });
    return fail(outcome.failure === "PROVIDER_BUSY" ? "AI_BUSY" : outcome.failure === "REFUSED" ? "AI_REFUSED" : "AI_INCOMPLETE", FAILURES[outcome.failure]);
  }
  await settleUsage(deps, { orgId: input.orgId, entryId: reserved.value.entryId, usage: outcome.usage });
  const recorded = await deps.recordTaskNote({ taskId: task.id, actor: input.userId, kind, body: acceptTaskNote(request, outcome.output, left), model: outcome.usage.model });
  if (!recorded.ok) return fail(codeFromDatabaseError(recorded.error));
  return { ok: true, value: { kind, noteId: recorded.value, model: outcome.usage.model } };
}

/** A task's notes, newest first, read as the person. Anything malformed is left out. */
export async function readTaskNotes(client: SupabaseClient, orgId: string, taskId: string): Promise<TaskNoteView[]> {
  const { data, error } = await client.from("task_notes").select("id, kind, body, model, created_at").eq("org_id", orgId).eq("task_id", taskId).order("created_at", { ascending: false }).limit(10);
  if (error) throw new Error(`Couldn't read the notes: ${error.message}`);
  const Body = TaskNoteOutputSchema.extend({ left: z.array(z.string()).catch([]) });
  return (data ?? []).flatMap((r) => {
    const body = Body.safeParse(r.body);
    if (!body.success || (r.kind !== "explanation" && r.kind !== "audit")) return [];
    return [{ id: String(r.id), kind: r.kind, ...body.data, model: String(r.model), createdAt: String(r.created_at) }];
  });
}
