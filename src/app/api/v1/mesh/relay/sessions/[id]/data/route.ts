import { withRelayBrowser } from "@/server/mesh/relay-http";
import { handleRead, handleWrite } from "@/server/mesh/relay-routes";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** POST /api/v1/mesh/relay/sessions/{id}/data?offset=N: a browser's encrypted bytes at offset N (ADR 0096). */
export function POST(request: Request, { params }: Params) {
  return withRelayBrowser(request, async (ctx) => handleWrite(request, (await params).id, ctx));
}

/** GET /api/v1/mesh/relay/sessions/{id}/data?from=N&wait=25: the computer's bytes from offset N. */
export function GET(request: Request, { params }: Params) {
  return withRelayBrowser(request, async (ctx) => handleRead(request, (await params).id, ctx));
}
