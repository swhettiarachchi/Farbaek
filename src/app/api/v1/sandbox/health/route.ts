import { json, withSandbox } from "@/server/sandbox/http";
import { TEST_SPACE } from "@/core/execution/sandbox";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/sandbox/health: whether this server can run sandboxes, and
 * why not. "Healthy" comes from a live call to the runtime, never from a
 * database record.
 */
export function GET(request: Request) {
  return withSandbox(request, async ({ actor, service }) => {
    const [overview, health] = await Promise.all([service.overview(actor), service.health()]);
    return json({
      data: {
        execution: overview.execution,
        // Which company runs the test spaces is for staff (stage 171).
        provider: overview.provider ? TEST_SPACE : null,
        runtime: health === null ? { reachable: false, reason: overview.connectedReason } : health.ok ? { reachable: true, latencyMs: health.latencyMs } : { reachable: false, reason: health.reason, category: health.category },
        capabilities: overview.capabilities,
        previews: overview.previewReason === null ? { available: true } : { available: false, reason: overview.previewReason },
        limits: overview.limits.limits,
        period: { start: overview.limits.periodStart, end: overview.limits.periodEnd, kind: overview.limits.periodKind },
        usage: { ...overview.usage, minutesUsed: overview.minutesUsed, activeSessions: overview.activeSessions },
      },
    });
  });
}
