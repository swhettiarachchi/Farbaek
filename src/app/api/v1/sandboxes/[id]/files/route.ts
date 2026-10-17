import { fromResult, readJson, withSandbox } from "@/server/sandbox/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/sandboxes/{id}/files?path=src            list a folder (default)
 * GET /api/v1/sandboxes/{id}/files?path=src/a.ts&read=1 read a text file
 * Paths are relative to the project folder inside the sandbox.
 */
export function GET(request: Request, { params }: Params) {
  return withSandbox(request, async ({ actor, service }) => {
    const { id } = await params;
    const url = new URL(request.url);
    const path = url.searchParams.get("path") ?? "";
    if (url.searchParams.get("read") === "1") return fromResult(await service.readFile(actor, id, path));
    return fromResult(await service.listFiles(actor, id, path));
  });
}

/** PUT /api/v1/sandboxes/{id}/files: write one text file ({ path, content }), up to 512 KB. */
export function PUT(request: Request, { params }: Params) {
  return withSandbox(request, async ({ actor, service }) => {
    const { id } = await params;
    const body = await readJson(request);
    if (!body.ok) return body.response;
    return fromResult(await service.writeFile(actor, id, body.value.path, body.value.content));
  });
}
