import { fromResult, json, problem, sessionDto, withSandbox } from "@/server/sandbox/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/v1/sandboxes/{id}: one session. Another workspace's session is "not found". */
export function GET(request: Request, { params }: Params) {
  return withSandbox(request, async ({ actor, store }) => {
    const { id } = await params;
    const session = await store.getSession(id);
    if (!session || session.orgId !== actor.orgId) return problem(404, "NOT_FOUND", "That session doesn't exist in this workspace.");
    return json({ data: sessionDto(session) });
  });
}

/** DELETE /api/v1/sandboxes/{id}: stop the session and destroy its sandbox. Safe to repeat. */
export function DELETE(request: Request, { params }: Params) {
  return withSandbox(request, async ({ actor, service }) => {
    const { id } = await params;
    return fromResult(await service.stopSession(actor, id));
  });
}
