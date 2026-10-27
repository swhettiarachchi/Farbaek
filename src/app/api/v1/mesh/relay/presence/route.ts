import { withRelayBrowser } from "@/server/mesh/relay-http";
import { handleBrowserPresence, handleWaitForCalls } from "@/server/mesh/relay-routes";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/mesh/relay/presence: a browser turns "Be reachable" on, with
 * its mesh fingerprint, or off (ADR 0097). Only in the relay's memory: it
 * lasts while the page keeps polling.
 */
export function POST(request: Request) {
  return withRelayBrowser(request, (ctx) => handleBrowserPresence(request, ctx));
}

/** GET /api/v1/mesh/relay/presence?wait=25: waits for computers calling this browser. */
export function GET(request: Request) {
  return withRelayBrowser(request, (ctx) => handleWaitForCalls(request, ctx));
}
