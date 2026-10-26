import { json, problem } from "@/server/agent/http";
import { SessionId, relayError, withRelayAgent } from "@/server/mesh/relay-http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** DELETE /api/v1/agent/relay/sessions/{id}?reason=done|cancelled: either agent ends the session. Nothing of it is kept. */
export function DELETE(request: Request, { params }: Params) {
  return withRelayAgent(request, async ({ relay, hub }) => {
    const id = SessionId.safeParse((await params).id);
    if (!id.success) return problem(404, "NOT_FOUND", "That relayed connection doesn't exist.");
    const reason = new URL(request.url).searchParams.get("reason") === "done" ? "done" : "cancelled";
    const r = hub.close(relay, id.data, reason);
    return r.ok ? json({ data: { closed: true } }) : relayError(r);
  });
}
