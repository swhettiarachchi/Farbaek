/**
 * Noise_XX_25519_AESGCM_SHA256 on Web Crypto (ADR 0096): the same handshake
 * the Farbaek Agent runs with node:crypto (src/agent-runtime/mesh/noise.ts),
 * for a phone or any browser. Async, because Web Crypto is. The device's
 * private key can be a non-extractable CryptoKey: it never leaves the
 * browser's key store. Checked against the cacophony vector for this suite
 * and against the agent's implementation, both ways (noise.test.ts).
 *
 * This follows the specification step by step; nothing here is a new
 * cryptographic construction.
 */
import { PAIR_CODE_LABEL, PAIR_COMMIT_LABEL, PAIR_NONCE_BYTES } from "../pairing";

export const PROTOCOL_NAME = "Noise_XX_25519_AESGCM_SHA256";
export const MAX_MESSAGE = 65_535;
const DHLEN = 32;
const TAGLEN = 16;

export class WebNoiseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebNoiseError";
  }
}

export interface WebKeyPair {
  privateKey: CryptoKey;
  /** Raw 32-byte X25519 public key. */
  publicKey: Uint8Array;
}

const subtle = () => globalThis.crypto.subtle;
const X25519 = { name: "X25519" } as const;
/** The X25519 base point, u = 9: DH with it gives a private key's public key. */
const BASE_POINT = new Uint8Array(32).fill(0, 1);
BASE_POINT[0] = 9;
const PKCS8_X25519 = new Uint8Array([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x04, 0x22, 0x04, 0x20]);

export const concat = (...parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};
export const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
export const fromHex = (hex: string): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};
const buf = (bytes: Uint8Array): Uint8Array<ArrayBuffer> => (bytes.buffer instanceof ArrayBuffer && bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? (bytes as Uint8Array<ArrayBuffer>) : new Uint8Array(bytes));

async function publicOf(privateKey: CryptoKey): Promise<Uint8Array<ArrayBuffer>> {
  return dhRaw(privateKey, BASE_POINT);
}

/** A new key pair. The private half isn't extractable unless asked. */
export async function generateWebKeyPair(extractable = false): Promise<WebKeyPair> {
  const pair = (await subtle().generateKey(X25519, extractable, ["deriveBits"])) as CryptoKeyPair;
  return { privateKey: pair.privateKey, publicKey: new Uint8Array(await subtle().exportKey("raw", pair.publicKey)) };
}

/** The key pair for a raw private key (tests and the published vector). */
export async function webKeyPairFromPrivate(raw: Uint8Array): Promise<WebKeyPair> {
  if (raw.length !== DHLEN) throw new WebNoiseError("An X25519 private key is 32 bytes.");
  const privateKey = await subtle().importKey("pkcs8", concat(PKCS8_X25519, raw), X25519, false, ["deriveBits"]);
  return { privateKey, publicKey: await publicOf(privateKey) };
}

async function dhRaw(privateKey: CryptoKey, remotePublic: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  try {
    const pub = await subtle().importKey("raw", buf(remotePublic), X25519, true, []);
    return new Uint8Array(await subtle().deriveBits({ name: "X25519", public: pub }, privateKey, 256));
  } catch {
    throw new WebNoiseError("The other side sent an unusable key.");
  }
}

export async function sha256(data: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await subtle().digest("SHA-256", buf(data)));
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const k = await subtle().importKey("raw", buf(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await subtle().sign("HMAC", k, buf(data)));
}

/** HKDF as Noise defines it: HMAC-SHA256 with an empty info string, two outputs. */
async function hkdf2(chainingKey: Uint8Array, ikm: Uint8Array): Promise<[Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>]> {
  const temp = await hmac(chainingKey, ikm);
  const one = await hmac(temp, new Uint8Array([1]));
  const two = await hmac(temp, concat(one, new Uint8Array([2])));
  return [one, two];
}

function nonce(n: bigint): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(12);
  new DataView(out.buffer).setBigUint64(4, n);
  return out;
}

/** One direction's key and counter. Messages must be decrypted in the order they were sent. */
export class WebCipherState {
  private key: CryptoKey | null = null;
  private n = 0n;

  async initializeKey(raw: Uint8Array | null): Promise<void> {
    this.key = raw ? await subtle().importKey("raw", buf(raw), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]) : null;
    this.n = 0n;
  }

  hasKey(): boolean {
    return this.key !== null;
  }

  async encryptWithAd(ad: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
    if (!this.key) return new Uint8Array(plaintext);
    const iv = nonce(this.n);
    this.n += 1n;
    return new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv, additionalData: buf(ad), tagLength: 128 }, this.key, buf(plaintext)));
  }

  async decryptWithAd(ad: Uint8Array, ciphertext: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
    if (!this.key) return new Uint8Array(ciphertext);
    if (ciphertext.length < TAGLEN) throw new WebNoiseError("A message was too short to be genuine.");
    try {
      const out = new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv: nonce(this.n), additionalData: buf(ad), tagLength: 128 }, this.key, buf(ciphertext)));
      this.n += 1n;
      return out;
    } catch {
      throw new WebNoiseError("A message failed its integrity check: it was changed, replayed or arrived out of order.");
    }
  }

  encrypt(plaintext: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
    return this.encryptWithAd(new Uint8Array(0), plaintext);
  }

  decrypt(ciphertext: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
    return this.decryptWithAd(new Uint8Array(0), ciphertext);
  }
}

class SymmetricState {
  private ck: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  h: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  readonly cipher = new WebCipherState();

  async init(name: string): Promise<void> {
    const bytes = new TextEncoder().encode(name);
    this.h = bytes.length <= 32 ? concat(bytes, new Uint8Array(32 - bytes.length)) : await sha256(bytes);
    this.ck = new Uint8Array(this.h);
  }

  async mixKey(ikm: Uint8Array): Promise<void> {
    const [ck, temp] = await hkdf2(this.ck, ikm);
    this.ck = ck;
    await this.cipher.initializeKey(temp);
  }

  async mixHash(data: Uint8Array): Promise<void> {
    this.h = await sha256(concat(this.h, data));
  }

  async encryptAndHash(plaintext: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
    const c = await this.cipher.encryptWithAd(this.h, plaintext);
    await this.mixHash(c);
    return c;
  }

  async decryptAndHash(ciphertext: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
    const p = await this.cipher.decryptWithAd(this.h, ciphertext);
    await this.mixHash(ciphertext);
    return p;
  }

  async split(): Promise<[WebCipherState, WebCipherState]> {
    const [k1, k2] = await hkdf2(this.ck, new Uint8Array(0));
    const c1 = new WebCipherState();
    const c2 = new WebCipherState();
    await c1.initializeKey(k1);
    await c2.initializeKey(k2);
    return [c1, c2];
  }
}

export interface WebTransport {
  send: WebCipherState;
  receive: WebCipherState;
}

/** One XX handshake. The initiator writes messages 1 and 3, the responder message 2. */
export class WebXXHandshake {
  private readonly ss = new SymmetricState();
  private ready: Promise<void>;
  private e: WebKeyPair | null = null;
  private re: Uint8Array | null = null;
  private rs: Uint8Array | null = null;
  private step = 0;
  private transport: WebTransport | null = null;

  constructor(private readonly options: { initiator: boolean; prologue: Uint8Array; staticKey: WebKeyPair; ephemeral?: WebKeyPair }) {
    this.ready = (async () => {
      await this.ss.init(PROTOCOL_NAME);
      await this.ss.mixHash(options.prologue);
    })();
  }

  get myTurn(): boolean {
    return this.step < 3 && (this.step % 2 === 0) === this.options.initiator;
  }

  get handshakeHash(): Uint8Array {
    if (!this.transport) throw new WebNoiseError("The handshake hasn't finished.");
    return new Uint8Array(this.ss.h);
  }

  get remoteStatic(): Uint8Array | null {
    return this.rs ? new Uint8Array(this.rs) : null;
  }

  result(): WebTransport {
    if (!this.transport) throw new WebNoiseError("The handshake hasn't finished.");
    return this.transport;
  }

  async writeMessage(payload: Uint8Array = new Uint8Array()): Promise<Uint8Array<ArrayBuffer>> {
    await this.ready;
    if (!this.myTurn) throw new WebNoiseError("It isn't this side's turn to write.");
    const parts: Uint8Array[] = [];
    const s = this.options.staticKey;
    if (this.step === 0) {
      await this.writeE(parts);
    } else if (this.step === 1) {
      await this.writeE(parts);
      await this.ss.mixKey(await dhRaw(this.e!.privateKey, this.re!));
      parts.push(await this.ss.encryptAndHash(s.publicKey));
      await this.ss.mixKey(await dhRaw(s.privateKey, this.re!));
    } else {
      parts.push(await this.ss.encryptAndHash(s.publicKey));
      await this.ss.mixKey(await dhRaw(s.privateKey, this.re!));
    }
    parts.push(await this.ss.encryptAndHash(payload));
    const message = concat(...parts);
    if (message.length > MAX_MESSAGE) throw new WebNoiseError("That handshake message is too large.");
    await this.advance();
    return message;
  }

  async readMessage(message: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
    await this.ready;
    if (this.myTurn || this.step >= 3) throw new WebNoiseError("A handshake message arrived out of turn.");
    if (message.length > MAX_MESSAGE) throw new WebNoiseError("A handshake message was too large.");
    let rest = message;
    const take = (n: number) => {
      if (rest.length < n) throw new WebNoiseError("A handshake message was cut short.");
      const head = rest.subarray(0, n);
      rest = rest.subarray(n);
      return head;
    };
    if (this.step === 0) {
      await this.readE(take);
    } else if (this.step === 1) {
      await this.readE(take);
      await this.ss.mixKey(await dhRaw(this.e!.privateKey, this.re!));
      this.rs = await this.ss.decryptAndHash(take(DHLEN + TAGLEN));
      await this.ss.mixKey(await dhRaw(this.e!.privateKey, this.rs));
    } else {
      this.rs = await this.ss.decryptAndHash(take(DHLEN + TAGLEN));
      await this.ss.mixKey(await dhRaw(this.e!.privateKey, this.rs));
    }
    const payload = await this.ss.decryptAndHash(rest);
    await this.advance();
    return payload;
  }

  private async writeE(parts: Uint8Array[]): Promise<void> {
    this.e = this.options.ephemeral ?? (await generateWebKeyPair());
    parts.push(this.e.publicKey);
    await this.ss.mixHash(this.e.publicKey);
  }

  private async readE(take: (n: number) => Uint8Array): Promise<void> {
    this.re = new Uint8Array(take(DHLEN));
    await this.ss.mixHash(this.re);
  }

  private async advance(): Promise<void> {
    this.step += 1;
    if (this.step === 3) {
      const [c1, c2] = await this.ss.split();
      this.transport = this.options.initiator ? { send: c1, receive: c2 } : { send: c2, receive: c1 };
    }
  }
}

function pairingInput(value: Uint8Array, what: string): Uint8Array {
  if (value.length !== PAIR_NONCE_BYTES) throw new WebNoiseError(`${what} is 32 bytes.`);
  return value;
}

/** Pairing, version 2 (ADR 0194): the caller's commitment to its random value, as lowercase hex. The same as the agent's. */
export async function webPairingCommit(callerNonce: Uint8Array): Promise<string> {
  return toHex(await sha256(concat(new TextEncoder().encode(PAIR_COMMIT_LABEL), pairingInput(callerNonce, "The caller's value"))));
}

/** The six-digit code both people compare when pairing (ADR 0194): the same as the agent's. */
export async function webPairingCode(handshakeHash: Uint8Array, callerNonce: Uint8Array, answererNonce: Uint8Array): Promise<string> {
  if (handshakeHash.length !== 32) throw new WebNoiseError("A handshake hash is 32 bytes.");
  const mac = await hmac(handshakeHash, concat(new TextEncoder().encode(PAIR_CODE_LABEL), pairingInput(callerNonce, "The caller's value"), pairingInput(answererNonce, "The answerer's value")));
  return String(new DataView(mac.buffer).getUint32(0) % 1_000_000).padStart(6, "0");
}

/** A short, stable name for a device's public key: the same as the agent's. */
export async function webFingerprint(publicKey: Uint8Array): Promise<string> {
  return toHex((await sha256(publicKey)).subarray(0, 8));
}

/** Compares two public keys without stopping early. */
export function sameWebKey(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
