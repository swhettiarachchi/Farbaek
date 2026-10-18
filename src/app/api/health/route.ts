/**
 * Liveness for the host's health check (Railway: /api/health). It touches no
 * database or provider, so it stays fast and cheap, and it returns only the
 * deployed commit, which isn't a secret.
 */
export const dynamic = "force-dynamic";

export function GET(): Response {
  const commit = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 12) ?? null;
  return Response.json({ ok: true, commit }, { headers: { "Cache-Control": "no-store" } });
}
