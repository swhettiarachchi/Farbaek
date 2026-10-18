import { fromResult, json, problem, readJson, withSandbox } from "@/server/sandbox/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/v1/sandboxes/{id}/previews: previews opened for this session, and whether each is still usable. */
export function GET(request: Request, { params }: Params) {
  return withSandbox(request, async ({ actor, store }) => {
    const { id } = await params;
    const session = await store.getSession(id);
    if (!session || session.orgId !== actor.orgId) return problem(404, "NOT_FOUND", "That session doesn't exist in this workspace.");
    const now = Date.now();
    const rows = await store.listPreviews(id);
    return json({
      data: rows.map((p) => ({
        id: p.id,
        port: p.port,
        createdBy: p.createdBy,
        createdAt: p.createdAt,
        expiresAt: p.expiresAt,
        state: p.revokedAt ? "revoked" : Date.parse(p.expiresAt) <= now ? "expired" : p.launchedAt ? "open" : "not_opened",
      })),
    });
  });
}

/**
 * POST /api/v1/sandboxes/{id}/previews { port }: a private preview link for
 * an app listening on that port. The returned URL works once, within 60
 * seconds, and only in the browser of the person who asked for it.
 */
export function POST(request: Request, { params }: Params) {
  return withSandbox(request, async ({ actor, service }) => {
    const { id } = await params;
    const body = await readJson(request, 4 * 1024);
    if (!body.ok) return body.response;
    return fromResult(await service.openPreview(actor, id, body.value.port), undefined, 201);
  });
}
