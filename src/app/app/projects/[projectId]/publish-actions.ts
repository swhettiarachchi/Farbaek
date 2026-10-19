"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { publishDeps } from "@/server/publish/panel";
import { publishSite } from "@/server/publish/publish";
import { getSite, setLiveDeployment } from "@/server/publish/store";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadAppContext } from "@/server/workspace/context";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";

export type PublishState = { status: "idle" } | { status: "error"; message: string } | { status: "done"; message: string };

async function writer() {
  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in");
  if (ctx.mode !== "live") return { error: "Publishing needs a real workspace." };
  if (!ctx.writes.enabled) return { error: ctx.writes.reason };
  if (!ctx.current || !ctx.role) return { error: "Create or join a workspace first." };
  if (!CONTRIBUTOR_ROLES.includes(ctx.role)) return { error: "Your role can view this project but not publish it." };
  const [user, admin] = [await createSupabaseServerClient(), createSupabaseAdminClient()];
  if (!user || !admin) return { error: "The server isn't configured for writes." };
  return { ctx, user, admin, orgId: ctx.current.id };
}

/** Publishes the project's current files (ADR 0029). The gate is checked here and again in the database. */
export async function publishAction(_previous: PublishState, form: FormData): Promise<PublishState> {
  const parsed = z.object({ projectId: z.uuid(), name: z.string().max(80) }).safeParse({ projectId: form.get("projectId"), name: form.get("name") });
  if (!parsed.success) return { status: "error", message: "Reload the page and try again." };
  const w = await writer();
  if ("error" in w) return { status: "error", message: w.error! };
  const r = await publishSite(publishDeps(w.ctx, w.user, w.admin), { orgId: w.orgId, userId: w.ctx.user.id, projectId: parsed.data.projectId, name: parsed.data.name });
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath(`/app/projects/${parsed.data.projectId}`);
  return { status: "done", message: "Published. It can take a few seconds to appear everywhere." };
}

/** Makes an earlier deployment live again, or takes the site offline (an empty deployment id). */
export async function setLiveAction(_previous: PublishState, form: FormData): Promise<PublishState> {
  const parsed = z.object({ projectId: z.uuid(), deploymentId: z.union([z.uuid(), z.literal("")]) }).safeParse({ projectId: form.get("projectId"), deploymentId: form.get("deploymentId") ?? "" });
  if (!parsed.success) return { status: "error", message: "Reload the page and try again." };
  const w = await writer();
  if ("error" in w) return { status: "error", message: w.error! };
  // The site is read through Row Level Security, so it must be this workspace's.
  const site = await getSite(w.user, w.orgId, parsed.data.projectId);
  if (!site) return { status: "error", message: "This project has no published site. Reload the page." };
  const offline = !parsed.data.deploymentId;
  const r = await setLiveDeployment(w.admin, { orgId: w.orgId, actor: w.ctx.user.id, siteId: site.id, deploymentId: parsed.data.deploymentId || null });
  if (!r.ok) return { status: "error", message: r.error === "FORBIDDEN" ? "Your role can view this project but not publish it." : `Couldn't ${offline ? "take the site offline" : "make that version live"}. Reload the page and try again.` };
  revalidatePath(`/app/projects/${parsed.data.projectId}`);
  return { status: "done", message: offline ? "The site is offline. It can take a few seconds to disappear everywhere." : "That version is live again. It can take a few seconds to appear everywhere." };
}
