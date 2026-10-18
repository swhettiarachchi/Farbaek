import { fromResult, withSandbox } from "@/server/sandbox/http";

export const dynamic = "force-dynamic";

/** POST /api/v1/sandboxes/{id}/resume: resume a paused session within its original time limit. */
export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withSandbox(request, async ({ actor, service }) => fromResult(await service.resumeSession(actor, (await params).id)));
}
