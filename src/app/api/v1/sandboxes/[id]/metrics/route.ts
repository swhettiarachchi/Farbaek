import { fromResult, withSandbox } from "@/server/sandbox/http";

export const dynamic = "force-dynamic";

/** GET /api/v1/sandboxes/{id}/metrics: the runtime's latest resource sample, or null when none is available. */
export function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withSandbox(request, async ({ actor, service }) => fromResult(await service.sampleMetrics(actor, (await params).id)));
}
