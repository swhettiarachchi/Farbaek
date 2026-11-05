/**
 * Reading a .zip in the browser for rescue imports (Phase D), with no
 * package: the central directory is parsed here and deflated entries go
 * through the platform's own DecompressionStream. It only reads; the files
 * it returns still go through the same screening as any import.
 *
 * Defences against hostile archives: a cap on entries and on total
 * decompressed bytes (counted as it inflates, so a zip bomb stops early),
 * per-file size checked before and during inflation, encrypted and ZIP64
 * archives refused, every offset bounds-checked, and each file's CRC-32
 * checked against the archive. The writer for downloads is ./zip.ts.
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

export interface ZipOptions {
  /** Largest file to unpack; larger ones are skipped as too large. */
  maxFileBytes: number;
  /** Most entries the archive may list. */
  maxEntries?: number;
  /** Most bytes to unpack in total, across every file. */
  maxTotalBytes?: number;
  /** Paths worth unpacking; others (dependency folders, say) are left compressed and not returned. */
  wanted?: (path: string) => boolean;
}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export async function readZip(data: Uint8Array, options: ZipOptions): Promise<ZipResult> {
  const maxEntries = options.maxEntries ?? 20_000;
  const maxTotal = options.maxTotalBytes ?? 64 * 1024 * 1024;
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

  const count = u16(eocd + 10);
  const cdSize = u32(eocd + 12);
  const cdOffset = u32(eocd + 16);
  if (count === 0xffff || cdOffset === 0xffffffff || cdSize === 0xffffffff) throw new ZipError("zip64", "This archive uses the ZIP64 format, which isn't supported. Zip a smaller folder.");
  if (count > maxEntries) throw new ZipError("too_many_entries", `This archive lists ${count.toLocaleString("en-US")} files; the most a rescue import reads is ${maxEntries.toLocaleString("en-US")}.`);
  if (cdOffset + cdSize > eocd) throw new ZipError("not_zip", "This zip archive is damaged.");

  const names = new TextDecoder("utf-8");
  const result: ZipResult = { entries: [], skipped: [] };
  // What's been unpacked, kept or not: the work is the same either way.
  let inflated = 0;
  const seenOffsets = new Set<number>();
  let at = cdOffset;

  for (let n = 0; n < count; n++) {
    if (at + 46 > eocd || u32(at) !== CENTRAL) throw new ZipError("not_zip", "This zip archive is damaged.");
    const flags = u16(at + 8);
    const method = u16(at + 10);
    const crc = u32(at + 16);
    const compressed = u32(at + 20);
    const size = u32(at + 24);
    const nameLength = u16(at + 28);
    const next = at + 46 + nameLength + u16(at + 30) + u16(at + 32);
    const local = u32(at + 42);
    const path = names.decode(data.subarray(at + 46, at + 46 + nameLength)).replace(/\\/g, "/");
    at = next;

    if (path.endsWith("/")) continue;
    if (options.wanted && !options.wanted(path)) continue;
    if (flags & 0x1) {
      result.skipped.push({ path, reason: "encrypted" });
      continue;
    }
    if (method !== 0 && method !== 8) {
      result.skipped.push({ path, reason: "unsupported_method" });
      continue;
    }
    if (size > options.maxFileBytes) {
      result.skipped.push({ path, reason: "too_large" });
      continue;
    }
    if (local + 30 > data.length || u32(local) !== LOCAL) {
      result.skipped.push({ path, reason: "corrupt" });
      continue;
    }
    const start = local + 30 + u16(local + 26) + u16(local + 28);
    if (start + compressed > data.length) {
      result.skipped.push({ path, reason: "corrupt" });
      continue;
    }
    if (seenOffsets.has(local)) throw new ZipError("too_big", "This archive reuses the same data for several files, which a real one never does.");
    seenOffsets.add(local);
    const body = data.subarray(start, start + compressed);
    const limit = Math.min(options.maxFileBytes, maxTotal - inflated);
    const bytes = method === 0 ? (body.length <= limit ? body.slice() : null) : await inflateRaw(body, limit);
    // An entry that claimed to be small and wasn't still cost this much, and only one that lied gets here.
    if (bytes) inflated += bytes.length;
    else if (method !== 0) inflated += limit;
    if (!bytes) {
      if (inflated >= maxTotal || limit < options.maxFileBytes) throw new ZipError("too_big", "This archive unpacks to more than a rescue import reads. Zip just the app's source files.");
      result.skipped.push({ path, reason: "too_large" });
      continue;
    }
    if (bytes.length !== size || crc32(bytes) !== crc) {
      result.skipped.push({ path, reason: "corrupt" });
      continue;
    }
    result.entries.push({ path, bytes });
  }
  return result;
}

/** Inflates raw deflate data, giving up (null) as soon as it passes `limit` bytes or the data is broken. */
async function inflateRaw(input: Uint8Array, limit: number): Promise<Uint8Array | null> {
  const stream = new DecompressionStream("deflate-raw");
  const writer = stream.writable.getWriter();
  writer.write(input as Uint8Array<ArrayBuffer>).catch(() => undefined);
  writer.close().catch(() => undefined);
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const out = new Uint8Array(length);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
