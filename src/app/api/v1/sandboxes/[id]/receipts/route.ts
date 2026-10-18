import { json, problem, receiptDto, withSandbox } from "@/server/sandbox/http";

export const dynamic = "force-dynamic";

/** GET /api/v1/sandboxes/{id}/receipts: verification receipts recorded for this session. */
export function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withSandbox(request, async ({ actor, store }) => {
    const { id } = await params;
    const session = await store.getSession(id);
    if (!session || session.orgId !== actor.orgId) return problem(404, "NOT_FOUND", "That session doesn't exist in this workspace.");
    return json({ data: (await store.listReceipts({ sessionId: id }, 50)).map(receiptDto) });
  });
}
