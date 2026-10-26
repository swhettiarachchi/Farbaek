/**
 * LaunchOS's dependencies on this server (ADR 0078, ADR 0093): the store
 * through the service-role functions, the token vault's key, Vercel's and
 * Netlify's APIs, the project's files as the person reads them, and one fetch
 * of a ready launch's address (only ever https on *.vercel.app or
 * *.netlify.app, checked before it gets here).
 */
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import type { AppContext } from "@/server/workspace/context";
import { fileSha256, type LaunchDeps } from "./provider-launch";
import { createNetlifyClient } from "./netlify-client";
import { createSupabaseLaunchStore } from "./provider-store";
import { vaultKey } from "./token-vault";
import { createVercelClient } from "./vercel-client";

async function probe(url: string): Promise<number> {
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(8_000), headers: { "user-agent": "Farbaek-live-check (+https://www.farbaek.com)" } });
    await res.body?.cancel().catch(() => undefined);
    return res.status;
  } catch {
    return 0;
  }
}

export function launchDeps(ctx: AppContext): LaunchDeps | null {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  return {
    store: createSupabaseLaunchStore(admin),
    key: vaultKey(),
    vercel: (token, teamId) => createVercelClient(token, { teamId }),
    netlify: (token, accountSlug) => createNetlifyClient(token, { accountSlug }),
    files: async (orgId, projectId) => (await ctx.reader.getProjectContents(orgId, projectId)).map((f) => ({ ...f, sha256: fileSha256(f.content) })),
    probe,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
}
