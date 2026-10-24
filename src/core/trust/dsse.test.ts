import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { inspectEvidence } from "../proof/inspect";
import { buildProofPack } from "../proof/proofpack";
import { canonicalHash } from "./canonical-json";
import { envelopeFor, fromBase64, IN_TOTO_PAYLOAD_TYPE, keyIdFor, pae, statementPayload, toBase64, verifyEnvelope, type PublicSigningKey } from "./dsse";

/** A throwaway Ed25519 key, signing the way the server does. */
async function testKey() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const raw = new Uint8Array(publicKey.export({ format: "der", type: "spki" }).subarray(-32));
  const keyid = await keyIdFor(raw);
  const published: PublicSigningKey = { keyid, publicKey: toBase64(raw) };
  const signStatement = (statement: unknown) => ({ keyid, sig: sign(null, pae(IN_TOTO_PAYLOAD_TYPE, statementPayload(statement)), privateKey).toString("base64") });
  return { published, signStatement };
}

const statement = {
  _type: "https://in-toto.io/Statement/v1",
  subject: [{ name: "index.html", digest: { sha256: "a".repeat(64) } }],
  predicateType: "https://farbaek.dev/sandbox-receipt/v1",
  predicate: { b: 2, a: "Café" },
};

describe("DSSE", () => {
  it("encodes exactly as the DSSE spec's example", () => {
    expect(new TextDecoder().decode(pae("http://example.com/HelloWorld", new TextEncoder().encode("hello world")))).toBe("DSSEv1 29 http://example.com/HelloWorld 11 hello world");
    // Lengths are in bytes, not characters.
    expect(new TextDecoder().decode(pae("t", new TextEncoder().encode("é")))).toBe("DSSEv1 1 t 2 é");
  });

  it("signs the canonical JSON, so the payload's SHA-256 is the evidence's digest", async () => {
    const payload = statementPayload(statement);
    const hex = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", payload as BufferSource)), (b) => b.toString(16).padStart(2, "0")).join("");
    expect(hex).toBe(await canonicalHash(statement));
    expect(fromBase64(envelopeFor(statement, []).payload)).toEqual(payload);
  });

  it("accepts a signature from a published key, and names the key", async () => {
    const k = await testKey();
    const env = envelopeFor(statement, [k.signStatement(statement)]);
    const r = await verifyEnvelope(env, [k.published]);
    expect(r).toMatchObject({ status: "valid", keyid: k.published.keyid });
    expect(k.published.keyid).toMatch(/^farbaek-[0-9a-f]{16}$/);
  });

  it("refuses a changed payload, another key's signature and nonsense", async () => {
    const k = await testKey();
    const other = await testKey();
    const signed = envelopeFor(statement, [k.signStatement(statement)]);
    const tampered = { ...signed, payload: envelopeFor({ ...statement, predicate: { a: "Cafe", b: 2 } }, []).payload };
    expect((await verifyEnvelope(tampered, [k.published])).status).toBe("invalid");
    expect(await verifyEnvelope(signed, [other.published])).toEqual({ status: "unknown_key", keyid: k.published.keyid });
    expect((await verifyEnvelope({ payloadType: "text/plain", payload: "", signatures: [] }, [k.published])).status).toBe("invalid");
    expect((await verifyEnvelope("x", [k.published])).status).toBe("invalid");
  });
});

/** A real ProofPack, as the server builds one. */
const pack = buildProofPack({
  task: { id: "tsk_1", organizationId: "org_1", projectId: "prj_1" },
  contract: { version: 1, sha256: "c".repeat(64) },
  proposal: { id: "prop_1", sha256: "d".repeat(64), model: null },
  policy: { outcome: "REQUIRE_APPROVAL", version: "12", findings: [] },
  approval: { approvedBy: "usr_1", approvedAt: "2026-10-24T10:00:00.000Z", appliedSha256: "d".repeat(64) },
  files: [{ path: "index.html", kind: "edit", baseRevision: 1, sha256: "e".repeat(64) }],
  checks: [{ name: "farbaek check-site", command: "farbaek check-site", exitCode: 0 }],
  execution: { mode: "sandboxed", provider: "vercel" },
  createdAt: "2026-10-24T10:00:05.000Z",
  previous: null,
});

describe("inspecting signed evidence", () => {
  it("says who signed a download, and catches a signature over different evidence", async () => {
    const k = await testKey();
    const digest = await canonicalHash(pack);
    const download = { digest, status: "verified", statement: pack, dsse: envelopeFor(pack, [k.signStatement(pack)]) };
    const r = await inspectEvidence(download, undefined, [k.published]);
    expect(r.ok && r.signature).toEqual({ status: "signed", keyid: k.published.keyid });

    // The pack beside the envelope was swapped for another: the signature is for something else.
    const swapped = { ...download, statement: { ...pack, predicate: { ...pack.predicate, createdAt: "2026-10-25T00:00:00.000Z" } } };
    const s = await inspectEvidence(swapped, undefined, [k.published]);
    expect(s.ok && s.signature.status).toBe("bad");
  });

  it("reads a bare envelope, says when something isn't signed, and when keys couldn't load", async () => {
    const k = await testKey();
    const env = envelopeFor(pack, [k.signStatement(pack)]);
    const bare = await inspectEvidence(env, undefined, [k.published]);
    expect(bare.ok && bare.signature.status).toBe("signed");
    const unsigned = await inspectEvidence({ digest: await canonicalHash(pack), statement: pack }, undefined, [k.published]);
    expect(unsigned.ok && unsigned.signature).toEqual({ status: "unsigned" });
    const offline = await inspectEvidence(env, undefined, null);
    expect(offline.ok && offline.signature).toEqual({ status: "unchecked" });
  });
});
