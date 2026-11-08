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
 * has stopped or keeps failing. The public sees only whether Farbaek is ready
 * (stage 171): which part failed, and which job is late, is on Office Space's
 * Health page. An answer is reused for 15 seconds, so asking costs nothing.
 */
let last: { at: number; ok: boolean } | null = null;

async function ready(): Promise<boolean> {
  const disk = await readDisk();
  const admin = createSupabaseAdminClient();
  if (!admin) return false;
  const timeout = new Promise<{ error: true }>((resolve) => setTimeout(() => resolve({ error: true }), 5_000));
  const query = admin
    .from("organizations")
    .select("id", { head: true, count: "estimated" })
    .limit(1)
    .then(({ error }) => ({ error: Boolean(error) }));
  const { error } = await Promise.race([query, timeout]);
  if (error) return false;
  // Jobs that never reported don't count: a fresh server isn't failing.
  const statuses = await readJobStatuses(admin, new Date());
  const late = statuses ? jobsNeedingALook(statuses) : [];
  return disk !== "low" && late.length === 0;
}

export async function GET() {
  const now = Date.now();
  if (!last || now - last.at > 15_000) last = { at: now, ok: await ready() };
  return Response.json({ ok: last.ok }, { status: last.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
