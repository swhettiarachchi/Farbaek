import { deploymentInfo } from "@/server/deployment";

/**
 * Liveness for the host's health check (the VPS deploy script and Docker use /api/health). It touches no
 * database or provider, so it stays fast and cheap, and it returns only the
 * deployed commit, which isn't a secret.
 */
export const dynamic = "force-dynamic";

export function GET(): Response {
  const commit = deploymentInfo().commit?.slice(0, 12) ?? null;
  return Response.json({ ok: true, commit }, { headers: { "Cache-Control": "no-store" } });
}
