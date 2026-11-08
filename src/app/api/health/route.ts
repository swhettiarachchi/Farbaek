import { deploymentInfo, publicBuildId } from "@/server/deployment";

/**
 * Liveness for the host's health check (the VPS deploy script and Docker use /api/health). It touches no
 * database or provider, so it stays fast and cheap. It says only that the app answers, and an opaque id of
 * the build (publicBuildId), never the commit itself.
 */
export const dynamic = "force-dynamic";

export function GET(): Response {
  const build = publicBuildId(deploymentInfo().commit);
  return Response.json({ ok: true, build }, { headers: { "Cache-Control": "no-store" } });
}
