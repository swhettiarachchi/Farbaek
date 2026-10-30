import { analyzeImpact } from "@/core/realityloop/impact";
import { whyGraph, type WhyChange, type WhyGraph } from "@/core/insights/why-graph";
import type { AppContext } from "@/server/workspace/context";
import type { FileRevision } from "@/server/workspace/types";

/** The most project text the Why-Graph reads for docs and tests; past it, it says it didn't look. */
const MAX_TEXT_BYTES = 3 * 1024 * 1024;
/** Tasks whose contract outcome is looked up. */
const MAX_TASKS = 10;

/**
 * The Why-Graph for one file (ADR 0123), read as the person: the applied
 * changes that wrote it with their tasks' outcomes, the docs that name it and
 * the tests that reach it. `scanned` is false when the project was too large
 * to read docs and tests, so the page can say so.
 */
export async function loadWhyGraph(ctx: AppContext, orgId: string, projectId: string, path: string, revisions: readonly FileRevision[]): Promise<WhyGraph & { scanned: boolean }> {
  const [changes, tasks, files] = await Promise.all([
    ctx.reader.listFileChanges(orgId, projectId, path).catch(() => []),
    ctx.reader.listTasks(orgId, { projectId }).catch(() => []),
    ctx.reader.listFiles(orgId, projectId).catch(() => []),
  ]);
  const titles = new Map(tasks.map((t) => [t.id, t.title]));
  const taskIds = [...new Set(changes.map((c) => c.taskId))].slice(0, MAX_TASKS);
  const contracts = new Map(
    await Promise.all(taskIds.map(async (id) => [id, (await ctx.reader.getContract(orgId, id).catch(() => null))?.body.outcome ?? null] as const)),
  );

  const textBytes = files.filter((f) => f.encoding !== "base64").reduce((n, f) => n + f.sizeBytes, 0);
  const scanned = textBytes <= MAX_TEXT_BYTES;
  const contents = scanned ? await ctx.reader.getProjectContents(orgId, projectId).catch(() => null) : null;
  const all = new Map((contents ?? []).map((f) => [f.path, f.content]));
  const tests = contents ? analyzeImpact([path], all).tests.filter((t) => t !== path) : [];

  const why: WhyChange[] = changes.map((c) => ({
    taskId: c.taskId,
    taskTitle: titles.get(c.taskId) ?? "A task",
    outcome: contracts.get(c.taskId) ?? null,
    reason: c.reason,
    appliedAt: c.appliedAt,
    model: c.model,
    byAgent: c.byAgent,
  }));
  return {
    ...whyGraph({ projectId, path, revisions: revisions.map((r) => ({ revision: r.revision, change: r.change, createdAt: r.createdAt })), changes: why, docs: all, tests }),
    scanned: scanned && contents !== null,
  };
}
