/**
 * The Mesh wire format in a browser (ADR 0096), byte for byte the agent's
 * (src/agent-runtime/mesh/framing.ts and channel.ts): each Noise message
 * prefixed with its length in two bytes; inside, a two-byte header length,
 * the JSON header, then the body. It runs over any byte pipe: a relay
 * session or a WebRTC data channel.
 */
import { HANDSHAKE_TIMEOUT_MS, HelloSchema, MESH_PROLOGUE, MessageSchema, type Hello, type MeshMessage } from "@/core/mesh/protocol";
import { MAX_MESSAGE, WebNoiseError, WebXXHandshake, concat, type WebKeyPair, type WebTransport } from "./noise";

const TAG = 16;
export const MAX_PLAINTEXT = MAX_MESSAGE - TAG;

/** Bytes both ways, in order. `read` gives the next bytes, or null once the other side has finished. */
export interface BytePipe {
  write(bytes: Uint8Array): Promise<void>;
  read(): Promise<Uint8Array | null>;
  close(): void;
}

export class WireError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WireError";
  }
}

const withTimeout = <T>(promise: Promise<T>, ms: number | undefined, words: string): Promise<T> =>
  ms === undefined
    ? promise
    : new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new WireError(words)), ms);
        promise.then(
          (v) => {
            clearTimeout(timer);
            resolve(v);
          },
          (e) => {
            clearTimeout(timer);
            reject(e);
          },
        );
      });

/** Whole Noise messages from a byte pipe. */
export class FrameReader {
  private pending: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  private ended = false;
  private reading: Promise<Uint8Array | null> | null = null;

  constructor(private readonly pipe: BytePipe) {}

  async read(timeoutMs?: number): Promise<Uint8Array> {
    for (;;) {
      if (this.pending.length >= 2) {
        const length = (this.pending[0]! << 8) | this.pending[1]!;
        if (this.pending.length >= 2 + length) {
          const frame = this.pending.slice(2, 2 + length);
          this.pending = this.pending.slice(2 + length);
          return frame;
        }
      }
      if (this.ended) throw new WireError("The connection closed.");
      // A read that timed out is still under way; the next call waits for it instead of starting another.
      this.reading ??= this.pipe.read();
      const next = await withTimeout(this.reading, timeoutMs, "The other computer stopped answering.");
      this.reading = null;
      if (next === null) this.ended = true;
      else this.pending = concat(this.pending, next);
    }
  }
}

const frame = (message: Uint8Array) => {
  if (message.length > MAX_MESSAGE) throw new WireError("A message was larger than 65,535 bytes.");
  return concat(new Uint8Array([message.length >> 8, message.length & 0xff]), message);
};

const encodeHello = (hello: Hello) => new TextEncoder().encode(JSON.stringify(hello));
function readHello(payload: Uint8Array): Hello {
  try {
    const parsed = HelloSchema.safeParse(JSON.parse(new TextDecoder().decode(payload)));
    if (parsed.success) return parsed.data;
  } catch {
    // Fall through.
  }
  throw new WireError("The other computer didn't introduce itself properly.");
}

export interface WebPeer {
  publicKey: Uint8Array;
  hello: Hello;
}

/** An encrypted, authenticated channel after the handshake. */
export class WebSecureChannel {
  private sending: Promise<void> = Promise.resolve();
  private closed = false;

  constructor(
    private readonly pipe: BytePipe,
    private readonly reader: FrameReader,
    private readonly transport: WebTransport,
    readonly peer: WebPeer,
    readonly handshakeHash: Uint8Array,
  ) {}

  /** Sends a message. Sends are queued, so they're encrypted and written in the order called. */
  send(message: MeshMessage, body?: Uint8Array): Promise<void> {
    const header = new TextEncoder().encode(JSON.stringify(message));
    const plaintext = concat(new Uint8Array([header.length >> 8, header.length & 0xff]), header, body ?? new Uint8Array(0));
    if (header.length > 0xffff || plaintext.length > MAX_PLAINTEXT) return Promise.reject(new WireError("A message was too large to send."));
    const next = this.sending.then(async () => {
      if (this.closed) throw new WireError("The connection closed.");
      await this.pipe.write(frame(await this.transport.send.encrypt(plaintext)));
    });
    this.sending = next.catch(() => undefined);
    return next;
  }

  async receive(timeoutMs?: number): Promise<{ message: MeshMessage; body: Uint8Array }> {
    const ciphertext = await this.reader.read(timeoutMs);
    let plaintext: Uint8Array;
    try {
      plaintext = await this.transport.receive.decrypt(ciphertext);
    } catch (error) {
      this.close();
      throw error instanceof WebNoiseError ? error : new WireError("A message couldn't be decrypted.");
    }
    if (plaintext.length < 2) return this.malformed();
    const headerLength = (plaintext[0]! << 8) | plaintext[1]!;
    if (plaintext.length < 2 + headerLength) return this.malformed();
    let json: unknown;
    try {
      json = JSON.parse(new TextDecoder().decode(plaintext.subarray(2, 2 + headerLength)));
    } catch {
      return this.malformed();
    }
    const parsed = MessageSchema.safeParse(json);
    if (!parsed.success) return this.malformed();
    return { message: parsed.data, body: plaintext.subarray(2 + headerLength) };
  }

  /** JSON too large for one message: the header announces its size, `data` messages carry it. */
  async sendBlob(message: Extract<MeshMessage, { size: number }>, json: Uint8Array): Promise<void> {
    if (json.length !== message.size) throw new WireError("The announced size doesn't match the body.");
    await this.send(message);
    const piece = MAX_PLAINTEXT - 64;
    for (let at = 0; at < json.length; at += piece) await this.send({ t: "data" }, json.subarray(at, at + piece));
  }

  async receiveBlob(size: number, timeoutMs?: number): Promise<Uint8Array> {
    const parts: Uint8Array[] = [];
    let received = 0;
    while (received < size) {
      const { message, body } = await this.receive(timeoutMs);
      if (message.t !== "data" || received + body.length > size) return this.malformed();
      parts.push(body);
      received += body.length;
    }
    return concat(...parts);
  }

  /** Closes after what was already queued has been written. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    void this.sending.finally(() => this.pipe.close());
  }

  private malformed(): never {
    this.close();
    throw new WireError("The other computer sent something this version doesn't understand.");
  }
}

/** Answers a call: the handshake as the responder, as the agent's `respond`. The caller's purpose arrives in its last message. */
export async function respondWeb(pipe: BytePipe, staticKey: WebKeyPair, hello: Hello, timeoutMs = HANDSHAKE_TIMEOUT_MS): Promise<WebSecureChannel> {
  const reader = new FrameReader(pipe);
  try {
    const hs = new WebXXHandshake({ initiator: false, prologue: MESH_PROLOGUE, staticKey });
    await hs.readMessage(await reader.read(timeoutMs));
    await pipe.write(frame(await hs.writeMessage(encodeHello(hello))));
    const theirs = readHello(await hs.readMessage(await reader.read(timeoutMs)));
    return new WebSecureChannel(pipe, reader, hs.result(), { publicKey: hs.remoteStatic!, hello: theirs }, hs.handshakeHash);
  } catch (error) {
    pipe.close();
    throw error;
  }
}

/** Calls another device and runs the handshake as the initiator, as the agent's `initiate`. */
export async function initiateWeb(pipe: BytePipe, staticKey: WebKeyPair, hello: Hello, timeoutMs = HANDSHAKE_TIMEOUT_MS): Promise<WebSecureChannel> {
  const reader = new FrameReader(pipe);
  try {
    const hs = new WebXXHandshake({ initiator: true, prologue: MESH_PROLOGUE, staticKey });
    await pipe.write(frame(await hs.writeMessage()));
    const theirs = readHello(await hs.readMessage(await reader.read(timeoutMs)));
    await pipe.write(frame(await hs.writeMessage(encodeHello(hello))));
    return new WebSecureChannel(pipe, reader, hs.result(), { publicKey: hs.remoteStatic!, hello: theirs }, hs.handshakeHash);
  } catch (error) {
    pipe.close();
    throw error;
  }
}
