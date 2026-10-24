/**
 * Farbaek's evidence signing key (ADR 0062). PROOFPACK_SIGNING_KEY holds an
 * Ed25519 private key as base64 PKCS#8 DER; it's made on the server by
 * scripts/vps/set-signing-key.ps1 and never leaves it. Without it nothing is
 * signed, and evidence still proves its own integrity by its digest.
 */
import { createPrivateKey, createPublicKey, sign, type KeyObject } from "node:crypto";
import { IN_TOTO_PAYLOAD_TYPE, keyIdFor, pae, statementPayload, toBase64, type DsseSignature, type PublicSigningKey } from "@/core/trust/dsse";

export interface SigningKey {
  keyid: string;
  privateKey: KeyObject;
  /** What Farbaek publishes at /.well-known/farbaek-keys.json. */
  published: PublicSigningKey;
}

type Env = Record<string, string | undefined>;

let cached: { source: string; key: SigningKey | null } | null = null;

/** The server's signing key, or null when none is set or it isn't an Ed25519 key. */
export async function readSigningKey(env: Env = process.env): Promise<SigningKey | null> {
  const source = env.PROOFPACK_SIGNING_KEY?.trim() ?? "";
  if (cached && cached.source === source) return cached.key;
  let key: SigningKey | null = null;
  if (source) {
    try {
      const privateKey = createPrivateKey({ key: Buffer.from(source, "base64"), format: "der", type: "pkcs8" });
      if (privateKey.asymmetricKeyType === "ed25519") {
        // The raw public key is the last 32 bytes of its SPKI encoding.
        const raw = new Uint8Array(createPublicKey(privateKey).export({ format: "der", type: "spki" }).subarray(-32));
        const keyid = await keyIdFor(raw);
        key = { keyid, privateKey, published: { keyid, publicKey: toBase64(raw) } };
      }
    } catch {
      key = null;
    }
  }
  cached = { source, key };
  return key;
}

/** Signs a statement: Ed25519 over DSSE's encoding of its canonical JSON. */
export function signStatement(statement: unknown, key: SigningKey): DsseSignature {
  const message = pae(IN_TOTO_PAYLOAD_TYPE, statementPayload(statement));
  return { keyid: key.keyid, sig: sign(null, message, key.privateKey).toString("base64") };
}
