/**
 * An encrypted, mutually authenticated channel between two Farbaek Agents:
 * a Noise XX handshake over a framed TCP socket, then typed messages
 * (../../core/mesh/protocol.ts). Each message is a two-byte header length,
 * the JSON header and an optional binary body, encrypted as one Noise
 * transport message. Anything malformed ends the channel.
 */
import type { Duplex } from "node:stream";
import { PAIRING_VERSION } from "@/core/mesh/pairing";
import { HANDSHAKE_TIMEOUT_MS, HelloSchema, MESH_PROLOGUE, MessageSchema, type Hello, type MeshMessage } from "@/core/mesh/protocol";
import { FramedSocket } from "./framing";
import { MAX_MESSAGE, NoiseError, XXHandshake, type KeyPair, type Transport } from "./noise";

const TAG = 16;
/** Plaintext room in one message: Noise's limit less the AES-GCM tag. */
export const MAX_PLAINTEXT = MAX_MESSAGE - TAG;

export class ChannelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChannelError";
  }
}

export interface Peer {
  publicKey: Buffer;
  hello: Hello;
}

export class SecureChannel {
  private sending: Promise<void> = Promise.resolve();

  constructor(
    private readonly framed: FramedSocket,
    private readonly transport: Transport,
    readonly peer: Peer,
    readonly handshakeHash: Buffer,
  ) {}

  get closed(): boolean {
    return this.framed.closed;
  }

  /** The other computer's address on a direct connection; none through the relay. */
  get remoteAddress(): string | undefined {
    return (this.framed.socket as { remoteAddress?: string }).remoteAddress;
  }

  /** Called once the connection has closed, from either side. */
  onClose(listener: () => void): void {
    if (this.framed.closed) listener();
    else this.framed.socket.once("close", listener);
  }

  /**
   * Sends a message. Calls are queued, so messages are encrypted and written
   * in the order they were sent, which is the order the other side decrypts.
   */
  send(message: MeshMessage, body?: Uint8Array): Promise<void> {
    const header = Buffer.from(JSON.stringify(message), "utf8");
    const plaintext = Buffer.concat([Buffer.from([header.length >> 8, header.length & 0xff]), header, body ? Buffer.from(body.buffer, body.byteOffset, body.byteLength) : Buffer.alloc(0)]);
    if (header.length > 0xffff || plaintext.length > MAX_PLAINTEXT) return Promise.reject(new ChannelError("A message was too large to send."));
    const next = this.sending.then(() => this.framed.write(this.transport.send.encrypt(plaintext)));
    // A failed write fails this send; later sends see the closed socket themselves.
    this.sending = next.catch(() => undefined);
    return next;
  }

  async receive(timeoutMs?: number): Promise<{ message: MeshMessage; body: Buffer }> {
    const frame = await this.framed.read(timeoutMs);
    let plaintext: Buffer;
    try {
      plaintext = this.transport.receive.decrypt(frame);
    } catch (error) {
      this.close();
      throw error instanceof NoiseError ? error : new ChannelError("A message couldn't be decrypted.");
    }
    if (plaintext.length < 2) return this.malformed();
    const headerLength = plaintext.readUInt16BE(0);
    if (plaintext.length < 2 + headerLength) return this.malformed();
    let json: unknown;
    try {
      json = JSON.parse(plaintext.subarray(2, 2 + headerLength).toString("utf8"));
    } catch {
      return this.malformed();
    }
    const parsed = MessageSchema.safeParse(json);
    if (!parsed.success) return this.malformed();
    return { message: parsed.data, body: plaintext.subarray(2 + headerLength) };
  }

  /** Sends JSON too large for one message: the header announces its size, `data` messages carry it. */
  async sendBlob(message: Extract<MeshMessage, { size: number }>, json: Uint8Array): Promise<void> {
    if (json.length !== message.size) throw new ChannelError("The announced size doesn't match the body.");
    await this.send(message);
    const piece = MAX_PLAINTEXT - 64;
    for (let at = 0; at < json.length; at += piece) await this.send({ t: "data" }, json.subarray(at, at + piece));
  }

  /** Reads the body a `sendBlob` header announced. */
  async receiveBlob(size: number, timeoutMs?: number): Promise<Buffer> {
    const parts: Buffer[] = [];
    let received = 0;
    while (received < size) {
      const { message, body } = await this.receive(timeoutMs);
      if (message.t !== "data" || received + body.length > size) return this.malformed();
      parts.push(body);
      received += body.length;
    }
    return Buffer.concat(parts);
  }

  close(): void {
    this.framed.close();
  }

  private malformed(): never {
    this.close();
    throw new ChannelError("The other computer sent something this version doesn't understand.");
  }
}

function readHello(payload: Buffer): Hello {
  let json: unknown;
  try {
    json = JSON.parse(payload.toString("utf8"));
  } catch {
    throw new ChannelError("The other computer didn't introduce itself properly.");
  }
  const parsed = HelloSchema.safeParse(json);
  if (!parsed.success) throw new ChannelError("The other computer didn't introduce itself properly.");
  return parsed.data;
}

/** Every hello says which pairing steps this device follows (ADR 0194), whatever its purpose. */
const encodeHello = (hello: Hello) => Buffer.from(JSON.stringify({ ...hello, pairing: PAIRING_VERSION } satisfies Hello), "utf8");

/** Calls another device and runs the handshake as the initiator. Through the relay, the other side may take longer to answer. */
export async function initiate(socket: Duplex, staticKey: KeyPair, hello: Hello, timeoutMs = HANDSHAKE_TIMEOUT_MS): Promise<SecureChannel> {
  const framed = new FramedSocket(socket);
  try {
    const hs = new XXHandshake({ initiator: true, prologue: MESH_PROLOGUE, staticKey });
    await framed.write(hs.writeMessage());
    const theirs = readHello(hs.readMessage(await framed.read(timeoutMs)));
    await framed.write(hs.writeMessage(encodeHello(hello)));
    return new SecureChannel(framed, hs.result(), { publicKey: hs.remoteStatic!, hello: theirs }, hs.handshakeHash);
  } catch (error) {
    framed.close();
    throw error;
  }
}

/** Answers a call: the handshake as the responder. The caller's purpose arrives in its last message. */
export async function respond(socket: Duplex, staticKey: KeyPair, hello: Hello): Promise<SecureChannel> {
  const framed = new FramedSocket(socket);
  try {
    const hs = new XXHandshake({ initiator: false, prologue: MESH_PROLOGUE, staticKey });
    hs.readMessage(await framed.read(HANDSHAKE_TIMEOUT_MS));
    await framed.write(hs.writeMessage(encodeHello(hello)));
    const theirs = readHello(hs.readMessage(await framed.read(HANDSHAKE_TIMEOUT_MS)));
    return new SecureChannel(framed, hs.result(), { publicKey: hs.remoteStatic!, hello: theirs }, hs.handshakeHash);
  } catch (error) {
    framed.close();
    throw error;
  }
}
