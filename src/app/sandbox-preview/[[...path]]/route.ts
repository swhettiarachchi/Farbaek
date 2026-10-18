import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { readSandboxConfig } from "@/server/sandbox/config";
import { handlePreviewRequest } from "@/server/sandbox/gateway";
import { resolveSandboxRuntime } from "@/server/sandbox/registry";
import { createSupabaseSandboxStore } from "@/server/sandbox/supabase-store";

export const dynamic = "force-dynamic";

/**
 * The preview gateway's entry point. Only requests on a preview host reach
 * it (src/proxy.ts rewrites them); requests on the app's own host get 404
 * from the gateway's host check.
 */
async function handle(request: Request): Promise<Response> {
  const config = readSandboxConfig();
  const admin = createSupabaseAdminClient();
  if (!admin) return new Response("Not found", { status: 404 });
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  let appOrigin = "http://localhost:3000";
  try {
    appOrigin = new URL(site).origin;
  } catch {
    // keep the default
  }
  return handlePreviewRequest(request, {
    config,
    store: createSupabaseSandboxStore(null, admin),
    runtime: resolveSandboxRuntime(config).runtime,
    now: () => new Date(),
    appOrigin,
  });
}

export const GET = handle;
export const HEAD = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
