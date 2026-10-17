import { executionDto, fromResult, json, problem, withSandbox } from "@/server/sandbox/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; executionId: string }> };

/** GET /api/v1/sandboxes/{id}/executions/{executionId}: one command's record. */
export function GET(request: Request, { params }: Params) {
  return withSandbox(request, async ({ actor, store }) => {
    const { id, executionId } = await params;
    const session = await store.getSession(id);
    const execution = await store.getExecution(executionId);
    if (!session || session.orgId !== actor.orgId || !execution || execution.sessionId !== id) return problem(404, "NOT_FOUND", "That command doesn't exist in this workspace.");
    return json({ data: executionDto(execution) });
  });
}

/** DELETE /api/v1/sandboxes/{id}/executions/{executionId}: cancel a running command. */
export function DELETE(request: Request, { params }: Params) {
  return withSandbox(request, async ({ actor, service, store }) => {
    const { id, executionId } = await params;
    const execution = await store.getExecution(executionId);
    if (!execution || execution.sessionId !== id) return problem(404, "NOT_FOUND", "That command doesn't exist in this workspace.");
    return fromResult(await service.cancelExecution(actor, executionId));
  });
}
