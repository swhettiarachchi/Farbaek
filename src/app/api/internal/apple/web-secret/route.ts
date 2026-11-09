import { appleSignInKey, appleWebSecret } from "@/server/auth/apple";
import { checkSchedulerToken } from "@/server/jobs/auth";
import { problem } from "@/server/sandbox/http";
import { readSandboxConfig } from "@/server/sandbox/config";

export const dynamic = "force-dynamic";

/**
 * POST /api/internal/apple/web-secret (ADR 0114), called from inside the app
 * container by scripts/vps/apple-web-secret.sh with the scheduler's secret.
 * Answers Auth's next Sign in with Apple client secret as two settings lines,
 * which the script passes straight into Auth's settings file: the secret
 * never reaches a screen, a command line or a log.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = checkSchedulerToken(request, readSandboxConfig().cronSecret);
  if (auth === "missing") return problem(503, "NOT_CONFIGURED", "Not configured.");
  if (auth === "denied") return problem(401, "UNAUTHENTICATED", "Not allowed.");
  const key = appleSignInKey();
  if (!key) return problem(503, "NO_KEY", "Not configured.");
  const { secret, expiresAt } = appleWebSecret(key, new Date());
  return new Response(`FARBAEK_APPLE_SECRET=${secret}\nFARBAEK_APPLE_SECRET_EXPIRES=${expiresAt}\n`, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
