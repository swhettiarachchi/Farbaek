import { fromResult, withSandbox } from "@/server/sandbox/http";

export const dynamic = "force-dynamic";

/** POST /api/v1/sandboxes/{id}/pause: pause a running session, when the runtime supports it. */
export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withSandbox(request, async ({ actor, service }) => fromResult(await service.pauseSession(actor, (await params).id)));
}
