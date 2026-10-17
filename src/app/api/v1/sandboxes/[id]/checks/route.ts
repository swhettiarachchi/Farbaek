import { fromResult, idempotencyKey, withSandbox } from "@/server/sandbox/http";

export const dynamic = "force-dynamic";
export const maxDuration = 900;

/**
 * POST /api/v1/sandboxes/{id}/checks: run the linked task's required checks
 * from its approved contract, record a receipt, and move the task on only as
 * far as the real exit codes support. Never authorizes a deployment.
 */
export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withSandbox(request, async ({ actor, service }) => fromResult(await service.runChecks(actor, (await params).id, idempotencyKey(request))));
}
