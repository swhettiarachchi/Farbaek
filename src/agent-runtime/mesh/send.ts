/**
 * Sending a nearby transfer to a paired device. The sender offers the
 * manifest and waits for the person on the other computer to accept; it
 * then streams each file from the chunk the receiver asks for, re-checking
 * every chunk it reads against the manifest (a file edited since packing
 * stops the transfer instead of sending something else). It reports success
 * only when the receiver says every file matched.
 */
import { CHUNK_BYTES, ChunkHasher } from "@/core/mesh/capsule";
import { DATA_PIECE_BYTES, OFFER_TIMEOUT_MS, ResumeSchema, type MeshMessage, type TransferState } from "@/core/mesh/protocol";
import { ProjectFolder } from "../fs-guard";
import { ChannelError, type SecureChannel } from "./channel";
import type { TrustedDevice } from "./identity";
import { sameKey } from "./noise";
import type { PackedFolder } from "./pack";

export interface OutgoingView {
  id: string;
  direction: "out";
  state: TransferState;
  peer: { name: string; fingerprint: string };
  name: string;
  files: number;
  bytes: number;
  bytesDone: number;
  excluded: { path: string; reason: string }[];
  excludedCount: number;
  destination: null;
  message: string | null;
  updatedAt: string;
}

class SourceChanged extends Error {}

export class OutgoingTransfer {
  state: TransferState = "connecting";
  message: string | null = null;
  bytesDone = 0;
  updatedAt = new Date();
  private channel: SecureChannel | null = null;
  private stopped: MeshMessage | null = null;
  private watching: Promise<MeshMessage> | null = null;

  constructor(
    readonly id: string,
    readonly packed: PackedFolder,
    readonly device: TrustedDevice,
    private readonly connect: () => Promise<SecureChannel>,
    private readonly onUpdate: () => void,
    /** What to say when the other computer can't be reached; nearby by default. */
    private readonly unreachable?: (error: unknown) => string,
  ) {}

  view(): OutgoingView {
    const m = this.packed.manifest;
    return {
      id: this.id,
      direction: "out",
      state: this.state,
      peer: { name: this.device.name, fingerprint: this.device.fingerprint },
      name: this.packed.name,
      files: m.totals.files,
      bytes: m.totals.bytes,
      bytesDone: this.bytesDone,
      excluded: m.excluded.slice(0, 50),
      excludedCount: m.excluded.length,
      destination: null,
      message: this.message,
      updatedAt: this.updatedAt.toISOString(),
    };
  }

  private set(state: TransferState, message: string | null = null): void {
    this.state = state;
    this.message = message;
    this.updatedAt = new Date();
    this.onUpdate();
  }

  /** Connects, offers and sends. Also used to resume: the receiver says where to carry on. */
  async start(): Promise<void> {
    this.stopped = null;
    this.watching = null;
    this.set("connecting");
    let channel: SecureChannel;
    try {
      channel = await this.connect();
    } catch (error) {
      this.set("interrupted", this.unreachable?.(error) ?? `Couldn't reach ${this.device.name}. Make sure it's visible on the same network, then resume.`);
      return;
    }
    this.channel = channel;
    if (!sameKey(channel.peer.publicKey, Buffer.from(this.device.publicKey, "hex"))) {
      channel.close();
      this.set("failed", `The computer that answered isn't the ${this.device.name} you paired with, so nothing was sent.`);
      return;
    }

    try {
      const body = Buffer.from(JSON.stringify(this.packed.manifest), "utf8");
      await channel.sendBlob({ t: "offer", session: this.id, digest: this.packed.digest, size: body.length }, body);
      this.set("waiting", `Waiting for someone on ${this.device.name} to accept.`);
      const { message } = await channel.receive(OFFER_TIMEOUT_MS);
      if (message.t === "decline") {
        channel.close();
        this.set("declined", `${this.device.name} declined. Nothing was sent.`);
        return;
      }
      if (message.t === "error") {
        channel.close();
        this.set("failed", `${this.device.name}: ${message.message}`);
        return;
      }
      if (message.t === "verified") {
        // A resume of a transfer the other computer had already finished and checked.
        channel.close();
        this.bytesDone = this.packed.manifest.totals.bytes;
        this.set("done", `Delivered. ${this.device.name} had already checked every file against its hash.`);
        return;
      }
      if (message.t !== "accept") throw new ChannelError("The other computer answered out of order.");
      const parsed = ResumeSchema.safeParse(JSON.parse((await channel.receiveBlob(message.size, OFFER_TIMEOUT_MS)).toString("utf8")));
      if (!parsed.success) throw new ChannelError("The other computer's answer wasn't readable.");
      const resume = new Map(parsed.data.resume);

      this.set("sending");
      const watching = this.watch(channel);
      this.watching = watching;
      // Awaited below; this keeps an early failure from going unhandled while files stream.
      watching.catch(() => undefined);
      await this.stream(channel, resume);
      if (!this.stopped) this.set("finishing", `Sent. ${this.device.name} is checking every file.`);
      const final = await watching;
      channel.close();
      if (final.t === "verified") this.set("done", `Delivered. ${this.device.name} checked every file against its hash.`);
      else if (final.t === "cancel") this.set("cancelled", `${this.device.name} cancelled the transfer.`);
      else if (final.t === "error") this.set("failed", `${this.device.name} stopped: ${final.message}`);
    } catch (error) {
      if (error instanceof SourceChanged) {
        channel.close();
        this.set("failed", error.message);
        return;
      }
      if (this.state === "cancelled") {
        channel.close();
        return;
      }
      // The receiver may have stopped us on purpose and closed: its last word is still queued to read.
      const last = await Promise.race([this.watching?.catch(() => null) ?? Promise.resolve(null), new Promise<null>((resolve) => setTimeout(() => resolve(null), 1_000))]);
      channel.close();
      if (last?.t === "error") this.set("failed", `${this.device.name} stopped: ${last.message}`);
      else if (last?.t === "cancel") this.set("cancelled", `${this.device.name} cancelled the transfer.`);
      else this.set("interrupted", `The connection to ${this.device.name} dropped. Resume to carry on from the last checked piece.`);
    }
  }

  /** Listens while sending, for the receiver's verdict or an early stop. */
  private async watch(channel: SecureChannel): Promise<MeshMessage> {
    const { message } = await channel.receive();
    if (message.t === "verified" || message.t === "cancel" || message.t === "error") {
      if (message.t !== "verified") this.stopped = message;
      return message;
    }
    channel.close();
    throw new ChannelError("The other computer sent something out of order.");
  }

  private async stream(channel: SecureChannel, resume: Map<number, number>): Promise<void> {
    const folder = await ProjectFolder.open(this.packed.root);
    const files = this.packed.manifest.files;
    this.bytesDone = files.reduce((sum, entry, f) => sum + Math.min(entry.bytes, (resume.get(f) ?? 0) * CHUNK_BYTES), 0);
    for (const [f, entry] of files.entries()) {
      const from = resume.get(f) ?? 0;
      if (from >= entry.chunks.length) continue;
      if (this.stopped) return;
      await channel.send({ t: "file", f, from });
      if (entry.bytes === 0) continue;

      const { handle, size } = await folder.openRead(entry.path);
      try {
        if (size !== entry.bytes) throw new SourceChanged(`${entry.path} changed on this computer after it was packed, so the transfer stopped. Send the folder again.`);
        const hasher = new ChunkHasher((chunk) => {
          const expected = entry.chunks[from + chunk.index];
          if (!expected || expected.blake3 !== chunk.blake3) throw new SourceChanged(`${entry.path} changed on this computer after it was packed, so the transfer stopped. Send the folder again.`);
        });
        for await (const piece of handle.createReadStream({ start: from * CHUNK_BYTES, highWaterMark: DATA_PIECE_BYTES, autoClose: false })) {
          if (this.stopped) return;
          const bytes = piece as Buffer;
          hasher.update(bytes);
          await channel.send({ t: "data" }, bytes);
          this.bytesDone += bytes.length;
          this.progress();
        }
        hasher.digest();
      } catch (error) {
        if (error instanceof SourceChanged) await channel.send({ t: "error", code: "source_changed", message: error.message }).catch(() => undefined);
        throw error;
      } finally {
        await handle.close();
      }
    }
  }

  private lastProgress = 0;
  private progress(): void {
    const now = Date.now();
    if (now - this.lastProgress < 200) return;
    this.lastProgress = now;
    this.updatedAt = new Date();
    this.onUpdate();
  }

  async cancel(): Promise<void> {
    if (this.state === "done" || this.state === "cancelled" || this.state === "failed" || this.state === "declined") return;
    this.set("cancelled", "Cancelled. The other computer removes what it received.");
    await this.channel?.send({ t: "cancel" }).catch(() => undefined);
    this.channel?.close();
  }
}
