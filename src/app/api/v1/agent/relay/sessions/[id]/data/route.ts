import { withRelayAgent } from "@/server/mesh/relay-http";
import { handleRead, handleWrite } from "@/server/mesh/relay-routes";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/agent/relay/sessions/{id}/data?offset=N: adds encrypted bytes
 * to this agent's stream at offset N. A retried write is kept once. When the
 * other side is behind, `full` says to send the same bytes again shortly.
 */
export function POST(request: Request, { params }: Params) {
  return withRelayAgent(request, async (ctx) => handleWrite(request, (await params).id, ctx));
}

/**
 * GET /api/v1/agent/relay/sessions/{id}/data?from=N&wait=25: the other
 * side's bytes from offset N, which also says this agent holds everything
 * before N. Waits when there's nothing yet. The headers say where the bytes
 * start, whether the other side has joined, and when the stream has ended.
 */
export function GET(request: Request, { params }: Params) {
  return withRelayAgent(request, async (ctx) => handleRead(request, (await params).id, ctx));
}
