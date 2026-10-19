import type { PublishedFile } from "@/core/publish/site";
import { siteDomain } from "@/server/publish/config";
import { handleSiteRequest } from "@/server/publish/serve";
import { liveSiteAsSystem, revisionContentAsSystem } from "@/server/publish/store";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

export const dynamic = "force-dynamic";

type Live = { deploymentId: string; projectId: string; files: PublishedFile[] } | null;

// Which deployment is live is looked up again every few seconds, so a rollback shows quickly.
const sites = new Map<string, { live: Live; until: number }>();
// A stored revision never changes, so its text can be kept as long as there's room.
const contents = new Map<string, string>();
const MAX_CONTENT_ENTRIES = 400;

/**
 * Published sites' entry point (ADR 0029). Only site hosts on the site
 * domain reach it (src/proxy.ts rewrites them), and the handler checks the
 * host again, so Farbaek's own host never serves people's files.
 */
async function handle(request: Request): Promise<Response> {
  const admin = createSupabaseAdminClient();
  if (!admin) return new Response("Not found", { status: 404 });
  return handleSiteRequest(request, {
    domain: siteDomain(),
    async liveSite(name) {
      const cached = sites.get(name);
      if (cached && cached.until > Date.now()) return cached.live;
      const live = await liveSiteAsSystem(admin, name);
      if (sites.size > 2_000) sites.clear();
      sites.set(name, { live, until: Date.now() + 10_000 });
      return live;
    },
    async content(projectId, path, revision) {
      const key = `${projectId}:${revision}:${path}`;
      const hit = contents.get(key);
      if (hit !== undefined) return hit;
      const text = await revisionContentAsSystem(admin, projectId, path, revision);
      if (text !== null && text.length < 512 * 1024) {
        if (contents.size >= MAX_CONTENT_ENTRIES) contents.delete(contents.keys().next().value!);
        contents.set(key, text);
      }
      return text;
    },
  });
}

export const GET = handle;
export const HEAD = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
