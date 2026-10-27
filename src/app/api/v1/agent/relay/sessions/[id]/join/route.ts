import { withRelayAgent } from "@/server/mesh/relay-http";
import { handleJoin } from "@/server/mesh/relay-routes";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** POST /api/v1/agent/relay/sessions/{id}/join: the called agent takes the call. */
export function POST(request: Request, { params }: Params) {
  return withRelayAgent(request, async (ctx) => handleJoin((await params).id, ctx));
}
