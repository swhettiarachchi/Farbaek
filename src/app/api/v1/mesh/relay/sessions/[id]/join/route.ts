import { withRelayBrowser } from "@/server/mesh/relay-http";
import { handleJoin } from "@/server/mesh/relay-routes";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** POST /api/v1/mesh/relay/sessions/{id}/join: a browser takes a call from a paired computer (ADR 0097). */
export function POST(request: Request, { params }: Params) {
  return withRelayBrowser(request, async (ctx) => handleJoin((await params).id, ctx));
}
