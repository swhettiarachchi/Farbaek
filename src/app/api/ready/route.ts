import { jobsNeedingALook } from "@/core/ops/jobs";
import { readDisk } from "@/server/ops/disk";
import { readJobStatuses } from "@/server/ops/jobs";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/ready, for uptime monitors (ADR 0065). Unlike /api/health, which
 * the deploy uses to see the app answer, this also asks the database, checks
 * the server's free disk space and the background jobs (ADR 0071), so a
 * monitor goes red when Postgres is down, about to run out of room, or a job
 * has stopped or keeps failing. It says what failed, never why in detail:
 * no hosts, keys, sizes or errors.
 */
export async function GET() {
  const headers = { "cache-control": "no-store" };
  const disk = await readDisk();
  const admin = createSupabaseAdminClient();
  if (!admin) return Response.json({ ok: false, database: "not configured", disk }, { status: 503, headers });
  const started = Date.now();
  const timeout = new Promise<{ error: true }>((resolve) => setTimeout(() => resolve({ error: true }), 5_000));
  const query = admin
    .from("organizations")
    .select("id", { head: true, count: "estimated" })
    .limit(1)
    .then(({ error }) => ({ error: Boolean(error) }));
  const { error } = await Promise.race([query, timeout]);
  const ms = Date.now() - started;
  if (error) return Response.json({ ok: false, database: "unreachable", disk }, { status: 503, headers });
  // Jobs that never reported don't count: a fresh server isn't failing.
  const statuses = await readJobStatuses(admin, new Date());
  const late = statuses ? jobsNeedingALook(statuses) : [];
  const jobs = statuses === null ? "unknown" : late.length > 0 ? "late" : "ok";
  const ok = disk !== "low" && late.length === 0;
  return Response.json({ ok, database: "ok", disk, jobs, ...(late.length > 0 ? { late } : {}), ms }, { status: ok ? 200 : 503, headers });
}
