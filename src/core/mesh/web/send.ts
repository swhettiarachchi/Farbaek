/**
 * Sending picked files from a browser to a paired computer (ADR 0096): the
 * same steps, states and words as the Farbaek Agent's OutgoingTransfer
 * (src/agent-runtime/mesh/send.ts). Offer the manifest, wait for the person
 * on the computer to accept, stream each file in 60 KB pieces checked
 * against its chunk hashes, and report "Delivered" only once the computer
 * has checked every file. A dropped connection resumes from the last chunk
 * the computer checked.
 */
import { CHUNK_BYTES, ChunkHasher } from "@/core/mesh/capsule";
import { DATA_PIECE_BYTES, OFFER_TIMEOUT_MS, ResumeSchema, type MeshMessage, type TransferState } from "@/core/mesh/protocol";
import { sameWebKey } from "./noise";
import type { WebPacked } from "./pack";
import { WireError, type WebSecureChannel } from "./wire";

export interface WebDevice {
  name: string;
  fingerprint: string;
  publicKey: Uint8Array;
}

export interface WebOutgoingView {
  id: string;
  state: TransferState;
  device: { name: string; fingerprint: string };
  name: string;
  files: number;
  bytes: number;
  bytesDone: number;
  via: "relay" | "direct";
  canUseRelay: boolean;
  message: string | null;
}

class SourceChanged extends Error {}

export class WebOutgoing {
  state: TransferState = "connecting";
  message: string | null = null;
  bytesDone = 0;
  via: "relay" | "direct";
  canUseRelay = false;
  private channel: WebSecureChannel | null = null;
  private stopped: MeshMessage | null = null;
  private watching: Promise<MeshMessage> | null = null;

  constructor(
    readonly id: string,
    readonly packed: WebPacked,
    readonly device: WebDevice,
    via: "relay" | "direct",
    /** Opens the channel the current way; throws when it can't. */
    private readonly connect: (via: "relay" | "direct") => Promise<WebSecureChannel>,
    private readonly onUpdate: () => void,
    /** Words for a failure to connect, and whether the person may choose the relay instead. */
    private readonly unreachable: (error: unknown) => { message: string; canUseRelay: boolean },
  ) {
    this.via = via;
  }

  view(): WebOutgoingView {
    const m = this.packed.manifest;
    return {
      id: this.id,
      state: this.state,
      device: { name: this.device.name, fingerprint: this.device.fingerprint },
      name: this.packed.name,
      files: m.totals.files,
      bytes: m.totals.bytes,
      bytesDone: this.bytesDone,
      via: this.via,
      canUseRelay: this.state === "interrupted" && this.canUseRelay,
      message: this.message,
    };
  }

  /** Set by cancel(), whatever step the transfer was at; a cancelled transfer never moves on. */
  private cancelled = false;

  private set(state: TransferState, message: string | null = null): void {
    // Steps still under way when the person cancelled don't bring the transfer back.
    if (this.cancelled && state !== "cancelled") return;
    this.state = state;
    this.message = message;
    this.onUpdate();
  }

  /** The person chose Farbaek's relay after a direct link was blocked. */
  useRelay(): Promise<void> {
    if (!(this.state === "interrupted" && this.canUseRelay)) return Promise.resolve();
    this.via = "relay";
    this.canUseRelay = false;
    return this.start();
  }

  /** Connects, offers and sends. Also resumes: the computer says where to carry on. */
  async start(): Promise<void> {
    if (this.cancelled) return;
    this.stopped = null;
    this.watching = null;
    this.set("connecting");
    let channel: WebSecureChannel;
    try {
      channel = await this.connect(this.via);
    } catch (error) {
      const { message, canUseRelay } = this.unreachable(error);
      this.canUseRelay = canUseRelay;
      this.set("interrupted", message);
      return;
    }
    // Cancelled while connecting: nothing is offered.
    if (this.cancelled) {
      channel.close();
      return;
    }
    this.channel = channel;
    if (!sameWebKey(channel.peer.publicKey, this.device.publicKey)) {
      channel.close();
      this.set("failed", `The computer that answered isn't the ${this.device.name} you paired with, so nothing was sent.`);
      return;
    }
    try {
      const body = new TextEncoder().encode(JSON.stringify(this.packed.manifest));
      await channel.sendBlob({ t: "offer", session: this.id, digest: this.packed.digest, size: body.length }, body);
      this.set("waiting", `Waiting for someone on ${this.device.name} to accept.`);
      const { message } = await channel.receive(OFFER_TIMEOUT_MS);
      if (message.t === "decline") {
        channel.close();
        return this.set("declined", `${this.device.name} declined. Nothing was sent.`);
      }
      if (message.t === "cancel") {
        // Cancelled on the computer while the offer waited: over, not resumable.
        channel.close();
        return this.cancelledThere("Nothing was sent.");
      }
      if (message.t === "error") {
        channel.close();
        return this.set("failed", `${this.device.name}: ${message.message}`);
      }
      if (message.t === "verified") {
        channel.close();
        this.bytesDone = this.packed.manifest.totals.bytes;
        return this.set("done", `Delivered. ${this.device.name} had already checked every file against its hash.`);
      }
      if (message.t !== "accept") throw new WireError("The computer answered out of order.");
      const parsed = ResumeSchema.safeParse(JSON.parse(new TextDecoder().decode(await channel.receiveBlob(message.size, OFFER_TIMEOUT_MS))));
      if (!parsed.success) throw new WireError("The computer's answer wasn't readable.");

      this.set("sending");
      const watching = this.watch(channel);
      this.watching = watching;
      watching.catch(() => undefined);
      await this.stream(channel, new Map(parsed.data.resume));
      if (!this.stopped) this.set("finishing", `Sent. ${this.device.name} is checking every file.`);
      const final = await watching;
      channel.close();
      if (final.t === "verified") this.set("done", `Delivered. ${this.device.name} checked every file against its hash.`);
      else if (final.t === "cancel") this.cancelledThere();
      else if (final.t === "error") this.set("failed", `${this.device.name} stopped: ${final.message}`);
    } catch (error) {
      if (error instanceof SourceChanged) {
        channel.close();
        return this.set("failed", error.message);
      }
      if (this.state === "cancelled") return channel.close();
      const last = await Promise.race([this.watching?.catch(() => null) ?? Promise.resolve(null), new Promise<null>((r) => setTimeout(() => r(null), 1_000))]);
      channel.close();
      if (last?.t === "error") this.set("failed", `${this.device.name} stopped: ${last.message}`);
      else if (last?.t === "cancel") this.cancelledThere();
      else this.set("interrupted", `The connection to ${this.device.name} dropped. Resume to carry on from the last checked piece.`);
    }
  }

  private async watch(channel: WebSecureChannel): Promise<MeshMessage> {
    const { message } = await channel.receive();
    if (message.t === "verified" || message.t === "cancel" || message.t === "error") {
      if (message.t !== "verified") this.stopped = message;
      // Cancelled at once: the connection the receiver closes next can't make it "interrupted".
      if (message.t === "cancel") this.cancelledThere();
      return message;
    }
    channel.close();
    throw new WireError("The computer sent something out of order.");
  }

  private async stream(channel: WebSecureChannel, resume: Map<number, number>): Promise<void> {
    const files = this.packed.manifest.files;
    this.bytesDone = files.reduce((sum, entry, f) => sum + Math.min(entry.bytes, (resume.get(f) ?? 0) * CHUNK_BYTES), 0);
    for (const [f, entry] of files.entries()) {
      const from = resume.get(f) ?? 0;
      if (from >= entry.chunks.length) continue;
      if (this.stopped) return;
      await channel.send({ t: "file", f, from });
      if (entry.bytes === 0) continue;
      const source = this.packed.sources.get(entry.path);
      if (!source || source.size !== entry.bytes) throw new SourceChanged(`${entry.path} changed on this device after it was chosen, so the transfer stopped. Choose it again.`);
      const changed = () => new SourceChanged(`${entry.path} changed on this device after it was chosen, so the transfer stopped. Choose it again.`);
      const hasher = new ChunkHasher((chunk) => {
        const expected = entry.chunks[from + chunk.index];
        if (!expected || expected.blake3 !== chunk.blake3) throw changed();
      });
      try {
        for (let at = from * CHUNK_BYTES; at < entry.bytes; at += DATA_PIECE_BYTES) {
          if (this.stopped) return;
          const piece = new Uint8Array(await source.slice(at, Math.min(entry.bytes, at + DATA_PIECE_BYTES)).arrayBuffer());
          hasher.update(piece);
          await channel.send({ t: "data" }, piece);
          this.bytesDone += piece.length;
          this.onUpdate();
        }
        hasher.digest();
      } catch (error) {
        if (error instanceof SourceChanged) await channel.send({ t: "error", code: "source_changed", message: error.message }).catch(() => undefined);
        throw error;
      }
    }
  }

  /** The other side cancelled: as final as cancelling here, so nothing later, such as the dropped connection, brings the transfer back. */
  private cancelledThere(more?: string): void {
    this.cancelled = true;
    this.set("cancelled", `${this.device.name} cancelled the transfer.${more ? ` ${more}` : ""}`);
  }

  async cancel(): Promise<void> {
    if (this.state === "done" || this.state === "cancelled" || this.state === "failed" || this.state === "declined") return;
    this.cancelled = true;
    this.set("cancelled", "Cancelled. The computer removes what it received.");
    await this.channel?.send({ t: "cancel" }).catch(() => undefined);
    this.channel?.close();
  }
}
