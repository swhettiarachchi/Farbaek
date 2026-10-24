/**
 * Signed evidence (ADR 0062): DSSE, the Dead Simple Signing Envelope that
 * in-toto attestations are signed in. The payload is the statement's RFC
 * 8785 canonical JSON, so its SHA-256 is the evidence's own digest, and the
 * signature is Ed25519 over DSSE's pre-authentication encoding (PAE) of the
 * payload type and payload.
 *
 * Verifying runs anywhere Web Crypto does: the server, Node and the public
 * verify page, where nothing leaves the visitor's browser. Signing happens
 * only on the server, with Farbaek's private key (src/server/proof/signing.ts).
 */
import { canonicalize } from "./canonical-json";

export const IN_TOTO_PAYLOAD_TYPE = "application/vnd.in-toto+json";

export interface DsseSignature {
  keyid: string;
  /** Base64 Ed25519 signature over PAE(payloadType, payload). */
  sig: string;
}

export interface DsseEnvelope {
  payloadType: string;
  /** Base64 of the canonical JSON statement. */
  payload: string;
  signatures: DsseSignature[];
}

/** A key Farbaek publishes for checking its signatures. */
export interface PublicSigningKey {
  keyid: string;
  /** Base64 of the raw 32-byte Ed25519 public key. */
  publicKey: string;
}

const encoder = new TextEncoder();

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromBase64(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4 !== 0) return null;
  const s = atob(text);
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

/** DSSE's pre-authentication encoding: "DSSEv1 <len> <type> <len> <payload>", lengths in bytes. */
export function pae(payloadType: string, payload: Uint8Array): Uint8Array {
  const type = encoder.encode(payloadType);
  const head = encoder.encode(`DSSEv1 ${type.length} ${payloadType} ${payload.length} `);
  const out = new Uint8Array(head.length + payload.length);
  out.set(head);
  out.set(payload, head.length);
  return out;
}

/** The bytes a statement is signed as: its canonical JSON in UTF-8. */
export function statementPayload(statement: unknown): Uint8Array {
  return encoder.encode(canonicalize(statement));
}

/** A key's id: "farbaek-" and the first 16 hex characters of the raw public key's SHA-256. */
export async function keyIdFor(rawPublicKey: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", rawPublicKey as BufferSource));
  return `farbaek-${Array.from(digest.slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** An envelope for a statement and the signatures already made over it. */
export function envelopeFor(statement: unknown, signatures: DsseSignature[]): DsseEnvelope {
  return { payloadType: IN_TOTO_PAYLOAD_TYPE, payload: toBase64(statementPayload(statement)), signatures };
}

export type SignatureCheck =
  | { status: "valid"; keyid: string; statement: unknown }
  | { status: "invalid"; reason: string }
  | { status: "unknown_key"; keyid: string };

/**
 * Checks an envelope against Farbaek's published keys. Valid means a known
 * key signed exactly this payload; the statement returned is the signed one.
 */
export async function verifyEnvelope(input: unknown, keys: readonly PublicSigningKey[]): Promise<SignatureCheck> {
  if (typeof input !== "object" || input === null) return { status: "invalid", reason: "The signature isn't in the expected form." };
  const env = input as Partial<DsseEnvelope>;
  if (env.payloadType !== IN_TOTO_PAYLOAD_TYPE || typeof env.payload !== "string" || !Array.isArray(env.signatures) || env.signatures.length === 0) {
    return { status: "invalid", reason: "The signature isn't in the expected form." };
  }
  const payload = fromBase64(env.payload);
  if (!payload) return { status: "invalid", reason: "The signed content can't be read." };
  let statement: unknown;
  try {
    statement = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(payload));
  } catch {
    return { status: "invalid", reason: "The signed content isn't JSON." };
  }
  const message = pae(env.payloadType, payload);
  let unknownKey: string | null = null;
  for (const s of env.signatures) {
    if (!s || typeof s.keyid !== "string" || typeof s.sig !== "string") continue;
    const key = keys.find((k) => k.keyid === s.keyid);
    if (!key) {
      unknownKey = s.keyid;
      continue;
    }
    const raw = fromBase64(key.publicKey);
    const sig = fromBase64(s.sig);
    if (!raw || raw.length !== 32 || !sig) continue;
    try {
      const publicKey = await crypto.subtle.importKey("raw", raw as BufferSource, { name: "Ed25519" }, false, ["verify"]);
      if (await crypto.subtle.verify({ name: "Ed25519" }, publicKey, sig as BufferSource, message as BufferSource)) return { status: "valid", keyid: s.keyid, statement };
    } catch {
      continue;
    }
    return { status: "invalid", reason: "The signature doesn't match: the evidence was changed after Farbaek signed it." };
  }
  if (unknownKey) return { status: "unknown_key", keyid: unknownKey };
  return { status: "invalid", reason: "None of the signatures can be checked." };
}
