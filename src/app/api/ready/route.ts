import { readDisk } from "@/server/ops/disk";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/ready, for uptime monitors (ADR 0065). Unlike /api/health, which
 * the deploy uses to see the app answer, this also asks the database and
 * checks the server's free disk space, so a monitor goes red when Postgres is
 * down or about to run out of room. It says what failed, never why in detail:
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
  const ok = !error && disk !== "low";
  return Response.json(error ? { ok: false, database: "unreachable", disk } : { ok, database: "ok", disk, ms }, { status: ok ? 200 : 503, headers });
}
