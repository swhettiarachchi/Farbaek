import { siteDomain } from "@/server/publish/config";
import { handleSiteRequest, type ServedSite } from "@/server/publish/serve";
import { revisionContentAsSystem, siteForServingAsSystem, siteNameForDomainAsSystem } from "@/server/publish/store";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

export const dynamic = "force-dynamic";

// What a name is doing is looked up again every few seconds, so a rollback or a takedown shows quickly.
const sites = new Map<string, { live: ServedSite; until: number }>();
// Custom domains (ADR 0045), looked up again every few seconds so a removed domain stops quickly.
const domains = new Map<string, { name: string | null; until: number }>();
// A stored revision never changes, so its text or an image's bytes can be kept as long as there's room.
const contents = new Map<string, string | Uint8Array>();
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
      const live = await siteForServingAsSystem(admin, name);
      if (sites.size > 2_000) sites.clear();
      sites.set(name, { live, until: Date.now() + 10_000 });
      return live;
    },
    async nameForDomain(hostname) {
      const cached = domains.get(hostname);
      if (cached && cached.until > Date.now()) return cached.name;
      const name = await siteNameForDomainAsSystem(admin, hostname);
      if (domains.size > 2_000) domains.clear();
      domains.set(hostname, { name, until: Date.now() + 10_000 });
      return name;
    },
    async content(projectId, path, revision) {
      const key = `${projectId}:${revision}:${path}`;
      const hit = contents.get(key);
      if (hit !== undefined) return hit;
      const content = await revisionContentAsSystem(admin, projectId, path, revision);
      if (content !== null && content.length < 512 * 1024) {
        if (contents.size >= MAX_CONTENT_ENTRIES) contents.delete(contents.keys().next().value!);
        contents.set(key, content);
      }
      return content;
    },
  });
}

export const GET = handle;
export const HEAD = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
