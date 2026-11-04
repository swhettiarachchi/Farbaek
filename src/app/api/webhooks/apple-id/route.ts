/**
 * Apple's server-to-server notifications for Sign in with Apple (ADR 0114):
 * consent revoked, Apple Account deleted, and Hide My Email forwarding turned
 * off or on. Set on the App ID com.farbaek.app in Apple's developer portal.
 * Nothing counts before the token's signature checks out against Apple's
 * published keys.
 */
import { receiveAppleIdNotification } from "@/server/auth/apple-notifications";
import { appleIdNotificationDeps } from "@/server/auth/apple-wiring";
import { log } from "@/server/observability/log";
import { readTextCapped } from "@/server/http/body";

export const dynamic = "force-dynamic";

const plain = (status: number) => new Response(null, { status, headers: { "cache-control": "no-store" } });

/** Apple sends {"payload": "<token>"}; a form-encoded body is read too. */
function parse(text: string, contentType: string): unknown {
  if (contentType.includes("application/x-www-form-urlencoded")) return { payload: new URLSearchParams(text).get("payload") };
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  const deps = appleIdNotificationDeps();
  if (!deps) return plain(503);
  const text = await readTextCapped(request, 16_000);
  if (text === null) return plain(413);
  try {
    const r = await receiveAppleIdNotification(deps, parse(text, request.headers.get("content-type") ?? ""));
    log(r.status === 200 ? "info" : "warn", "apple_id.notification", { outcome: r.outcome });
    return plain(r.status);
  } catch (e) {
    log("error", "apple_id.notification_error", { error: e instanceof Error ? e.message.slice(0, 200) : "unknown" });
    return plain(500);
  }
}
