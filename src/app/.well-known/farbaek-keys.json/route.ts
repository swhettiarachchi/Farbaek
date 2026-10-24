import { readSigningKey } from "@/server/proof/signing";

/**
 * The public keys Farbaek signs its evidence with (ADR 0062): Ed25519, over
 * the DSSE encoding of each statement's canonical JSON. The verify page
 * checks signatures against this list, and anyone else can too. An empty
 * list means this server isn't signing.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const key = await readSigningKey();
  return Response.json(
    {
      issuer: "Farbaek",
      use: "Signs ProofPacks: Ed25519 over the DSSE pre-authentication encoding of the statement's RFC 8785 canonical JSON.",
      keys: key ? [{ keyid: key.keyid, type: "ed25519", publicKey: key.published.publicKey }] : [],
    },
    { headers: { "cache-control": "public, max-age=300", "access-control-allow-origin": "*" } },
  );
}
