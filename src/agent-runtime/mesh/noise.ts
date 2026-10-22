/**
 * The Noise Protocol Framework (revision 34), XX pattern, with X25519,
 * AES-256-GCM and SHA-256: `Noise_XX_25519_AESGCM_SHA256`. Mesh uses it for
 * pairing and for every transfer between Farbaek Agents (ADR 0038).
 *
 *   -> e
 *   <- e, ee, s, es
 *   -> s, se
 *
 * Each side proves it holds its long-term static key, both static keys
 * travel encrypted, and fresh ephemeral keys give every session new keys.
 * Only `node:crypto` is used: Electron's BoringSSL has X25519, AES-GCM and
 * HMAC-SHA256 but not ChaCha20-Poly1305 through Node's cipher API, which is
 * why this suite and not the ChaChaPoly one. Checked against the published
 * cacophony test vector for this exact suite (noise.test.ts).
 *
 * This follows the specification step by step; nothing here is a new
 * cryptographic construction.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync, timingSafeEqual } from "node:crypto";

export const PROTOCOL_NAME = "Noise_XX_25519_AESGCM_SHA256";
/** The largest Noise message, handshake or transport. */
export const MAX_MESSAGE = 65_535;
const DHLEN = 32;
const HASHLEN = 32;
const TAGLEN = 16;
const MAX_NONCE = 2n ** 64n - 1n;

export class NoiseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoiseError";
  }
}

export interface KeyPair {
  /** Raw 32-byte X25519 private key. */
  privateKey: Buffer;
  /** Raw 32-byte X25519 public key. */
  publicKey: Buffer;
}

const PKCS8_X25519 = Buffer.from("302e020100300506032b656e04220420", "hex");
const SPKI_X25519 = Buffer.from("302a300506032b656e032100", "hex");

const privateKeyObject = (raw: Buffer) => createPrivateKey({ key: Buffer.concat([PKCS8_X25519, raw]), format: "der", type: "pkcs8" });
const publicKeyObject = (raw: Buffer) => createPublicKey({ key: Buffer.concat([SPKI_X25519, raw]), format: "der", type: "spki" });

/** The key pair for a raw private key. */
export function keyPairFromPrivate(raw: Uint8Array): KeyPair {
  if (raw.length !== DHLEN) throw new NoiseError("An X25519 private key is 32 bytes.");
  const privateKey = Buffer.from(raw);
  const publicKey = createPublicKey(privateKeyObject(privateKey)).export({ format: "der", type: "spki" }).subarray(-DHLEN);
  return { privateKey, publicKey: Buffer.from(publicKey) };
}

export function generateKeyPair(): KeyPair {
  const { privateKey } = generateKeyPairSync("x25519");
  return keyPairFromPrivate(privateKey.export({ format: "der", type: "pkcs8" }).subarray(-DHLEN));
}

function dh(own: KeyPair, remotePublic: Buffer): Buffer {
  try {
    return diffieHellman({ privateKey: privateKeyObject(own.privateKey), publicKey: publicKeyObject(remotePublic) });
  } catch {
    throw new NoiseError("The other side sent an unusable key.");
  }
}

const hash = (data: Buffer) => createHash("sha256").update(data).digest();
const hmac = (key: Buffer, data: Buffer) => createHmac("sha256", key).update(data).digest();

/** HKDF as Noise defines it: HMAC-SHA256 with an empty info string, two or three outputs. */
function hkdf(chainingKey: Buffer, inputKeyMaterial: Buffer, outputs: 2 | 3): Buffer[] {
  const tempKey = hmac(chainingKey, inputKeyMaterial);
  const one = hmac(tempKey, Buffer.from([1]));
  const two = hmac(tempKey, Buffer.concat([one, Buffer.from([2])]));
  if (outputs === 2) return [one, two];
  return [one, two, hmac(tempKey, Buffer.concat([two, Buffer.from([3])]))];
}

/** AES-GCM's nonce in Noise: four zero bytes, then the counter as a big-endian 64-bit number. */
function nonce(n: bigint): Buffer {
  const out = Buffer.alloc(12);
  out.writeBigUInt64BE(n, 4);
  return out;
}

/** One direction's key and counter. Messages must be decrypted in the order they were sent. */
export class CipherState {
  private key: Buffer | null = null;
  private n = 0n;

  initializeKey(key: Buffer | null): void {
    this.key = key;
    this.n = 0n;
  }

  hasKey(): boolean {
    return this.key !== null;
  }

  encryptWithAd(ad: Buffer, plaintext: Buffer): Buffer {
    if (!this.key) return Buffer.from(plaintext);
    if (this.n >= MAX_NONCE) throw new NoiseError("This session has sent all the messages it can. Start a new one.");
    const cipher = createCipheriv("aes-256-gcm", this.key, nonce(this.n), { authTagLength: TAGLEN });
    cipher.setAAD(ad);
    const out = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
    this.n += 1n;
    return out;
  }

  decryptWithAd(ad: Buffer, ciphertext: Buffer): Buffer {
    if (!this.key) return Buffer.from(ciphertext);
    if (this.n >= MAX_NONCE) throw new NoiseError("This session has received all the messages it can. Start a new one.");
    if (ciphertext.length < TAGLEN) throw new NoiseError("A message was too short to be genuine.");
    const decipher = createDecipheriv("aes-256-gcm", this.key, nonce(this.n), { authTagLength: TAGLEN });
    decipher.setAAD(ad);
    decipher.setAuthTag(ciphertext.subarray(ciphertext.length - TAGLEN));
    let plaintext: Buffer;
    try {
      plaintext = Buffer.concat([decipher.update(ciphertext.subarray(0, ciphertext.length - TAGLEN)), decipher.final()]);
    } catch {
      // The counter stays put, as the specification requires.
      throw new NoiseError("A message failed its integrity check: it was changed, replayed or arrived out of order.");
    }
    this.n += 1n;
    return plaintext;
  }

  /** Transport messages carry no associated data. */
  encrypt(plaintext: Buffer): Buffer {
    return this.encryptWithAd(Buffer.alloc(0), plaintext);
  }

  decrypt(ciphertext: Buffer): Buffer {
    return this.decryptWithAd(Buffer.alloc(0), ciphertext);
  }
}

class SymmetricState {
  private ck: Buffer;
  h: Buffer;
  readonly cipher = new CipherState();

  constructor(protocolName: string) {
    const name = Buffer.from(protocolName, "ascii");
    this.h = name.length <= HASHLEN ? Buffer.concat([name, Buffer.alloc(HASHLEN - name.length)]) : hash(name);
    this.ck = Buffer.from(this.h);
  }

  mixKey(inputKeyMaterial: Buffer): void {
    const [ck, tempKey] = hkdf(this.ck, inputKeyMaterial, 2);
    this.ck = ck!;
    this.cipher.initializeKey(tempKey!);
  }

  mixHash(data: Buffer): void {
    this.h = hash(Buffer.concat([this.h, data]));
  }

  encryptAndHash(plaintext: Buffer): Buffer {
    const ciphertext = this.cipher.encryptWithAd(this.h, plaintext);
    this.mixHash(ciphertext);
    return ciphertext;
  }

  decryptAndHash(ciphertext: Buffer): Buffer {
    const plaintext = this.cipher.decryptWithAd(this.h, ciphertext);
    this.mixHash(ciphertext);
    return plaintext;
  }

  split(): [CipherState, CipherState] {
    const [k1, k2] = hkdf(this.ck, Buffer.alloc(0), 2);
    const c1 = new CipherState();
    const c2 = new CipherState();
    c1.initializeKey(k1!);
    c2.initializeKey(k2!);
    return [c1, c2];
  }
}

export interface Transport {
  send: CipherState;
  receive: CipherState;
}

/**
 * One XX handshake. The initiator writes messages 1 and 3, the responder
 * message 2. After the third message both sides have a Transport and the
 * other side's verified static public key.
 */
export class XXHandshake {
  private readonly ss: SymmetricState;
  private readonly initiator: boolean;
  private readonly s: KeyPair;
  private e: KeyPair | null = null;
  private re: Buffer | null = null;
  private rs: Buffer | null = null;
  private readonly presetEphemeral: KeyPair | null;
  private step = 0;
  private transport: Transport | null = null;

  constructor(options: { initiator: boolean; prologue: Uint8Array; staticKey: KeyPair; ephemeral?: KeyPair }) {
    this.ss = new SymmetricState(PROTOCOL_NAME);
    this.ss.mixHash(Buffer.from(options.prologue));
    this.initiator = options.initiator;
    this.s = options.staticKey;
    this.presetEphemeral = options.ephemeral ?? null;
  }

  /** Whose turn it is to write. */
  get myTurn(): boolean {
    return this.step < 3 && (this.step % 2 === 0) === this.initiator;
  }

  get complete(): boolean {
    return this.transport !== null;
  }

  /** The handshake hash: identical on both sides only when no one sat in the middle. */
  get handshakeHash(): Buffer {
    if (!this.complete) throw new NoiseError("The handshake hasn't finished.");
    return Buffer.from(this.ss.h);
  }

  /** The other side's static public key, once it has been received and verified. */
  get remoteStatic(): Buffer | null {
    return this.rs ? Buffer.from(this.rs) : null;
  }

  result(): Transport {
    if (!this.transport) throw new NoiseError("The handshake hasn't finished.");
    return this.transport;
  }

  writeMessage(payload: Uint8Array = new Uint8Array()): Buffer {
    if (!this.myTurn) throw new NoiseError("It isn't this side's turn to write.");
    const parts: Buffer[] = [];
    if (this.step === 0) {
      this.writeE(parts);
    } else if (this.step === 1) {
      this.writeE(parts);
      this.ss.mixKey(dh(this.e!, this.re!));
      parts.push(this.ss.encryptAndHash(this.s.publicKey));
      this.ss.mixKey(dh(this.s, this.re!));
    } else {
      parts.push(this.ss.encryptAndHash(this.s.publicKey));
      this.ss.mixKey(dh(this.s, this.re!));
    }
    parts.push(this.ss.encryptAndHash(Buffer.from(payload)));
    const message = Buffer.concat(parts);
    if (message.length > MAX_MESSAGE) throw new NoiseError("That handshake message is too large.");
    this.advance();
    return message;
  }

  readMessage(message: Uint8Array): Buffer {
    if (this.myTurn || this.step >= 3) throw new NoiseError("A handshake message arrived out of turn.");
    if (message.length > MAX_MESSAGE) throw new NoiseError("A handshake message was too large.");
    let rest = Buffer.from(message);
    const take = (n: number) => {
      if (rest.length < n) throw new NoiseError("A handshake message was cut short.");
      const head = rest.subarray(0, n);
      rest = rest.subarray(n);
      return head;
    };
    if (this.step === 0) {
      this.readE(take);
    } else if (this.step === 1) {
      this.readE(take);
      this.ss.mixKey(dh(this.e!, this.re!));
      this.rs = this.ss.decryptAndHash(take(DHLEN + TAGLEN));
      this.ss.mixKey(dh(this.e!, this.rs));
    } else {
      this.rs = this.ss.decryptAndHash(take(DHLEN + TAGLEN));
      this.ss.mixKey(dh(this.e!, this.rs));
    }
    const payload = this.ss.decryptAndHash(rest);
    this.advance();
    return payload;
  }

  private writeE(parts: Buffer[]): void {
    this.e = this.presetEphemeral ?? generateKeyPair();
    parts.push(this.e.publicKey);
    this.ss.mixHash(this.e.publicKey);
  }

  private readE(take: (n: number) => Buffer): void {
    this.re = Buffer.from(take(DHLEN));
    this.ss.mixHash(this.re);
  }

  private advance(): void {
    this.step += 1;
    if (this.step === 3) {
      const [c1, c2] = this.ss.split();
      this.transport = this.initiator ? { send: c1, receive: c2 } : { send: c2, receive: c1 };
    }
  }
}

/**
 * The six-digit code both people compare when pairing, from the handshake
 * hash. Equal codes mean both computers finished the same handshake, so no
 * one relayed it in the middle.
 */
export function pairingCode(handshakeHash: Buffer): string {
  const [key] = hkdf(handshakeHash, Buffer.from("farbaek-mesh/1 code", "utf8"), 2);
  return String(key!.readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

/** A short, stable name for a device's public key. */
export function fingerprint(publicKey: Uint8Array): string {
  return hash(Buffer.from(publicKey)).subarray(0, 8).toString("hex");
}

/** Compares two public keys without leaking where they differ. */
export function sameKey(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
