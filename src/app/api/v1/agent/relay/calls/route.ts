import { json, problem, readJson } from "@/server/agent/http";
import { relayError, withRelayAgent } from "@/server/mesh/relay-http";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/agent/relay/calls: calls a reachable agent of the same
 * workspace by its mesh fingerprint (ADR 0094). `from` is this device's
 * fingerprint, a hint the other side uses to decline a device it doesn't
 * know; the Noise handshake that follows is what proves who's who. `mode`
 * direct means the session only sets up a direct link (ADR 0095).
 */
export function POST(request: Request) {
  return withRelayAgent(request, async ({ relay, hub }) => {
    const body = await readJson(request, 1024);
    if (!body.ok) return body.response;
    const { to, from, mode = "relay" } = body.value;
    if (typeof to !== "string" || typeof from !== "string") return problem(400, "INVALID_REQUEST", "Send the fingerprints of both devices.");
    if (mode !== "relay" && mode !== "direct") return problem(400, "INVALID_REQUEST", "A call is relay or direct.");
    const r = hub.call(relay, to, from, mode);
    return r.ok ? json({ data: r.value }, 201) : relayError(r);
  });
}
