/**
 * Reading a .zip with no package: the central directory is parsed here and
 * deflated entries go through an inflate function the caller may pass in
 * (the platform's own DecompressionStream by default, node's zlib in tests).
 * Used by rescue imports (Phase D), GitHub imports, Capsules (ADR 0037) and a
 * .zip picked for a project import. It only reads bytes: no path in an
 * archive is ever used to open, write or look up anything, and the files it
 * returns still go through the same screening as any import.
 *
 * Defences against hostile archives: a cap on entries and on total
 * decompressed bytes (counted as it inflates, so a zip bomb stops early),
 * per-file size checked before and during inflation, encrypted and ZIP64
 * archives refused, every offset bounds-checked, the whole central directory
 * read before anything is inflated, and each file's size and CRC-32 checked
 * against the archive. The writer for downloads is ./zip.ts.
 */
import { crc32 } from "./zip";

export interface ZipEntry {
  path: string;
  bytes: Uint8Array;
}

export type ZipSkipReason = "encrypted" | "unsupported_method" | "too_large" | "corrupt";

export interface ZipResult {
  entries: ZipEntry[];
  skipped: { path: string; reason: ZipSkipReason }[];
}

export type ZipErrorCode = "not_zip" | "zip64" | "too_many_entries" | "too_big";

export class ZipError extends Error {
  constructor(
    readonly code: ZipErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** The platform can't inflate (no DecompressionStream, or no "deflate-raw"). The archive itself may be fine. */
export class InflateUnavailableError extends Error {
  constructor() {
    super("This browser can't unpack compressed zip files.");
  }
}

/**
 * Inflates raw deflate data. Resolves to the bytes, or to null as soon as the
 * output passes `limit` bytes, without producing the rest. Rejects when the
 * data isn't valid deflate.
 */
export type Inflate = (input: Uint8Array, limit: number) => Promise<Uint8Array | null>;

export interface ZipOptions {
  /** Largest file to unpack; larger ones are skipped as too large. */
  maxFileBytes: number;
  /** Most entries the archive may list. */
  maxEntries?: number;
  /** Most bytes to unpack in total, across every file. */
  maxTotalBytes?: number;
  /** Paths worth unpacking; others (dependency folders, say) are left compressed and not returned. */
  wanted?: (path: string) => boolean;
  /** Inflates deflated entries. Defaults to the platform's DecompressionStream. */
  inflate?: Inflate;
  /**
   * Read the archive as a zipped folder: macOS metadata (`__MACOSX/` and
   * `.DS_Store`) is left out and, when every file sits in one top folder (as
   * in GitHub's and the Finder's zips), that folder is dropped from the
   * paths. `wanted` sees the shorter path.
   */
  unwrapFolder?: boolean;
}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

interface CentralRecord {
  path: string;
  flags: number;
  method: number;
  crc: number;
  compressed: number;
  size: number;
  local: number;
}

const isMacMetadata = (path: string) => path.startsWith("__MACOSX/") || path === ".DS_Store" || path.endsWith("/.DS_Store");

/** The one folder every path sits in, if there is one. Never "", "." or "..", so stripping can't hide a bad path. */
export function sharedTopFolder(paths: readonly string[]): string | null {
  if (paths.length === 0) return null;
  const slash = paths[0]!.indexOf("/");
  if (slash <= 0) return null;
  const top = paths[0]!.slice(0, slash);
  if (top === "." || top === "..") return null;
  return paths.every((p) => p.startsWith(`${top}/`) && p.length > top.length + 1) ? top : null;
}

export async function readZip(data: Uint8Array, options: ZipOptions): Promise<ZipResult> {
  const maxEntries = options.maxEntries ?? 20_000;
  const maxTotal = options.maxTotalBytes ?? 64 * 1024 * 1024;
  const inflate = options.inflate ?? inflateRaw;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const u16 = (at: number) => view.getUint16(at, true);
  const u32 = (at: number) => view.getUint32(at, true);

  // The end-of-central-directory record sits at the end, before an optional comment of up to 65,535 bytes.
  let eocd = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 22 - 0xffff); i--) {
    if (u32(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError("not_zip", "This file isn't a zip archive, or it's damaged.");

  const zip64 = () => new ZipError("zip64", "This zip uses the ZIP64 format, which isn't supported. Zip a smaller folder.");
  const damaged = () => new ZipError("not_zip", "This zip archive is damaged.");
  const count = u16(eocd + 10);
  const cdSize = u32(eocd + 12);
  const cdOffset = u32(eocd + 16);
  if (count === 0xffff || cdOffset === 0xffffffff || cdSize === 0xffffffff) throw zip64();
  if (count > maxEntries) throw new ZipError("too_many_entries", `This zip lists ${count.toLocaleString("en-US")} files, and the most one import reads is ${maxEntries.toLocaleString("en-US")}.`);
  if (cdOffset + cdSize > eocd) throw damaged();

  // First the whole central directory, so a damaged or ZIP64 archive is refused before anything is inflated.
  const names = new TextDecoder("utf-8");
  const records: CentralRecord[] = [];
  let at = cdOffset;
  for (let n = 0; n < count; n++) {
    if (at + 46 > eocd || u32(at) !== CENTRAL) throw damaged();
    const nameLength = u16(at + 28);
    const next = at + 46 + nameLength + u16(at + 30) + u16(at + 32);
    if (next > eocd) throw damaged();
    const record: CentralRecord = {
      path: names.decode(data.subarray(at + 46, at + 46 + nameLength)).replace(/\\/g, "/"),
      flags: u16(at + 8),
      method: u16(at + 10),
      crc: u32(at + 16),
      compressed: u32(at + 20),
      size: u32(at + 24),
      local: u32(at + 42),
    };
    // These values mean "see the ZIP64 extra field", which this reader doesn't follow.
    if (record.compressed === 0xffffffff || record.size === 0xffffffff || record.local === 0xffffffff) throw zip64();
    at = next;
    if (record.path.endsWith("/")) continue;
    if (options.unwrapFolder && isMacMetadata(record.path)) continue;
    records.push(record);
  }

  const top = options.unwrapFolder ? sharedTopFolder(records.map((r) => r.path)) : null;
  const result: ZipResult = { entries: [], skipped: [] };
  // What's been unpacked, kept or not: the work is the same either way.
  let inflated = 0;
  const seenOffsets = new Set<number>();

  for (const r of records) {
    const path = top ? r.path.slice(top.length + 1) : r.path;
    if (options.wanted && !options.wanted(path)) continue;
    if (r.flags & 0x1) {
      result.skipped.push({ path, reason: "encrypted" });
      continue;
    }
    if (r.method !== 0 && r.method !== 8) {
      result.skipped.push({ path, reason: "unsupported_method" });
      continue;
    }
    if (r.size > options.maxFileBytes) {
      result.skipped.push({ path, reason: "too_large" });
      continue;
    }
    // The local header only says where the data starts; sizes and checksums come from the central directory.
    if (r.local + 30 > data.length || u32(r.local) !== LOCAL) {
      result.skipped.push({ path, reason: "corrupt" });
      continue;
    }
    const start = r.local + 30 + u16(r.local + 26) + u16(r.local + 28);
    if (start + r.compressed > data.length) {
      result.skipped.push({ path, reason: "corrupt" });
      continue;
    }
    if (seenOffsets.has(r.local)) throw new ZipError("too_big", "This zip reuses the same data for several files, which a real one never does.");
    seenOffsets.add(r.local);
    const body = data.subarray(start, start + r.compressed);
    const limit = Math.min(options.maxFileBytes, maxTotal - inflated);
    let bytes: Uint8Array | null;
    if (r.method === 0) bytes = body.length <= limit ? body.slice() : null;
    else {
      try {
        bytes = await inflate(body, limit);
      } catch (e) {
        if (e instanceof InflateUnavailableError) throw e;
        // Broken deflate data may have unpacked up to the limit before it failed, so that much is counted.
        inflated += limit;
        result.skipped.push({ path, reason: "corrupt" });
        continue;
      }
    }
    // An entry that claimed to be small and wasn't still cost this much, and only one that lied gets here.
    if (bytes) inflated += bytes.length;
    else if (r.method !== 0) inflated += limit;
    if (!bytes) {
      if (inflated >= maxTotal || limit < options.maxFileBytes) throw new ZipError("too_big", "This zip unpacks to more than one import reads. Zip just your app's source files.");
      result.skipped.push({ path, reason: "too_large" });
      continue;
    }
    if (bytes.length !== r.size || crc32(bytes) !== r.crc) {
      result.skipped.push({ path, reason: "corrupt" });
      continue;
    }
    result.entries.push({ path, bytes });
  }
  return result;
}

/**
 * Compressed input goes in a slice at a time. Deflate expands at most about
 * 1,032 times, so even an engine that inflates a whole write at once makes
 * no more than about 4 MB before the reader can stop it.
 */
const INFLATE_SLICE = 4 * 1024;

/** The platform's DecompressionStream("deflate-raw"), stopping once the output passes `limit`. */
export const inflateRaw: Inflate = (input, limit) => {
  let stream: DecompressionStream;
  try {
    stream = new DecompressionStream("deflate-raw");
  } catch {
    // No DecompressionStream at all (a ReferenceError), or one without "deflate-raw" (a TypeError).
    return Promise.reject(new InflateUnavailableError());
  }
  return inflateThrough(stream, input, limit);
};

/**
 * Inflates through a deflate-raw transform stream: feeds it a slice at a
 * time, reads as it goes and cancels as soon as the output passes `limit`
 * (resolving to null). Rejects when the stream reports broken data.
 */
export async function inflateThrough(stream: { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array<ArrayBuffer>> }, input: Uint8Array, limit: number): Promise<Uint8Array | null> {
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  let stopped = false;
  // Not awaited: once the reader stops, a pending write rejects and is dropped here.
  void (async () => {
    for (let at = 0; at < input.length && !stopped; at += INFLATE_SLICE) await writer.write(input.subarray(at, at + INFLATE_SLICE) as Uint8Array<ArrayBuffer>);
    if (!stopped) await writer.close();
  })().catch(() => undefined);

  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) {
        stopped = true;
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } finally {
    stopped = true;
  }
  const out = new Uint8Array(length);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
