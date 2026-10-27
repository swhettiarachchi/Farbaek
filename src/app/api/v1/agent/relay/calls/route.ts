import { withRelayAgent } from "@/server/mesh/relay-http";
import { handleCall } from "@/server/mesh/relay-routes";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/agent/relay/calls: calls a reachable device of the same
 * workspace by its mesh fingerprint (ADR 0094). `from` is this device's
 * fingerprint, a hint the other side uses to decline a device it doesn't
 * know; the Noise handshake that follows is what proves who's who. `mode`
 * direct only sets up a direct link (ADR 0095); pair is a phone or browser
 * pairing (ADR 0096).
 */
export function POST(request: Request) {
  return withRelayAgent(request, (ctx) => handleCall(request, ctx));
}
