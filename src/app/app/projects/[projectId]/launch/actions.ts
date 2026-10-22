"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { HealthResult } from "@/core/launch/health";
import { deploymentIndexSha, runLiveCheck } from "@/server/launch/health";
import { platformPause } from "@/server/platform/state";
import { siteDomain } from "@/server/publish/config";
import { getSite } from "@/server/publish/store";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadAppContext } from "@/server/workspace/context";

export type LiveCheckState = { status: "idle" } | { status: "done"; result: HealthResult; checkedAt: string } | { status: "error"; message: string };

/**
 * Checks the project's live site from Farbaek's server and records the
 * result (ADR 0033). Any member may check; the database limits how often.
 */
export async function checkLiveSiteAction(projectId: string): Promise<LiveCheckState> {
  const id = z.uuid().safeParse(projectId);
  if (!id.success) return { status: "error", message: "That project doesn't exist in this workspace." };
  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in");
  if (ctx.mode !== "live" || !ctx.current) return { status: "error", message: "Live checks run on real sites, not in the demo workspace." };
  const paused = platformPause("serve_published_sites");
  if (paused) return { status: "error", message: `Farbaek has paused published sites for a short while, so there's nothing to check. ${paused}` };

  const [user, admin] = [await createSupabaseServerClient(), createSupabaseAdminClient()];
  if (!user || !admin) return { status: "error", message: "The server isn't configured for this yet." };
  const site = await getSite(user, ctx.current.id, id.data).catch(() => null);
  if (!site?.liveDeploymentId) return { status: "error", message: "Nothing is live for this project, so there's no site to check." };
  if (site.blocked) return { status: "error", message: "Farbaek has taken this site offline, so visitors see that it isn't available." };

  const outcome = await runLiveCheck({
    admin,
    actor: ctx.user.id,
    domain: siteDomain(),
    site: { id: site.id, name: site.name },
    deploymentId: site.liveDeploymentId,
    indexSha256: await deploymentIndexSha(user, ctx.current.id, site.liveDeploymentId),
  });
  if (!outcome.ok) return { status: "error", message: outcome.message };
  refresh();
  return { status: "done", result: outcome.result, checkedAt: new Date().toISOString() };
}
