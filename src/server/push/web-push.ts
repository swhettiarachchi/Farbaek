/**
 * Web Push without a library (ADR 0079): message encryption as RFC 8291
 * (aes128gcm, RFC 8188) and server identification as RFC 8292 (VAPID, an
 * ES256 JWT), both with node:crypto. The encryption is checked byte for byte
 * against RFC 8291's worked example.
 *
 * The VAPID key pair is VAPID_PRIVATE_KEY (32 bytes, base64url) when set;
 * otherwise it's derived with HKDF from the server's Supabase secret, so
 * nothing new has to be configured. Changing it means devices subscribe
 * again, which the Settings page does by itself.
 */
import { createCipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign, type KeyObject } from "node:crypto";

const b64u = (b: Buffer | Uint8Array) => Buffer.from(b).toString("base64url");
export const fromB64u = (s: string) => Buffer.from(s, "base64url");

// The order of P-256's group, for turning derived bytes into a valid private key.
const P256_N = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");

export interface VapidKeys {
  /** The uncompressed public key, as browsers take it for applicationServerKey. */
  publicKey: string;
  privateKey: KeyObject;
}

function keysFromScalar(d: Buffer): VapidKeys {
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(d);
  const pub = ecdh.getPublicKey();
  const privateKey = createPrivateKey({ key: { kty: "EC", crv: "P-256", d: b64u(d), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: "jwk" });
  return { publicKey: b64u(pub), privateKey };
}

/** The server's VAPID keys, or null when none can be had (push stays off, and Settings says so). */
export function vapidKeys(env: Record<string, string | undefined> = process.env): VapidKeys | null {
  const dedicated = env.VAPID_PRIVATE_KEY?.trim();
  if (dedicated) {
    const d = fromB64u(dedicated);
    return d.length === 32 ? keysFromScalar(d) : null;
  }
  const master = env.SUPABASE_SECRET_KEY?.trim();
  if (!master) return null;
  // 48 bytes reduced mod n-1, plus one, gives a valid scalar with negligible bias.
  const wide = BigInt(`0x${Buffer.from(hkdfSync("sha256", master, "farbaek", "farbaek/web-push-vapid/v1", 48)).toString("hex")}`);
  const d = Buffer.from(((wide % (P256_N - 1n)) + 1n).toString(16).padStart(64, "0"), "hex");
  return keysFromScalar(d);
}

/** The Authorization header for one push service: a VAPID JWT for its origin, valid for 12 hours. */
export function vapidAuthorization(keys: VapidKeys, endpoint: string, now: Date, subject = "mailto:hello@farbaek.com"): string {
  const header = b64u(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now.getTime() / 1000) + 12 * 3600, sub: subject })));
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), { key: keys.privateKey, dsaEncoding: "ieee-p1363" });
  return `vapid t=${header}.${claims}.${b64u(signature)}, k=${keys.publicKey}`;
}

/**
 * Encrypts one push message for a subscription (RFC 8291). `salt` and
 * `serverPrivateKey` are for the RFC's test vector only; real messages get
 * fresh ones each time.
 */
export function encryptPush(plaintext: Buffer, subscription: { p256dh: string; auth: string }, fixed: { salt?: Buffer; serverPrivateKey?: Buffer } = {}): Buffer {
  const uaPublic = fromB64u(subscription.p256dh);
  const authSecret = fromB64u(subscription.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4 || authSecret.length !== 16) throw new Error("INVALID_SUBSCRIPTION");
  const ecdh = createECDH("prime256v1");
  if (fixed.serverPrivateKey) ecdh.setPrivateKey(fixed.serverPrivateKey);
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const ecdhSecret = ecdh.computeSecret(uaPublic);

  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0", "latin1"), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", ecdhSecret, authSecret, keyInfo, 32));
  const salt = fixed.salt ?? randomBytes(16);
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0", "latin1"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0", "latin1"), 12));

  // One record: the message, then the 0x02 delimiter that marks the last record.
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(16 + 4 + 1);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, body]);
}
