import { envelopeFor } from "@/core/trust/dsse";
import { loadAppContext } from "@/server/workspace/context";

/**
 * Downloads one ProofPack's attestation as JSON. Read through Row Level
 * Security: only members of the workspace that owns it can fetch it. A
 * signed one carries its DSSE envelope too (ADR 0062), which anyone can check
 * against Farbaek's published key on the verify page.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ digest: string }> }) {
  const { digest } = await params;
  if (!/^[0-9a-f]{64}$/.test(digest)) return new Response("Not found", { status: 404 });
  const ctx = await loadAppContext();
  if (!ctx?.current) return new Response("Not found", { status: 404 });
  const pack = await ctx.reader.getProofPack(ctx.current.id, digest);
  if (!pack) return new Response("Not found", { status: 404 });
  const dsse = pack.signature ? envelopeFor(pack.statement, [pack.signature]) : undefined;
  return new Response(JSON.stringify({ digest: pack.digest, status: pack.status, statement: pack.statement, ...(dsse ? { dsse } : {}) }, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="proofpack-${digest.slice(0, 12)}.json"`,
      "cache-control": "private, no-store",
    },
  });
}
