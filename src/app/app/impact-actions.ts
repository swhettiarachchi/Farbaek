"use server";

import { z } from "zod";
import { checkFeature } from "@/core/billing/entitlements";
import { analyzeImpact, isScanned, type ImpactResult } from "@/core/realityloop/impact";
import { loadAppContext } from "@/server/workspace/context";

// A "use server" file exports only its actions, so these stay here.
const MAX_FILES = 3_000;
const MAX_BYTES = 20 * 1024 * 1024;
const NOT_IN_PLAN = "Impact analysis is included in Max 2x and up.";

export type ImpactState = { status: "done"; result: ImpactResult; sample: boolean } | { status: "error"; message: string };

/**
 * What else in the project reaches the files a task's latest change touches
 * (ADR 0085), read as the person from what they can already see. The
 * change's own edits count, so new imports are followed. Changes nothing.
 */
export async function analyzeImpactAction(input: { taskId: string }): Promise<ImpactState> {
  const parsed = z.object({ taskId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { status: "error", message: "Reload the page and try again." };
  const ctx = await loadAppContext();
  if (!ctx?.current) return { status: "error", message: "Sign in again to see what this change reaches." };
  const demo = ctx.mode === "demo";
  if (!demo) {
    const feature = checkFeature(ctx.current.plan, "impact_analysis");
    if (!feature.allowed) return { status: "error", message: feature.code === "FEATURE_NOT_IN_PLAN" ? NOT_IN_PLAN : feature.message };
  }
  const found = await ctx.reader.getTask(ctx.current.id, parsed.data.taskId);
  const proposal = found ? await ctx.reader.getLatestProposal(ctx.current.id, found.task.id) : null;
  if (!found || !proposal) return { status: "error", message: "This task has no change to look at yet." };

  let contents: { path: string; content: string }[];
  try {
    contents = await ctx.reader.getProjectContents(ctx.current.id, found.task.projectId);
  } catch {
    return { status: "error", message: "The project's files couldn't be read just now. Try again." };
  }
  // Every file counts as existing; contents are read only where imports are (and the path alias config), within limits.
  const files = new Map<string, string>();
  let read = 0;
  let bytes = 0;
  let cut = false;
  for (const f of contents) {
    const wanted = isScanned(f.path) || /^(?:ts|js)config\.json$/.test(f.path);
    if (wanted && read < MAX_FILES && bytes + f.content.length <= MAX_BYTES) {
      files.set(f.path, f.content);
      read++;
      bytes += f.content.length;
    } else {
      files.set(f.path, "");
      if (wanted) cut = true;
    }
  }
  for (const c of proposal.changes) files.set(c.path, c.content);

  const result = analyzeImpact(proposal.changes.map((c) => c.path), files);
  return { status: "done", result: cut ? { ...result, truncated: true } : result, sample: demo };
}
