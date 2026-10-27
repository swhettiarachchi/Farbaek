import { withRelayBrowser } from "@/server/mesh/relay-http";
import { handleCall } from "@/server/mesh/relay-routes";

export const dynamic = "force-dynamic";

/** POST /api/v1/mesh/relay/calls: a browser calls a reachable computer of the person's workspace (ADR 0096). */
export function POST(request: Request) {
  return withRelayBrowser(request, (ctx) => handleCall(request, ctx));
}
