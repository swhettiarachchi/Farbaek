/**
 * Apple's signed records (ADR 0112): transactions, renewal information and
 * App Store Server Notifications arrive as JSON Web Signatures, signed by a
 * certificate chain that ends at Apple Root CA - G3. A record counts only
 * when:
 * - its chain ends at that root, pinned by its SHA-256 fingerprint;
 * - each certificate in it was issued and signed by the next;
 * - the intermediate carries Apple's WWDR marker (1.2.840.113635.100.6.2.1)
 *   and the signing certificate carries the App Store's (1.2.840.113635.100.6.11.1);
 * - every certificate was valid when the record was signed;
 * - the ES256 signature over the record checks out with the signing key.
 *
 * Only Node's own crypto: no dependency. Nothing in a record is trusted before all of this passes.
 */
import { X509Certificate, verify } from "node:crypto";

/** Apple Root CA - G3 (apple.com/certificateauthority, read 2026-10-29), valid until 2039. */
export const APPLE_ROOT_CA_G3_SHA256 = "63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79";

// The two markers, DER-encoded as they appear in the certificates' extensions.
const APP_STORE_OID = Buffer.from("060a2a864886f76364060b01", "hex");
const WWDR_OID = Buffer.from("060a2a864886f76364060201", "hex");

export class AppleJwsError extends Error {}

const b64url = (part: string) => Buffer.from(part, "base64url");

/** The verified payload of an Apple-signed record, or an AppleJwsError saying why it isn't one. */
export function verifyAppleJws<T = Record<string, unknown>>(jws: unknown, options: { rootSha256?: string; now?: Date } = {}): T {
  if (typeof jws !== "string" || jws.length > 64_000) throw new AppleJwsError("Not a signed record.");
  const parts = jws.split(".");
  if (parts.length !== 3 || parts.some((p) => !/^[A-Za-z0-9_-]+$/.test(p))) throw new AppleJwsError("Not a signed record.");
  let header: { alg?: unknown; x5c?: unknown };
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(b64url(parts[0]!).toString("utf8")) as typeof header;
    payload = JSON.parse(b64url(parts[1]!).toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new AppleJwsError("The record isn't readable.");
  }
  if (header.alg !== "ES256" || !Array.isArray(header.x5c) || header.x5c.length !== 3 || !header.x5c.every((c) => typeof c === "string" && c.length < 8_000)) {
    throw new AppleJwsError("The record isn't signed the way Apple signs.");
  }
  let chain: X509Certificate[];
  try {
    chain = (header.x5c as string[]).map((c) => new X509Certificate(Buffer.from(c, "base64")));
  } catch {
    throw new AppleJwsError("The record's certificates aren't readable.");
  }
  const [leaf, intermediate, root] = chain as [X509Certificate, X509Certificate, X509Certificate];
  if (root.fingerprint256 !== (options.rootSha256 ?? APPLE_ROOT_CA_G3_SHA256)) throw new AppleJwsError("The record isn't signed by Apple.");
  if (!intermediate.checkIssued(root) || !intermediate.verify(root.publicKey) || !intermediate.ca) throw new AppleJwsError("The record's certificate chain is broken.");
  if (!leaf.checkIssued(intermediate) || !leaf.verify(intermediate.publicKey) || leaf.ca) throw new AppleJwsError("The record's certificate chain is broken.");
  if (!intermediate.raw.includes(WWDR_OID) || !leaf.raw.includes(APP_STORE_OID)) throw new AppleJwsError("The record isn't signed for the App Store.");

  // Certificates are checked as of when Apple signed the record (never later than now).
  const signedAt = typeof payload.signedDate === "number" ? payload.signedDate : null;
  const now = (options.now ?? new Date()).getTime();
  const at = signedAt !== null && signedAt <= now + 5 * 60_000 ? signedAt : now;
  for (const cert of chain) {
    if (at < Date.parse(cert.validFrom) || at > Date.parse(cert.validTo)) throw new AppleJwsError("A certificate in the record wasn't valid when it was signed.");
  }

  const signed = verify("sha256", Buffer.from(`${parts[0]}.${parts[1]}`), { key: leaf.publicKey, dsaEncoding: "ieee-p1363" }, b64url(parts[2]!));
  if (!signed) throw new AppleJwsError("The record's signature doesn't match.");
  return payload as T;
}
