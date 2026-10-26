import { json, problem } from "@/server/agent/http";
import { RELAY_LIMITS } from "@/server/mesh/relay-hub";
import { SessionId, offsetFrom, relayError, waitFrom, withRelayAgent } from "@/server/mesh/relay-http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/agent/relay/sessions/{id}/data?offset=N: adds encrypted bytes
 * to this agent's stream at offset N. A retried write is kept once. When the
 * other side is behind, `full` says to send the same bytes again shortly.
 */
export function POST(request: Request, { params }: Params) {
  return withRelayAgent(request, async ({ relay, hub }) => {
    const id = SessionId.safeParse((await params).id);
    if (!id.success) return problem(404, "NOT_FOUND", "That relayed connection doesn't exist.");
    const offset = offsetFrom(new URL(request.url), "offset");
    if (offset === null) return problem(400, "INVALID_REQUEST", "Say where these bytes start with ?offset=.");
    if (!(request.headers.get("content-type") ?? "").includes("application/octet-stream")) return problem(415, "UNSUPPORTED_MEDIA_TYPE", "Send the bytes as application/octet-stream.");
    if (Number(request.headers.get("content-length") ?? "0") > RELAY_LIMITS.writeBytes) return problem(413, "TOO_LARGE", "Send at most 2 MiB at a time.");
    const bytes = Buffer.from(await request.arrayBuffer());
    const r = await hub.write(relay, id.data, offset, bytes);
    return r.ok ? json({ data: r.value }) : relayError(r);
  });
}

/**
 * GET /api/v1/agent/relay/sessions/{id}/data?from=N&wait=25: the other
 * side's bytes from offset N, which also says this agent holds everything
 * before N. Waits when there's nothing yet. The headers say where the bytes
 * start, whether the other side has joined, and when the stream has ended.
 */
export function GET(request: Request, { params }: Params) {
  return withRelayAgent(request, async ({ relay, hub }) => {
    const id = SessionId.safeParse((await params).id);
    if (!id.success) return problem(404, "NOT_FOUND", "That relayed connection doesn't exist.");
    const url = new URL(request.url);
    const from = offsetFrom(url, "from");
    if (from === null) return problem(400, "INVALID_REQUEST", "Say which bytes you need with ?from=.");
    const r = await hub.read(relay, id.data, from, waitFrom(url));
    if (!r.ok) return relayError(r);
    return new Response(new Uint8Array(r.value.bytes), {
      status: 200,
      headers: {
        "content-type": "application/octet-stream",
        "cache-control": "no-store",
        "x-relay-offset": String(r.value.offset),
        "x-relay-closed": r.value.closed ? "1" : "0",
        "x-relay-joined": r.value.joined ? "1" : "0",
      },
    });
  });
}
