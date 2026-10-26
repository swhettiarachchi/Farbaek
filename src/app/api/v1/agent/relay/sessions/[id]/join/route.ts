import { json, problem } from "@/server/agent/http";
import { SessionId, relayError, withRelayAgent } from "@/server/mesh/relay-http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** POST /api/v1/agent/relay/sessions/{id}/join: the called agent takes the call. */
export function POST(request: Request, { params }: Params) {
  return withRelayAgent(request, async ({ relay, hub }) => {
    const id = SessionId.safeParse((await params).id);
    if (!id.success) return problem(404, "NOT_FOUND", "That call isn't waiting any more.");
    const r = hub.join(relay, id.data);
    return r.ok ? json({ data: { joined: true } }) : relayError(r);
  });
}
