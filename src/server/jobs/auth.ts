/**
 * Internal job routes (ADR 0063) are called by the server's own timers with
 * "Authorization: Bearer $SANDBOX_CRON_SECRET", the scheduler's secret, from
 * inside the app container. Not part of the public API.
 */
import { createHash, timingSafeEqual } from "node:crypto";

function matches(given: string, expected: string): boolean {
  // Hash both so the comparison is constant-time regardless of length.
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** "missing" when the server has no secret, "denied" for a wrong or absent token. */
export function checkSchedulerToken(request: Request, secret: string | null | undefined): "ok" | "missing" | "denied" {
  if (!secret) return "missing";
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/)?.[1] ?? "";
  return matches(token, secret) ? "ok" : "denied";
}
