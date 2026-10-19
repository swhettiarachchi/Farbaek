/**
 * What the project page's Publish panel shows (ADR 0029): the site and its
 * address, what's live, the deployment history, whether the files changed
 * since the live version, and what (if anything) stops the next publish.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasUnpublishedChanges, siteNameFrom, type PublishBlock } from "@/core/publish/site";
import type { AppContext } from "@/server/workspace/context";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";
import { siteAddress, siteDomain } from "./config";
import { publishReadiness, type PublishCheck, type PublishDeps } from "./publish";
import { getSite, latestCheck, listDeployments, publishRpc, type DeploymentView, type SiteView } from "./store";

export function publishDeps(ctx: AppContext, user: SupabaseClient, admin: SupabaseClient | null): PublishDeps {
  return {
    domain: siteDomain(),
    canPublish: async () => ctx.role !== null && CONTRIBUTOR_ROLES.includes(ctx.role),
    files: (orgId, projectId) => ctx.reader.listFiles(orgId, projectId),
    latestCheck: (orgId, projectId) => latestCheck(user, orgId, projectId),
    publish: async (input) => (admin ? publishRpc(admin, input) : { ok: false, error: "NOT_CONFIGURED" }),
  };
}

export interface PublishPanelData {
  domain: string | null;
  site: SiteView | null;
  address: string | null;
  suggestedName: string;
  live: DeploymentView | null;
  deployments: DeploymentView[];
  block: PublishBlock | null;
  check: PublishCheck | null;
  unpublishedChanges: boolean;
}

export async function loadPublishPanel(ctx: AppContext, user: SupabaseClient, project: { id: string; name: string }): Promise<PublishPanelData> {
  const orgId = ctx.current!.id;
  const site = await getSite(user, orgId, project.id);
  const [deployments, ready] = await Promise.all([site ? listDeployments(user, orgId, site.id) : Promise.resolve([]), publishReadiness(publishDeps(ctx, user, null), orgId, project.id)]);
  const live = deployments.find((d) => d.id === site?.liveDeploymentId) ?? null;
  return {
    domain: siteDomain(),
    site,
    address: site ? siteAddress(site.name) : null,
    suggestedName: site?.name ?? siteNameFrom(project.name),
    live,
    deployments,
    block: ready.block,
    check: ready.check,
    unpublishedChanges: ready.digest ? hasUnpublishedChanges(live?.digest ?? null, ready.digest) : false,
  };
}
