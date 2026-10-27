import { withRelayAgent } from "@/server/mesh/relay-http";
import { handleClose } from "@/server/mesh/relay-routes";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** DELETE /api/v1/agent/relay/sessions/{id}?reason=done|cancelled: either agent ends the session. Nothing of it is kept. */
export function DELETE(request: Request, { params }: Params) {
  return withRelayAgent(request, async (ctx) => handleClose(request, (await params).id, ctx));
}
