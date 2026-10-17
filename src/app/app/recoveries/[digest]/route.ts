import { loadAppContext } from "@/server/workspace/context";

/**
 * Downloads one recovery record's attestation as JSON. Read through Row
 * Level Security: only members of the workspace that owns it can fetch it.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ digest: string }> }) {
  const { digest } = await params;
  if (!/^[0-9a-f]{64}$/.test(digest)) return new Response("Not found", { status: 404 });
  const ctx = await loadAppContext();
  if (!ctx?.current) return new Response("Not found", { status: 404 });
  const record = await ctx.reader.getRecovery(ctx.current.id, digest);
  if (!record) return new Response("Not found", { status: 404 });
  return new Response(JSON.stringify({ digest: record.digest, status: record.status, statement: record.statement }, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="recovery-${digest.slice(0, 12)}.json"`,
      "cache-control": "private, no-store",
    },
  });
}
