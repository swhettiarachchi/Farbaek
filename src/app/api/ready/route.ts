import { createSupabaseAdminClient } from "@/server/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/ready, for uptime monitors (ADR 0065). Unlike /api/health, which
 * the deploy uses to see the app answer, this also asks the database, so a
 * monitor goes red when Postgres is down. It says what failed, never why in
 * detail: no hosts, keys or errors.
 */
export async function GET() {
  const admin = createSupabaseAdminClient();
  if (!admin) return Response.json({ ok: false, database: "not configured" }, { status: 503, headers: { "cache-control": "no-store" } });
  const started = Date.now();
  const timeout = new Promise<{ error: true }>((resolve) => setTimeout(() => resolve({ error: true }), 5_000));
  const query = admin
    .from("organizations")
    .select("id", { head: true, count: "estimated" })
    .limit(1)
    .then(({ error }) => ({ error: Boolean(error) }));
  const { error } = await Promise.race([query, timeout]);
  const ms = Date.now() - started;
  return Response.json(error ? { ok: false, database: "unreachable" } : { ok: true, database: "ok", ms }, { status: error ? 503 : 200, headers: { "cache-control": "no-store" } });
}
