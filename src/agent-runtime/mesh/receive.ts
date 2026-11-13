/**
 * Receiving a nearby transfer. Nothing is written until the person accepts
 * and chooses where it goes, and then only into a new folder made for it.
 * Files arrive in a hidden `.farbaek-incoming` folder inside it, each 4 MiB
 * chunk checked against its BLAKE3 hash the moment it completes and each
 * file against its whole-file hash. A checkpoint records every verified
 * chunk, so a dropped connection resumes where it stopped. Only when every
 * file has matched are they moved into place and the sender told
 * `verified`. A mismatch stops the transfer and removes everything it wrote.
 * Nothing received is ever run.
 */
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";
import { checkAgentPath } from "@/core/agent/paths";
import { CHUNK_BYTES, ChunkHasher, ManifestSchema, checkManifest, manifestDigest, type CapsuleManifest } from "@/core/mesh/capsule";
import { MAX_MANIFEST_BYTES, TRANSFER_LIMITS, type MeshErrorCode, type MeshMessage, type TransferState } from "@/core/mesh/protocol";
import { ProjectFolder } from "../fs-guard";
import { ChannelError, type SecureChannel } from "./channel";
import { FrameError } from "./framing";
import { NoiseError, fingerprint } from "./noise";

/** How long a receiver waits for the next piece before treating the connection as dropped. */
const IDLE_MS = 60_000;
const INCOMING = ".farbaek-incoming";
/** Free space kept beyond the transfer's size. */
const SPACE_MARGIN = 64 * 1024 * 1024;

export class OfferError extends Error {
  constructor(
    message: string,
    readonly problems: string[] = [],
  ) {
    super(message);
    this.name = "OfferError";
  }
}

class Mismatch extends Error {
  constructor(
    message: string,
    readonly code: MeshErrorCode = "protocol",
  ) {
    super(message);
  }
}

/** Errors that mean the connection was lost or tampered with, not that the files were wrong. */
const dropped = (error: unknown) => error instanceof FrameError || error instanceof NoiseError || error instanceof ChannelError;

export interface IncomingView {
  id: string;
  direction: "in";
  state: TransferState;
  peer: { name: string; fingerprint: string };
  name: string;
  files: number;
  bytes: number;
  bytesDone: number;
  excluded: { path: string; reason: string }[];
  excludedCount: number;
  /** Copied from an earlier copy on this computer instead of sent (ADR 0138). */
  reused: { files: number; bytes: number };
  destination: string | null;
  message: string | null;
  updatedAt: string;
}

/** Reads and checks an offer's manifest. Throws OfferError, in words, when it can't be accepted. */
export async function readOffer(channel: SecureChannel, offer: Extract<MeshMessage, { t: "offer" }>): Promise<CapsuleManifest> {
  const body = await channel.receiveBlob(offer.size, IDLE_MS);
  let json: unknown;
  try {
    json = JSON.parse(body.toString("utf8"));
  } catch {
    throw new OfferError("The list of files wasn't readable.");
  }
  if (body.length > MAX_MANIFEST_BYTES) throw new OfferError("The list of files is too large.");
  const parsed = ManifestSchema.safeParse(json);
  if (!parsed.success) throw new OfferError("The list of files isn't in the Capsule format.");
  if (manifestDigest(parsed.data) !== offer.digest) throw new OfferError("The list of files doesn't match its digest.");
  const problems = checkManifest(parsed.data, TRANSFER_LIMITS, { diskPaths: true });
  if (problems.length > 0) throw new OfferError("Some files in this transfer can't be accepted.", problems);
  return parsed.data;
}

/**
 * How many leading chunks of `entry` the same path in `source` already has,
 * by BLAKE3. Every chunk, when the file matches whole; 0 when it's missing,
 * unreadable or differs from the start.
 */
async function matchingChunks(source: ProjectFolder, entry: CapsuleManifest["files"][number]): Promise<number> {
  let opened: { handle: FileHandle; size: number };
  try {
    opened = await source.openRead(entry.path);
  } catch {
    return 0;
  }
  const { handle, size } = opened;
  let matched = 0;
  let differs = false;
  const hasher = new ChunkHasher((chunk) => {
    const expected = entry.chunks[chunk.index];
    if (!differs && expected && expected.blake3 === chunk.blake3 && expected.bytes === chunk.bytes) matched = chunk.index + 1;
    else differs = true;
  });
  try {
    // Never more than the offered size: a longer earlier file can still match up to it.
    const toRead = Math.min(size, entry.bytes);
    if (toRead > 0) {
      for await (const piece of handle.createReadStream({ start: 0, end: toRead - 1, highWaterMark: 1024 * 1024, autoClose: false })) {
        hasher.update(piece as Buffer);
        if (differs) break;
      }
    }
    if (differs) return matched;
    const { blake3 } = hasher.digest();
    // The last chunk only counts when the whole file is exactly the offered one.
    return hasher.bytes === entry.bytes && blake3 === entry.blake3 ? entry.chunks.length : Math.min(matched, entry.chunks.length - 1);
  } finally {
    await handle.close();
  }
}

function folderName(raw: string): string {
  const cleaned = raw
    .normalize("NFC")
    // Invisible formatting characters (a right-to-left override) can disguise a name (ADR 0196).
    .replace(/\p{Cf}/gu, "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/[. ]+$/, "")
    .trim()
    .slice(0, 80)
    // A folder named like a package or a shell location (X.app, X.pkg, X.{CLSID}) would open as one, not as a folder.
    .replace(/\.(app|pkg|mpkg|bundle|\{[0-9a-f-]+\})$/i, "-$1");
  return cleaned && checkAgentPath(cleaned).ok ? cleaned : "Farbaek transfer";
}

export class IncomingTransfer {
  state: TransferState = "offered";
  message: string | null = null;
  bytesDone = 0;
  updatedAt = new Date();
  private channel: SecureChannel | null;
  private destination: string | null = null;
  private folder: ProjectFolder | null = null;
  private readonly verified: number[];
  private readonly complete: boolean[];
  private running: Promise<void> | null = null;
  private accepting = false;
  readonly peerKey: Buffer;

  constructor(
    channel: SecureChannel,
    /** The name saved when the sender was paired, never the one its hello gives on this connection. */
    private readonly peerName: string,
    readonly id: string,
    readonly digest: string,
    readonly manifest: CapsuleManifest,
    private readonly onUpdate: () => void,
  ) {
    this.channel = channel;
    this.peerKey = Buffer.from(channel.peer.publicKey);
    this.verified = manifest.files.map(() => 0);
    this.complete = manifest.files.map(() => false);
    channel.onClose(() => {
      if (this.state === "offered") this.set("cancelled", `${this.peerName} stopped waiting. Nothing was written.`);
    });
  }

  get temp(): string {
    return `${INCOMING}/${this.id}`;
  }

  view(): IncomingView {
    return {
      id: this.id,
      direction: "in",
      state: this.state,
      peer: { name: this.peerName, fingerprint: fingerprint(this.peerKey) },
      name: this.manifest.source.projectName,
      files: this.manifest.totals.files,
      bytes: this.manifest.totals.bytes,
      bytesDone: this.bytesDone,
      excluded: this.manifest.excluded.slice(0, 50),
      excludedCount: this.manifest.excluded.length,
      reused: { ...this.reused },
      destination: this.destination,
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

  /**
   * Accepts into a new folder inside `parent`, then receives. With `earlier`,
   * a folder holding an earlier copy on this computer (ADR 0138), files and
   * leading chunks that match the offer's hashes are copied from it here
   * instead of sent; the earlier copy is only read.
   */
  async accept(parent: string, earlier?: string): Promise<void> {
    // One accept per offer: a second click while the first is still checking the folder is refused, not run twice.
    if (this.state !== "offered" || !this.channel || this.accepting) throw new OfferError("This transfer can't be accepted now.");
    this.accepting = true;
    const stat = await fs.stat(parent).catch(() => null);
    if (!path.isAbsolute(parent) || !stat?.isDirectory()) {
      this.accepting = false;
      throw new OfferError("Choose a folder that exists.");
    }
    const earlierStat = earlier ? await fs.stat(earlier).catch(() => null) : null;
    if (earlier && (!path.isAbsolute(earlier) || !earlierStat?.isDirectory())) {
      this.accepting = false;
      throw new OfferError("Choose an earlier copy that exists.");
    }
    const space = await fs.statfs(parent).catch(() => null);
    if (space && Number(space.bavail) * Number(space.bsize) < this.manifest.totals.bytes + SPACE_MARGIN) {
      await this.channel.send({ t: "error", code: "no_space", message: "The receiving computer doesn't have enough free space." }).catch(() => undefined);
      this.channel.close();
      this.set("failed", "There isn't enough free space in that folder's drive for this transfer.");
      return;
    }
    this.destination = await this.makeFolder(parent);
    this.folder = await ProjectFolder.open(this.destination);
    if (earlier) {
      this.set("receiving", "Checking the earlier copy for files this computer already has.");
      try {
        await this.seedFrom(earlier);
      } catch (error) {
        // Reuse saves time but isn't needed: anything it couldn't check is sent instead.
        this.reused = { files: 0, bytes: 0 };
        this.verified.fill(0);
        this.complete.fill(false);
        await fs.rm(path.join(this.destination, INCOMING), { recursive: true, force: true }).catch(() => undefined);
        this.reuseProblem = `The earlier copy couldn't be used (${error instanceof Error ? error.message : "it couldn't be read"}), so every file was sent.`;
      }
    }
    this.running = this.run();
    await this.running;
  }

  /** Files already on this computer, copied from the earlier copy instead of sent. */
  private reused = { files: 0, bytes: 0 };
  private reuseProblem: string | null = null;

  /**
   * Copies what the earlier copy already has into the incoming files: a
   * whole file when every chunk and the whole-file hash match, otherwise its
   * leading chunks that match, so the sender carries on after them.
   */
  private async seedFrom(earlier: string): Promise<void> {
    const source = await ProjectFolder.open(earlier);
    for (const [f, entry] of this.manifest.files.entries()) {
      const matched = await matchingChunks(source, entry);
      if (matched === 0) continue;
      const whole = matched === entry.chunks.length;
      const keep = whole ? entry.bytes : matched * CHUNK_BYTES;
      const { handle: from } = await source.openRead(entry.path);
      const to = await this.folder!.createNew(`${this.temp}/${f}.part`);
      try {
        let at = 0;
        if (keep > 0) {
          for await (const piece of from.createReadStream({ start: 0, end: keep - 1, highWaterMark: 1024 * 1024, autoClose: false })) {
            const bytes = piece as Buffer;
            await to.write(bytes, 0, bytes.length, at);
            at += bytes.length;
          }
        }
        if (at !== keep) throw new Error(`${entry.path} changed while it was copied`);
      } finally {
        await from.close();
        await to.close();
      }
      this.verified[f] = matched;
      if (whole) {
        this.complete[f] = true;
        this.reused.files += 1;
      }
      this.reused.bytes += keep;
    }
    await this.saveCheckpoint();
  }

  async decline(): Promise<void> {
    if (this.state !== "offered") return;
    await this.channel?.send({ t: "decline" }).catch(() => undefined);
    this.channel?.close();
    this.set("declined", "You declined this transfer. Nothing was written.");
  }

  /** The sender called again after a dropped connection: carry on from the last verified chunk. */
  async reattach(channel: SecureChannel): Promise<void> {
    // The old connection may not have been noticed as dead yet: let it go first.
    if (this.state === "receiving" && this.running) {
      this.channel?.close();
      await this.running;
    }
    if (this.state !== "interrupted" || !this.folder) throw new OfferError("There's nothing to resume.");
    this.channel = channel;
    this.running = this.run();
    await this.running;
  }

  async cancel(): Promise<void> {
    if (this.state === "done" || this.state === "cancelled" || this.state === "failed" || this.state === "declined") return;
    await this.channel?.send({ t: "cancel" }).catch(() => undefined);
    this.channel?.close();
    await this.removeAll();
    this.set("cancelled", "Cancelled. Everything received was removed.");
  }

  private async makeFolder(parent: string): Promise<string> {
    const base = folderName(this.manifest.source.projectName);
    for (let n = 1; n < 100; n += 1) {
      const candidate = path.join(parent, n === 1 ? base : `${base} (${n})`);
      try {
        await fs.mkdir(candidate);
        return candidate;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
    const candidate = path.join(parent, `${base} ${randomUUID().slice(0, 8)}`);
    await fs.mkdir(candidate);
    return candidate;
  }

  private async run(): Promise<void> {
    const channel = this.channel!;
    // A file whose chunks all checked but which wasn't confirmed whole is sent again from its last chunk.
    for (const [f, entry] of this.manifest.files.entries()) if (!this.complete[f]) this.verified[f] = Math.min(this.verified[f]!, entry.chunks.length - 1);
    this.bytesDone = this.manifest.files.reduce((sum, entry, f) => sum + (this.complete[f] ? entry.bytes : Math.min(entry.bytes, this.verified[f]! * CHUNK_BYTES)), 0);
    const resume = this.verified.flatMap((chunks, f) => (chunks > 0 ? [[f, chunks] as [number, number]] : []));
    const body = Buffer.from(JSON.stringify({ resume }), "utf8");
    this.set("receiving");
    let current: { f: number; handle: FileHandle; hasher: ChunkHasher; received: number } | null = null;
    try {
      await channel.sendBlob({ t: "accept", size: body.length }, body);
      while (this.complete.some((c) => !c)) {
        const { message, body: piece } = await channel.receive(IDLE_MS);
        if (message.t === "cancel") {
          channel.close();
          await current?.handle.close();
          current = null;
          await this.removeAll();
          this.set("cancelled", `${this.peerName} cancelled. Everything received was removed.`);
          return;
        }
        if (message.t === "error") {
          channel.close();
          await current?.handle.close();
          current = null;
          await this.removeAll();
          this.set("failed", `${this.peerName} stopped: ${message.message} Nothing was kept.`);
          return;
        }
        if (message.t === "file") {
          if (current || message.f >= this.complete.length || this.complete[message.f] || message.from !== this.verified[message.f]) throw new Mismatch("The sender skipped ahead of what was checked.");
          current = await this.openPart(message.f, message.from);
          if (this.manifest.files[message.f]!.bytes === 0) current = await this.finishFile(current);
          continue;
        }
        if (message.t === "data" && current) {
          const entry = this.manifest.files[current.f]!;
          if (current.received + piece.length > entry.bytes) throw new Mismatch(`${entry.path} is longer than its listed size.`);
          // Explicit positions: what's hashed is exactly what lands at that place on disk.
          await current.handle.write(piece, 0, piece.length, current.received);
          current.hasher.update(piece);
          current.received += piece.length;
          this.bytesDone += piece.length;
          this.progress();
          if (current.received === entry.bytes) current = await this.finishFile(current);
          continue;
        }
        throw new Mismatch("The sender sent something out of order.");
      }

      this.set("finishing");
      for (const [f, entry] of this.manifest.files.entries()) await this.folder!.moveNew(`${this.temp}/${f}.part`, entry.path);
      await fs.rm(path.join(this.destination!, INCOMING), { recursive: true, force: true });
      // Done once the files are in place; a lost "verified" can't undo that, and a resume just hears it again.
      const kept = this.reused.files > 0 ? ` ${this.reused.files} of them ${this.reused.files === 1 ? "was" : "were"} already on this computer and copied from the earlier copy.` : this.reuseProblem ? ` ${this.reuseProblem}` : "";
      this.set("done", `Every file matched its hash.${kept} Saved in ${this.destination}.`);
      await channel.send({ t: "verified", files: this.manifest.totals.files, bytes: this.manifest.totals.bytes }).catch(() => undefined);
      channel.close();
    } catch (error) {
      await current?.handle.close().catch(() => undefined);
      if (!dropped(error)) {
        const reason = error instanceof Mismatch ? error.message : "The receiving computer couldn't write the files.";
        await channel.send({ t: "error", code: error instanceof Mismatch ? error.code : "internal", message: reason }).catch(() => undefined);
        channel.close();
        await this.removeAll();
        this.set("failed", `${reason} The transfer stopped and nothing was kept.`);
        return;
      }
      channel.close();
      await this.saveCheckpoint().catch(() => undefined);
      this.set("interrupted", `The connection dropped. ${this.peerName} can resume from where it stopped.`);
    }
  }

  /** Opens the file's partial copy at a verified chunk boundary, re-checking what's already there. */
  private async openPart(f: number, from: number) {
    const entry = this.manifest.files[f]!;
    const rel = `${this.temp}/${f}.part`;
    const hasher = new ChunkHasher((chunk) => {
      const expected = entry.chunks[chunk.index];
      if (!expected || expected.blake3 !== chunk.blake3 || expected.bytes !== chunk.bytes) throw new Mismatch(`${entry.path} didn't match its hash at chunk ${chunk.index + 1}.`, "chunk_mismatch");
      this.verified[f] = chunk.index + 1;
    });
    if (from === 0) {
      if (await this.folder!.exists(rel)) await this.folder!.remove(rel);
      return { f, handle: await this.folder!.createNew(rel), hasher, received: 0 };
    }
    const keep = from * CHUNK_BYTES;
    const handle = await fs.open(path.join(this.destination!, ...rel.split("/")), "r+");
    await handle.truncate(keep);
    for await (const piece of handle.createReadStream({ start: 0, end: keep - 1, highWaterMark: 1024 * 1024, autoClose: false })) hasher.update(piece as Buffer);
    return { f, handle, hasher, received: keep };
  }

  private async finishFile(current: { f: number; handle: FileHandle; hasher: ChunkHasher; received: number }): Promise<null> {
    const entry = this.manifest.files[current.f]!;
    const { blake3 } = current.hasher.digest();
    await current.handle.close();
    if (blake3 !== entry.blake3) throw new Mismatch(`${entry.path} didn't match its whole-file hash.`, "file_mismatch");
    this.complete[current.f] = true;
    this.verified[current.f] = entry.chunks.length;
    await this.saveCheckpoint();
    return null;
  }

  private lastProgress = 0;
  private progress(): void {
    const now = Date.now();
    if (now - this.lastProgress < 200) return;
    this.lastProgress = now;
    this.updatedAt = new Date();
    this.onUpdate();
  }

  private async saveCheckpoint(): Promise<void> {
    if (!this.folder) return;
    await this.folder.write(`${this.temp}/checkpoint.json`, JSON.stringify({ session: this.id, digest: this.digest, verified: this.verified, complete: this.complete }));
  }

  /** Removes the folder made for this transfer, with everything received into it. */
  private async removeAll(): Promise<void> {
    if (this.destination) await fs.rm(this.destination, { recursive: true, force: true });
    this.destination = null;
    this.folder = null;
  }

  /** Once interrupted, the person can give up on it here too. */
  async discard(): Promise<void> {
    if (this.state !== "interrupted") return;
    await this.removeAll();
    this.set("cancelled", "Discarded. Everything received was removed.");
  }
}
