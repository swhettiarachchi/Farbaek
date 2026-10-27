import { withRelayBrowser } from "@/server/mesh/relay-http";
import { handleClose } from "@/server/mesh/relay-routes";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** DELETE /api/v1/mesh/relay/sessions/{id}?reason=done|cancelled: a browser ends its session. */
export function DELETE(request: Request, { params }: Params) {
  return withRelayBrowser(request, async (ctx) => handleClose(request, (await params).id, ctx));
}
