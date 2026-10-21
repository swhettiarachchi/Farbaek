/**
 * Everything the Launch page shows (LaunchOS A, ADR 0033): the plan from
 * the project's own files, the publish state, the latest change's ProofPack
 * and the latest live check of each deployment. Reads only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { PLAN_LIMITS, filesToRead, planLaunch, type LaunchPlan } from "@/core/launch/planner";
import { loadPublishPanel, type PublishPanelData } from "@/server/publish/panel";
import type { AppContext } from "@/server/workspace/context";
import type { ProofPackRecord } from "@/server/workspace/types";
import { latestChecksBySite, type HealthRecord } from "./health";

export interface LaunchPageData {
  plan: LaunchPlan;
  publish: PublishPanelData | null;
  proofPack: { status: ProofPackRecord["status"]; digest: string; createdAt: string; taskId: string } | null;
  /** The latest live check of each deployment, by deployment id. */
  checks: Record<string, HealthRecord>;
}

export async function loadLaunchPage(ctx: AppContext, user: SupabaseClient | null, project: { id: string; name: string }): Promise<LaunchPageData> {
  const orgId = ctx.current!.id;
  const [contents, publish, tasks, packs] = await Promise.all([
    ctx.reader.getProjectContents(orgId, project.id),
    user ? loadPublishPanel(ctx, user, project).catch(() => null) : Promise.resolve(null),
    ctx.reader.listTasks(orgId, { projectId: project.id, limit: 200 }),
    ctx.reader.listRecentProofPacks(orgId, 100).catch(() => []),
  ]);

  const paths = contents.map((f) => f.path);
  const wanted = new Set(filesToRead(paths));
  const texts = Object.fromEntries(contents.filter((f) => wanted.has(f.path)).map((f) => [f.path, f.content.slice(0, PLAN_LIMITS.bytesPerFile)]));
  const plan = planLaunch({ paths, texts });

  const taskIds = new Set(tasks.map((t) => t.id));
  const pack = packs.find((p) => taskIds.has(p.taskId)) ?? null;
  const checks = user && publish?.site ? Object.fromEntries(await latestChecksBySite(user, orgId, publish.site.id)) : {};

  return { plan, publish, proofPack: pack ? { status: pack.status, digest: pack.digest, createdAt: pack.createdAt, taskId: pack.taskId } : null, checks };
}
