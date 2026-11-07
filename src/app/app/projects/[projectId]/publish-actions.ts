"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { addSiteDomain, checkSiteDomain, removeSiteDomain } from "@/server/publish/domains";
import { domainDeps, publishDeps } from "@/server/publish/panel";
import { publishSite } from "@/server/publish/publish";
import { getSite, setLiveDeployment } from "@/server/publish/store";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadAppContext } from "@/server/workspace/context";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";
import { may, withheldReason } from "@/core/workspace/permissions";

export type PublishState = { status: "idle" } | { status: "error"; message: string } | { status: "done"; message: string };

async function writer() {
  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in");
  if (ctx.mode !== "live") return { error: "Publishing needs a real workspace." };
  if (!ctx.writes.enabled) return { error: ctx.writes.reason };
  if (!ctx.current || !ctx.role) return { error: "Create or join a workspace first." };
  if (!CONTRIBUTOR_ROLES.includes(ctx.role)) return { error: "Your role can view this project but not publish it." };
  const [user, admin] = [await createSupabaseServerClient(), createSupabaseAdminClient()];
  if (!user || !admin) return { error: "Farbaek's server isn't set up to save changes yet. Write to support@farbaek.com." };
  return { ctx, user, admin, orgId: ctx.current.id };
}

/**
 * Publishes the project's current files (ADR 0029). The gate is checked here and again in the database.
 * Without verified evidence (ADR 0050), an owner or admin's reason goes with it.
 */
export async function publishAction(_previous: PublishState, form: FormData): Promise<PublishState> {
  const parsed = z
    .object({ projectId: z.uuid(), name: z.string().max(80), overrideReason: z.string().max(600).nullable() })
    .safeParse({ projectId: form.get("projectId"), name: form.get("name"), overrideReason: form.get("overrideReason") });
  if (!parsed.success) return { status: "error", message: "Reload the page and try again." };
  const w = await writer();
  if ("error" in w) return { status: "error", message: w.error! };
  if (!may(w.ctx.role, w.ctx.permissions, "publish")) return { status: "error", message: withheldReason("publish") };
  const r = await publishSite(publishDeps(w.ctx, w.user, w.admin), {
    orgId: w.orgId,
    userId: w.ctx.user.id,
    projectId: parsed.data.projectId,
    name: parsed.data.name,
    overrideReason: parsed.data.overrideReason,
  });
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath(`/app/projects/${parsed.data.projectId}`);
  revalidatePath(`/app/projects/${parsed.data.projectId}/launch`);
  return {
    status: "done",
    message: r.overridden
      ? "Published without passed checks. Your reason is saved with this version. It can take a few seconds to appear everywhere."
      : "Published. It can take a few seconds to appear everywhere.",
  };
}

/** Makes an earlier deployment live again, or takes the site offline (an empty deployment id). */
export async function setLiveAction(_previous: PublishState, form: FormData): Promise<PublishState> {
  const parsed = z.object({ projectId: z.uuid(), deploymentId: z.union([z.uuid(), z.literal("")]) }).safeParse({ projectId: form.get("projectId"), deploymentId: form.get("deploymentId") ?? "" });
  if (!parsed.success) return { status: "error", message: "Reload the page and try again." };
  const w = await writer();
  if ("error" in w) return { status: "error", message: w.error! };
  if (!may(w.ctx.role, w.ctx.permissions, "publish")) return { status: "error", message: withheldReason("publish") };
  // The site is read through Row Level Security, so it must be this workspace's.
  const site = await getSite(w.user, w.orgId, parsed.data.projectId);
  if (!site) return { status: "error", message: "This project has no published site. Reload the page." };
  const offline = !parsed.data.deploymentId;
  const r = await setLiveDeployment(w.admin, { orgId: w.orgId, actor: w.ctx.user.id, siteId: site.id, deploymentId: parsed.data.deploymentId || null });
  if (!r.ok) return { status: "error", message: r.error.includes("PERMISSION_WITHHELD") ? withheldReason("publish") : r.error === "FORBIDDEN" ? "Your role can view this project but not publish it." : `Couldn't ${offline ? "take the site offline" : "make that version live"}. Reload the page and try again.` };
  revalidatePath(`/app/projects/${parsed.data.projectId}`);
  return { status: "done", message: offline ? "The site is offline. It can take a few seconds to disappear everywhere." : "That version is live again. It can take a few seconds to appear everywhere." };
}

/** Connects one of the person's own domains to the project's site, as pending until its DNS is checked (ADR 0045). */
export async function addDomainAction(_previous: PublishState, form: FormData): Promise<PublishState> {
  const parsed = z.object({ projectId: z.uuid(), domain: z.string().max(300) }).safeParse({ projectId: form.get("projectId"), domain: form.get("domain") });
  if (!parsed.success) return { status: "error", message: "Enter a domain, such as www.example.com." };
  const w = await writer();
  if ("error" in w) return { status: "error", message: w.error! };
  if (!may(w.ctx.role, w.ctx.permissions, "publish")) return { status: "error", message: withheldReason("publish") };
  const site = await getSite(w.user, w.orgId, parsed.data.projectId);
  if (!site) return { status: "error", message: "Publish the site first, then connect a domain." };
  const r = await addSiteDomain(domainDeps(w.ctx, w.user, w.admin), { orgId: w.orgId, userId: w.ctx.user.id, siteId: site.id, domain: parsed.data.domain });
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath(`/app/projects/${parsed.data.projectId}`);
  return { status: "done", message: `Added ${r.value.hostname}. Set the two DNS records below, then check.` };
}

/** Reads the domain's DNS now and marks it verified when the records are in place. */
export async function checkDomainAction(_previous: PublishState, form: FormData): Promise<PublishState> {
  const parsed = z.object({ projectId: z.uuid(), domainId: z.uuid() }).safeParse({ projectId: form.get("projectId"), domainId: form.get("domainId") });
  if (!parsed.success) return { status: "error", message: "Reload the page and try again." };
  const w = await writer();
  if ("error" in w) return { status: "error", message: w.error! };
  if (!may(w.ctx.role, w.ctx.permissions, "publish")) return { status: "error", message: withheldReason("publish") };
  const r = await checkSiteDomain(domainDeps(w.ctx, w.user, w.admin), { orgId: w.orgId, userId: w.ctx.user.id, domainId: parsed.data.domainId });
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath(`/app/projects/${parsed.data.projectId}`);
  return r.value.verified ? { status: "done", message: r.value.message } : { status: "error", message: r.value.message };
}

/** Disconnects one of the site's own domains. The site stays live at its Farbaek address. */
export async function removeDomainAction(_previous: PublishState, form: FormData): Promise<PublishState> {
  const parsed = z.object({ projectId: z.uuid(), domainId: z.uuid() }).safeParse({ projectId: form.get("projectId"), domainId: form.get("domainId") });
  if (!parsed.success) return { status: "error", message: "Reload the page and try again." };
  const w = await writer();
  if ("error" in w) return { status: "error", message: w.error! };
  if (!may(w.ctx.role, w.ctx.permissions, "publish")) return { status: "error", message: withheldReason("publish") };
  const r = await removeSiteDomain(domainDeps(w.ctx, w.user, w.admin), { orgId: w.orgId, userId: w.ctx.user.id, domainId: parsed.data.domainId });
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath(`/app/projects/${parsed.data.projectId}`);
  return { status: "done", message: "Domain removed. The site stays live at its Farbaek address." };
}
