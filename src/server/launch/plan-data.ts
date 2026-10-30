/**
 * Everything the Launch page shows (LaunchOS A, ADR 0033): the plan from
 * the project's own files, the publish state, the evidence behind the
 * latest change (ADR 0050) and the latest live check of each deployment.
 * Reads only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { PLAN_LIMITS, filesToRead, planLaunch, type LaunchPlan } from "@/core/launch/planner";
import { costDrivers, type CostDriver } from "@/core/launch/costs";
import { evidenceFromPacks, verifiedChange, type LaunchEvidence } from "@/core/publish/evidence";
import { loadPublishPanel, type PublishPanelData } from "@/server/publish/panel";
import type { AppContext } from "@/server/workspace/context";
import { latestChecksBySite, type HealthRecord } from "./health";

export interface LaunchPageData {
  plan: LaunchPlan;
  /** What will cost money at the host and each service (ADR 0141): drivers, never prices. */
  costs: CostDriver[];
  publish: PublishPanelData | null;
  /** The same evidence the publish gate reads. */
  evidence: LaunchEvidence;
  /** The latest live check of each deployment, by deployment id. */
  checks: Record<string, HealthRecord>;
}

export async function loadLaunchPage(ctx: AppContext, user: SupabaseClient | null, project: { id: string; name: string }): Promise<LaunchPageData> {
  const orgId = ctx.current!.id;
  const [contents, publish, tasks, packs, files] = await Promise.all([
    ctx.reader.getProjectContents(orgId, project.id),
    user ? loadPublishPanel(ctx, user, project).catch(() => null) : Promise.resolve(null),
    ctx.reader.listTasks(orgId, { projectId: project.id, limit: 200 }),
    ctx.reader.listRecentProofPacks(orgId, 100).catch(() => []),
    ctx.reader.listFiles(orgId, project.id),
  ]);

  const paths = contents.map((f) => f.path);
  const wanted = new Set(filesToRead(paths));
  const texts = Object.fromEntries(contents.filter((f) => wanted.has(f.path)).map((f) => [f.path, f.content.slice(0, PLAN_LIMITS.bytesPerFile)]));
  const plan = planLaunch({ paths, texts });
  const costs = costDrivers(plan, { paths, texts });

  // The publish panel reads the evidence exactly as the database does; without it, the same rule over the recent ProofPacks.
  const taskIds = new Set(tasks.map((t) => t.id));
  const filesChangedAt = files.reduce<string | null>((latest, f) => (!latest || f.updatedAt > latest ? f.updatedAt : latest), null);
  const evidence =
    publish?.evidence ??
    evidenceFromPacks(
      packs.filter((p) => taskIds.has(p.taskId)).map((p) => ({ digest: p.digest, status: p.status, createdAt: p.createdAt, taskId: p.taskId, verifies: verifiedChange(p.statement) })),
      filesChangedAt,
    );
  const checks = user && publish?.site ? Object.fromEntries(await latestChecksBySite(user, orgId, publish.site.id)) : {};

  return { plan, costs, publish, evidence, checks };
}
