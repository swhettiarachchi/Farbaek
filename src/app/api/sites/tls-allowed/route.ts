import { siteDomain } from "@/server/publish/config";
import { tlsAllowed } from "@/server/publish/domains";
import { siteForServingAsSystem, siteNameForDomainAsSystem } from "@/server/publish/store";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

export const dynamic = "force-dynamic";

// Caddy asks before each new certificate and again at renewal; answers are kept briefly.
const answers = new Map<string, { allowed: boolean; until: number }>();

const reply = (allowed: boolean) =>
  new Response(allowed ? "ok" : "no", { status: allowed ? 200 : 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });

/**
 * Caddy's on-demand TLS question (ADR 0045): may this name have a
 * certificate? Yes only for a live site's name on the site domain, or a
 * verified custom domain whose site is live. It reveals nothing a visit
 * to the name wouldn't.
 */
export async function GET(request: Request): Promise<Response> {
  const domain = new URL(request.url).searchParams.get("domain")?.trim().toLowerCase() ?? "";
  if (!domain || domain.length > 253) return reply(false);
  const cached = answers.get(domain);
  if (cached && cached.until > Date.now()) return reply(cached.allowed);
  const admin = createSupabaseAdminClient();
  if (!admin) return reply(false);
  const allowed = await tlsAllowed(domain, {
    domain: siteDomain(),
    liveSite: (name) => siteForServingAsSystem(admin, name),
    nameForDomain: (hostname) => siteNameForDomainAsSystem(admin, hostname),
  }).catch(() => false);
  if (answers.size > 5_000) answers.clear();
  answers.set(domain, { allowed, until: Date.now() + 30_000 });
  return reply(allowed);
}
