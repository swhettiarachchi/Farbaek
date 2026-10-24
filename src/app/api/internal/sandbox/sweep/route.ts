import { checkSchedulerToken } from "@/server/jobs/auth";
import { log } from "@/server/observability/log";
import { readSandboxConfig } from "@/server/sandbox/config";
import { json, problem } from "@/server/sandbox/http";
import { resolveSandboxRuntime } from "@/server/sandbox/registry";
import { createSandboxService } from "@/server/sandbox/service";
import { createSupabaseSandboxStore } from "@/server/sandbox/supabase-store";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/internal/sandbox/sweep, called by a scheduler every few minutes
 * with "Authorization: Bearer $SANDBOX_CRON_SECRET". Ends expired and idle
 * sessions, finishes cleanups, closes lost commands, destroys orphaned
 * runtime sandboxes and prunes old history. Not part of the public API.
 */
export async function POST(request: Request) {
  const config = readSandboxConfig();
  const auth = checkSchedulerToken(request, config.cronSecret);
  if (auth === "missing") return problem(503, "NOT_CONFIGURED", "SANDBOX_CRON_SECRET isn't set on this server.");
  if (auth === "denied") return problem(401, "UNAUTHENTICATED", "Not allowed.");
  const admin = createSupabaseAdminClient();
  if (!admin) return problem(503, "NOT_CONFIGURED", "The server key for writes isn't set.");

  const service = createSandboxService({
    store: createSupabaseSandboxStore(null, admin),
    resolution: resolveSandboxRuntime(config),
    role: async () => null,
    billing: async () => null,
    now: () => new Date(),
    randomKey: () => crypto.randomUUID(),
  });
  try {
    return json({ data: await service.sweep() });
  } catch (e) {
    log("error", "sandbox.sweep_failed", { error: e instanceof Error ? e.message : String(e) });
    return problem(500, "INTERNAL", "The sweep failed; it is safe to run again.");
  }
}
