/**
 * What the project page's Publish panel shows (ADR 0029): the site and its
 * address, what's live, the deployment history, whether the files changed
 * since the live version, what (if anything) stops the next publish, and
 * the evidence behind it (ADR 0050).
 */
import { may } from "@/core/workspace/permissions";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LaunchEvidence } from "@/core/publish/evidence";
import { hasUnpublishedChanges, siteNameFrom, type PublishBlock } from "@/core/publish/site";
import type { AppContext } from "@/server/workspace/context";
import { CONTRIBUTOR_ROLES, MANAGER_ROLES } from "@/server/workspace/types";
import { randomInt } from "node:crypto";
import type { DnsRecord } from "@/core/publish/domains";
import { appZone } from "@/server/http/hosts";
import { appHostFromEnv } from "@/server/office/config";
import { siteAddress, siteDomain, siteTarget } from "./config";
import { createDnsLookup } from "./dns";
import { recordsFor, type DomainDeps, type SiteDomainView } from "./domains";
import { publishReadiness, type PublishCheck, type PublishDeps } from "./publish";
import { addDomainRpc, getSite, latestCheck, latestEvidence, listDeployments, listSiteDomains, loadSiteDomain, markDomainRpc, publishRpc, removeDomainRpc, type DeploymentView, type SiteView } from "./store";

const TOKEN_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Custom domains (ADR 0045): reads as the person, writes through the server's functions. */
export function domainDeps(ctx: AppContext, user: SupabaseClient, admin: SupabaseClient): DomainDeps {
  const domain = siteDomain();
  return {
    canChange: async () => ctx.role !== null && CONTRIBUTOR_ROLES.includes(ctx.role) && may(ctx.role, ctx.permissions, "publish"),
    target: siteTarget(domain),
    reserved: [domain, appZone(appHostFromEnv())].filter((z): z is string => Boolean(z)),
    add: (i) => addDomainRpc(admin, i),
    mark: (i) => markDomainRpc(admin, i),
    remove: (i) => removeDomainRpc(admin, i),
    load: (orgId, id) => loadSiteDomain(user, orgId, id),
    dns: createDnsLookup(),
    token: () => Array.from({ length: 32 }, () => TOKEN_ALPHABET[randomInt(TOKEN_ALPHABET.length)]).join(""),
    now: () => new Date(),
  };
}

export function publishDeps(ctx: AppContext, user: SupabaseClient, admin: SupabaseClient | null): PublishDeps {
  return {
    domain: siteDomain(),
    canPublish: async () => ctx.role !== null && CONTRIBUTOR_ROLES.includes(ctx.role),
    files: (orgId, projectId) => ctx.reader.listFiles(orgId, projectId),
    packageJson: async (orgId, projectId) => (await ctx.reader.getFile(orgId, projectId, "package.json"))?.content ?? null,
    latestCheck: (orgId, projectId) => latestCheck(user, orgId, projectId),
    evidence: (orgId, projectId) => latestEvidence(user, orgId, projectId),
    canOverride: async () => ctx.role !== null && MANAGER_ROLES.includes(ctx.role),
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
  /** What evidence covers the files now; without "verified", publishing needs a reason. */
  evidence: LaunchEvidence;
  needsOverride: boolean;
  canOverride: boolean;
  unpublishedChanges: boolean;
  /** The site's own domains, each with the DNS records it needs (ADR 0045). */
  domains: (SiteDomainView & { records: DnsRecord[] | null })[];
  /** Whether domains can be added on this server (sites connected). */
  domainsAvailable: boolean;
}

export async function loadPublishPanel(ctx: AppContext, user: SupabaseClient, project: { id: string; name: string }): Promise<PublishPanelData> {
  const orgId = ctx.current!.id;
  const site = await getSite(user, orgId, project.id);
  const [deployments, ready, domains] = await Promise.all([
    site ? listDeployments(user, orgId, site.id) : Promise.resolve([]),
    publishReadiness(publishDeps(ctx, user, null), orgId, project.id),
    site ? listSiteDomains(user, orgId, site.id).catch(() => []) : Promise.resolve([]),
  ]);
  const target = siteTarget();
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
    evidence: ready.evidence,
    needsOverride: ready.needsOverride,
    canOverride: ctx.role !== null && MANAGER_ROLES.includes(ctx.role),
    unpublishedChanges: ready.digest ? hasUnpublishedChanges(live?.digest ?? null, ready.digest) : false,
    domains: domains.map((d) => ({ ...d, records: recordsFor(d, target) })),
    domainsAvailable: target !== null,
  };
}
