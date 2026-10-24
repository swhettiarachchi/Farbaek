import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { envelopeFor, verifyEnvelope } from "@/core/trust/dsse";
import { readSigningKey, signStatement } from "./signing";

const ed25519 = () => generateKeyPairSync("ed25519").privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");

describe("the server's signing key", () => {
  it("signs statements that verify against the key it publishes", async () => {
    const key = await readSigningKey({ PROOFPACK_SIGNING_KEY: ed25519() });
    expect(key?.keyid).toMatch(/^farbaek-[0-9a-f]{16}$/);
    const statement = { _type: "https://in-toto.io/Statement/v1", predicate: { a: 1 } };
    const r = await verifyEnvelope(envelopeFor(statement, [signStatement(statement, key!)]), [key!.published]);
    expect(r).toMatchObject({ status: "valid", keyid: key!.keyid });
  });

  it("is off without a key, and refuses one that isn't Ed25519 or isn't a key", async () => {
    expect(await readSigningKey({})).toBeNull();
    expect(await readSigningKey({ PROOFPACK_SIGNING_KEY: "not a key" })).toBeNull();
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
    expect(await readSigningKey({ PROOFPACK_SIGNING_KEY: rsa })).toBeNull();
  });
});
