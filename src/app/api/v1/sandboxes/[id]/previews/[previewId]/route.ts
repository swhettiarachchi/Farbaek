import { fromResult, withSandbox } from "@/server/sandbox/http";

export const dynamic = "force-dynamic";

/** DELETE /api/v1/sandboxes/{id}/previews/{previewId}: close a preview link immediately. */
export function DELETE(request: Request, { params }: { params: Promise<{ id: string; previewId: string }> }) {
  return withSandbox(request, async ({ actor, service }) => fromResult(await service.revokePreview(actor, (await params).previewId)));
}
