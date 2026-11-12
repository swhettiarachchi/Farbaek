/**
 * Receiving a folder from a paired computer in a browser (ADR 0097): the
 * same checks, states and words as the Farbaek Agent's IncomingTransfer
 * (src/agent-runtime/mesh/receive.ts). The offer's list of files is checked
 * before anything is accepted; every 4 MiB chunk and every whole file is
 * checked against its BLAKE3 hash as it arrives; anything that doesn't match,
 * or a cancel from either side, removes everything received. Files are kept
 * in a FileSink until the person saves them. Nothing received runs.
 */
import { ChunkHasher, ManifestSchema, checkManifest, manifestDigest, type CapsuleManifest } from "@/core/mesh/capsule";
import { MAX_MANIFEST_BYTES, TRANSFER_LIMITS, type MeshErrorCode, type MeshMessage, type TransferState } from "@/core/mesh/protocol";
import { WebNoiseError, webFingerprint } from "./noise";
import { WebRelayError } from "./relay-pipe";
import { SinkError, type FileSink, type SinkFile } from "./sinks";
import { WireError, type WebSecureChannel } from "./wire";

const IDLE_MS = 60_000;

export class WebOfferError extends Error {
  constructor(
    message: string,
    readonly problems: string[] = [],
  ) {
    super(message);
    this.name = "WebOfferError";
  }
}

type Received = Awaited<ReturnType<WebSecureChannel["receive"]>>;

/** Errors that mean the connection was lost or tampered with, not that the files were wrong. */
const dropped = (error: unknown) => error instanceof WireError || error instanceof WebNoiseError || error instanceof WebRelayError;

class Mismatch extends Error {
  constructor(
    message: string,
    readonly code: MeshErrorCode = "protocol",
  ) {
    super(message);
  }
}

/** Reads and checks an offer's list of files exactly as the agent does. Throws WebOfferError in words. */
export async function readOfferWeb(channel: WebSecureChannel, offer: Extract<MeshMessage, { t: "offer" }>): Promise<CapsuleManifest> {
  const body = await channel.receiveBlob(offer.size, IDLE_MS);
  if (body.length > MAX_MANIFEST_BYTES) throw new WebOfferError("The list of files is too large.");
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new WebOfferError("The list of files wasn't readable.");
  }
  const parsed = ManifestSchema.safeParse(json);
  if (!parsed.success) throw new WebOfferError("The list of files isn't in the Capsule format.");
  if (manifestDigest(parsed.data) !== offer.digest) throw new WebOfferError("The list of files doesn't match its digest.");
  const problems = checkManifest(parsed.data, TRANSFER_LIMITS, { diskPaths: true });
  if (problems.length > 0) throw new WebOfferError("Some files in this transfer can't be accepted.", problems);
  return parsed.data;
}

export interface WebIncomingView {
  id: string;
  state: TransferState;
  peer: { name: string; fingerprint: string };
  name: string;
  files: number;
  bytes: number;
  bytesDone: number;
  excluded: { path: string; reason: string }[];
  excludedCount: number;
  via: "relay" | "direct";
  message: string | null;
}

export class WebIncoming {
  state: TransferState = "offered";
  message: string | null = null;
  bytesDone = 0;
  sink: FileSink | null = null;
  private readonly peerName: string;
  private peerFingerprint = "";
  /** The first message after the offer: a cancel while the person decides, or the first file once they accept. */
  private first: Promise<Received> | null;

  constructor(
    private readonly channel: WebSecureChannel,
    readonly id: string,
    readonly manifest: CapsuleManifest,
    readonly via: "relay" | "direct",
    private readonly onUpdate: () => void,
    /** The name saved at pairing; a paired computer can't pose as another by naming itself on a later call. */
    trustedName?: string,
  ) {
    this.peerName = trustedName ?? channel.peer.hello.name;
    void webFingerprint(channel.peer.publicKey).then((fp) => {
      this.peerFingerprint = fp;
      this.onUpdate();
    });
    // Nothing arrives before the person answers unless the computer gives up waiting.
    this.first = channel.receive();
    this.first.then(
      () => this.gaveUp(),
      () => this.gaveUp(),
    );
  }

  private gaveUp(): void {
    if (this.state !== "offered") return;
    this.channel.close();
    this.set("cancelled", `${this.peerName} stopped waiting. Nothing was kept.`);
  }

  view(): WebIncomingView {
    return {
      id: this.id,
      state: this.state,
      peer: { name: this.peerName, fingerprint: this.peerFingerprint },
      name: this.manifest.source.projectName,
      files: this.manifest.totals.files,
      bytes: this.manifest.totals.bytes,
      bytesDone: this.bytesDone,
      excluded: this.manifest.excluded.slice(0, 50),
      excludedCount: this.manifest.excluded.length,
      via: this.via,
      message: this.message,
    };
  }

  private set(state: TransferState, message: string | null = null): void {
    this.state = state;
    this.message = message;
    this.onUpdate();
  }

  private lastProgress = 0;
  private progress(): void {
    const now = Date.now();
    if (now - this.lastProgress < 200) return;
    this.lastProgress = now;
    this.onUpdate();
  }

  /** The next message, the first one already under way. */
  private next(): Promise<Received> {
    const first = this.first;
    this.first = null;
    if (!first) return this.channel.receive(IDLE_MS);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new WireError("The other computer stopped answering.")), IDLE_MS);
      first.then(
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
  }

  /** Accepts into `sink` and receives. */
  async accept(sink: FileSink): Promise<void> {
    if (this.state !== "offered") throw new WebOfferError("This transfer can't be accepted now.");
    try {
      await sink.reserve(this.manifest.totals.bytes);
    } catch (error) {
      const words = error instanceof SinkError ? error.message : "This browser can't keep these files.";
      await this.channel.send({ t: "error", code: "no_space", message: "The receiving phone or browser doesn't have room for this transfer." }).catch(() => undefined);
      this.channel.close();
      this.set("failed", words);
      return;
    }
    // The computer may have given up while space was checked.
    if (this.state !== "offered") return;
    this.sink = sink;
    await this.run(sink);
  }

  async decline(): Promise<void> {
    if (this.state !== "offered") return;
    await this.channel.send({ t: "decline" }).catch(() => undefined);
    this.channel.close();
    this.set("declined", "You declined this transfer. Nothing was kept.");
  }

  async cancel(): Promise<void> {
    if (this.state === "done" || this.state === "cancelled" || this.state === "failed" || this.state === "declined") return;
    await this.channel.send({ t: "cancel" }).catch(() => undefined);
    this.channel.close();
    await this.sink?.clear();
    this.set("cancelled", "Cancelled. Everything received was removed.");
  }

  private async run(sink: FileSink): Promise<void> {
    const channel = this.channel;
    const complete = this.manifest.files.map(() => false);
    const body = new TextEncoder().encode(JSON.stringify({ resume: [] }));
    this.set("receiving");
    let current: { f: number; file: SinkFile; hasher: ChunkHasher; received: number } | null = null;
    try {
      await channel.sendBlob({ t: "accept", size: body.length }, body);
      while (complete.some((c) => !c)) {
        const { message, body: piece } = await this.next();
        if (message.t === "cancel" || message.t === "error") {
          channel.close();
          await sink.clear();
          if (message.t === "cancel") this.set("cancelled", `${this.peerName} cancelled. Everything received was removed.`);
          else this.set("failed", `${this.peerName} stopped: ${message.message} Nothing was kept.`);
          return;
        }
        if (message.t === "file") {
          if (current || message.f >= complete.length || complete[message.f] || message.from !== 0) throw new Mismatch("The sender skipped ahead of what was checked.");
          const entry = this.manifest.files[message.f]!;
          const hasher = new ChunkHasher((chunk) => {
            const expected = entry.chunks[chunk.index];
            if (!expected || expected.blake3 !== chunk.blake3 || expected.bytes !== chunk.bytes) throw new Mismatch(`${entry.path} didn't match its hash at chunk ${chunk.index + 1}.`, "chunk_mismatch");
          });
          current = { f: message.f, file: await sink.open(entry.path), hasher, received: 0 };
          if (entry.bytes === 0) current = await this.finishFile(current, complete);
          continue;
        }
        if (message.t === "data" && current) {
          const entry = this.manifest.files[current.f]!;
          if (current.received + piece.length > entry.bytes) throw new Mismatch(`${entry.path} is longer than its listed size.`);
          current.hasher.update(piece);
          await current.file.write(piece);
          current.received += piece.length;
          this.bytesDone += piece.length;
          this.progress();
          if (current.received === entry.bytes) current = await this.finishFile(current, complete);
          continue;
        }
        throw new Mismatch("The sender sent something out of order.");
      }
      await sink.seal({ name: this.manifest.source.projectName, from: this.peerName, at: new Date().toISOString() });
      this.set("done", "Every file matched its hash.");
      await channel.send({ t: "verified", files: this.manifest.totals.files, bytes: this.manifest.totals.bytes }).catch(() => undefined);
      channel.close();
    } catch (error) {
      await current?.file.close().catch(() => undefined);
      // Cancelled here: that already removed everything and said so.
      if (this.state === "cancelled") return;
      await sink.clear();
      if (dropped(error)) {
        // A browser keeps nothing half-received: sending again starts from the beginning.
        channel.close();
        this.set("failed", `The connection dropped, so nothing was kept. Ask ${this.peerName} to resume or send it again.`);
        return;
      }
      const reason = error instanceof Mismatch ? error.message : "This browser couldn't keep the files.";
      await channel.send({ t: "error", code: error instanceof Mismatch ? error.code : "internal", message: reason }).catch(() => undefined);
      channel.close();
      this.set("failed", `${reason} The transfer stopped and nothing was kept.`);
    }
  }

  private async finishFile(current: { f: number; file: SinkFile; hasher: ChunkHasher; received: number }, complete: boolean[]): Promise<null> {
    const entry = this.manifest.files[current.f]!;
    const { blake3 } = current.hasher.digest();
    await current.file.close();
    if (blake3 !== entry.blake3) throw new Mismatch(`${entry.path} didn't match its whole-file hash.`, "file_mismatch");
    complete[current.f] = true;
    return null;
  }
}
