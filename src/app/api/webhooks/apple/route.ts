/**
 * App Store Server Notifications, version 2 (ADR 0112). Apple posts a signed
 * payload for each renewal, failed payment, cancellation, refund and expiry;
 * nothing counts before its signature checks out against Apple's root.
 * Anything but 200 makes Apple send it again later.
 */
import { IOS_APP } from "@/config/ios-app";
import { receiveAppleNotification } from "@/server/billing/apple/service";
import { appleDeps, appleIapOn } from "@/server/billing/apple/wiring";
import { log } from "@/server/observability/log";

export const dynamic = "force-dynamic";

const plain = (status: number) => new Response(null, { status, headers: { "cache-control": "no-store" } });

export async function POST(request: Request): Promise<Response> {
  if (!appleIapOn()) return plain(503);
  const deps = appleDeps();
  if (!deps) return plain(503);
  const text = await request.text();
  if (text.length > 200_000) return plain(413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return plain(400);
  }
  try {
    const r = await receiveAppleNotification(deps, body, IOS_APP.appleId);
    log(r.status === 200 ? "info" : "warn", "apple.notification", { outcome: r.outcome });
    return plain(r.status);
  } catch (e) {
    log("error", "apple.notification_error", { error: e instanceof Error ? e.message.slice(0, 200) : "unknown" });
    return plain(500);
  }
}
