// Farbaek for Android's Nearby screen sets its words in Geist and Geist Mono, the website's own fonts (ADR 0008),
// so the native screen reads as the same product as the web pages around it. Next.js ships both as variable WOFF2
// files (Latin), and Android reads TrueType, so this unpacks WOFF2 into TTF, following the W3C WOFF2 spec
// (https://www.w3.org/TR/WOFF2/), including the transformed glyf and loca tables. No dependencies: Node's zlib
// has Brotli. Both fonts are under the SIL Open Font License 1.1 (copyright Vercel), which the fonts' own name
// tables carry, as the licence allows.
// Run: node scripts/android-fonts.mjs
import { brotliDecompressSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const fonts = join(dirname(require.resolve("next/package.json")), "dist", "next-devtools", "server", "font");
const out = join(root, "android", "app", "src", "main", "assets", "fonts");

const KNOWN_TAGS = [
  "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca", "prep", "CFF ", "VORG", "EBDT",
  "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC", "JSTF", "MATH",
  "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar", "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar",
  "gvar", "hsty", "just", "lcar", "mort", "morx", "opbd", "prop", "trak", "Zapf", "Silf", "Glat", "Gloc", "Feat", "Sill",
];

/** A cursor over a byte array, reading the big-endian types WOFF2 uses. */
class Reader {
  constructor(bytes, offset = 0, end = bytes.length) {
    this.b = bytes;
    this.o = offset;
    this.end = end;
  }
  need(n) {
    if (this.o + n > this.end) throw new Error("WOFF2 data ends early");
  }
  u8() {
    this.need(1);
    return this.b[this.o++];
  }
  u16() {
    this.need(2);
    const v = (this.b[this.o] << 8) | this.b[this.o + 1];
    this.o += 2;
    return v;
  }
  i16() {
    const v = this.u16();
    return v & 0x8000 ? v - 0x10000 : v;
  }
  u32() {
    this.need(4);
    const v = ((this.b[this.o] << 24) >>> 0) + ((this.b[this.o + 1] << 16) | (this.b[this.o + 2] << 8) | this.b[this.o + 3]);
    this.o += 4;
    return v;
  }
  bytes(n) {
    this.need(n);
    const v = this.b.subarray(this.o, this.o + n);
    this.o += n;
    return v;
  }
  base128() {
    let v = 0;
    for (let i = 0; i < 5; i++) {
      const byte = this.u8();
      if (i === 0 && byte === 0x80) throw new Error("UIntBase128 with a leading zero");
      if (v & 0xfe000000) throw new Error("UIntBase128 overflows");
      v = (v << 7) | (byte & 0x7f);
      if (!(byte & 0x80)) return v >>> 0;
    }
    throw new Error("UIntBase128 longer than five bytes");
  }
  u255() {
    const code = this.u8();
    if (code === 253) return this.u16();
    if (code === 255) return this.u8() + 253;
    if (code === 254) return this.u8() + 253 * 2;
    return code;
  }
}

/** A growing big-endian byte buffer. */
class Writer {
  constructor() {
    this.parts = [];
    this.length = 0;
  }
  push(bytes) {
    this.parts.push(bytes);
    this.length += bytes.length;
  }
  u8(v) {
    this.push(Uint8Array.of(v & 0xff));
  }
  u16(v) {
    this.push(Uint8Array.of((v >> 8) & 0xff, v & 0xff));
  }
  u32(v) {
    this.push(Uint8Array.of((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff));
  }
  pad(to) {
    while (this.length % to) this.u8(0);
  }
  bytes() {
    return Buffer.concat(this.parts.map((p) => Buffer.from(p.buffer, p.byteOffset, p.byteLength)));
  }
}

const withSign = (flag, value) => (flag & 1 ? value : -value);

/** One point's movement from the glyph stream, by the WOFF2 triplet encoding (spec section 5.2). */
function triplet(flag, glyphs) {
  if (flag < 10) return [0, withSign(flag, ((flag & 14) << 7) + glyphs.u8())];
  if (flag < 20) return [withSign(flag, (((flag - 10) & 14) << 7) + glyphs.u8()), 0];
  if (flag < 84) {
    const b0 = flag - 20;
    const b1 = glyphs.u8();
    return [withSign(flag, 1 + (b0 & 0x30) + (b1 >> 4)), withSign(flag >> 1, 1 + ((b0 & 0x0c) << 2) + (b1 & 0x0f))];
  }
  if (flag < 120) {
    const b0 = flag - 84;
    const x = glyphs.u8();
    const y = glyphs.u8();
    return [withSign(flag, 1 + (Math.floor(b0 / 12) << 8) + x), withSign(flag >> 1, 1 + (((b0 % 12) >> 2) << 8) + y)];
  }
  if (flag < 124) {
    const a = glyphs.u8();
    const b = glyphs.u8();
    const c = glyphs.u8();
    return [withSign(flag, (a << 4) + (b >> 4)), withSign(flag >> 1, ((b & 0x0f) << 8) + c)];
  }
  const a = glyphs.u8();
  const b = glyphs.u8();
  const c = glyphs.u8();
  const d = glyphs.u8();
  return [withSign(flag, (a << 8) + b), withSign(flag >> 1, (c << 8) + d)];
}

/** Rebuilds the glyf and loca tables from WOFF2's transformed glyf (spec section 5.1). */
function rebuildGlyf(data) {
  const head = new Reader(data);
  head.u16(); // reserved
  const optionFlags = head.u16();
  const numGlyphs = head.u16();
  const indexFormat = head.u16();
  const sizes = Array.from({ length: 7 }, () => head.u32());
  let at = head.o;
  const stream = (size) => {
    const r = new Reader(data, at, at + size);
    at += size;
    return r;
  };
  const nContours = stream(sizes[0]);
  const nPoints = stream(sizes[1]);
  const flags = stream(sizes[2]);
  const glyphs = stream(sizes[3]);
  const composites = stream(sizes[4]);
  const bboxes = stream(sizes[5]);
  const instructions = stream(sizes[6]);
  const bboxBitmap = bboxes.bytes(4 * Math.floor((numGlyphs + 31) / 32));
  const overlapBitmap = optionFlags & 1 ? new Reader(data, at, data.length).bytes(Math.floor((numGlyphs + 7) / 8)) : null;
  const bit = (bitmap, i) => (bitmap[i >> 3] & (0x80 >> (i & 7))) !== 0;

  const glyf = new Writer();
  const offsets = [];
  for (let i = 0; i < numGlyphs; i++) {
    offsets.push(glyf.length);
    const contours = nContours.i16();
    if (contours === 0) {
      if (bit(bboxBitmap, i)) throw new Error(`empty glyph ${i} has a bounding box`);
      continue;
    }
    if (contours > 0) {
      const ends = [];
      let total = 0;
      for (let c = 0; c < contours; c++) {
        total += nPoints.u255();
        ends.push(total - 1);
      }
      const points = [];
      let x = 0;
      let y = 0;
      for (let p = 0; p < total; p++) {
        const flag = flags.u8();
        const [dx, dy] = triplet(flag & 0x7f, glyphs);
        x += dx;
        y += dy;
        points.push({ dx, dy, x, y, on: (flag & 0x80) === 0 });
      }
      const instructionLength = glyphs.u255();
      const code = instructions.bytes(instructionLength);
      let box;
      if (bit(bboxBitmap, i)) box = [bboxes.i16(), bboxes.i16(), bboxes.i16(), bboxes.i16()];
      else {
        box = [Infinity, Infinity, -Infinity, -Infinity];
        for (const pt of points) box = [Math.min(box[0], pt.x), Math.min(box[1], pt.y), Math.max(box[2], pt.x), Math.max(box[3], pt.y)];
      }
      glyf.u16(contours);
      for (const v of box) glyf.u16(v);
      for (const e of ends) glyf.u16(e);
      glyf.u16(instructionLength);
      glyf.push(code);
      const xs = new Writer();
      const ys = new Writer();
      points.forEach((pt, p) => {
        let f = pt.on ? 0x01 : 0;
        if (p === 0 && overlapBitmap && bit(overlapBitmap, i)) f |= 0x40;
        if (pt.dx === 0) f |= 0x10;
        else if (Math.abs(pt.dx) < 256) {
          f |= 0x02 | (pt.dx > 0 ? 0x10 : 0);
          xs.u8(Math.abs(pt.dx));
        } else xs.u16(pt.dx);
        if (pt.dy === 0) f |= 0x20;
        else if (Math.abs(pt.dy) < 256) {
          f |= 0x04 | (pt.dy > 0 ? 0x20 : 0);
          ys.u8(Math.abs(pt.dy));
        } else ys.u16(pt.dy);
        glyf.u8(f);
      });
      glyf.push(xs.bytes());
      glyf.push(ys.bytes());
    } else if (contours === -1) {
      if (!bit(bboxBitmap, i)) throw new Error(`composite glyph ${i} has no bounding box`);
      const box = [bboxes.i16(), bboxes.i16(), bboxes.i16(), bboxes.i16()];
      const start = composites.o;
      let more = true;
      let hasInstructions = false;
      while (more) {
        const f = composites.u16();
        composites.u16(); // glyph index
        composites.bytes(f & 0x0001 ? 4 : 2);
        if (f & 0x0008) composites.bytes(2);
        else if (f & 0x0040) composites.bytes(4);
        else if (f & 0x0080) composites.bytes(8);
        if (f & 0x0100) hasInstructions = true;
        more = (f & 0x0020) !== 0;
      }
      glyf.u16(0xffff);
      for (const v of box) glyf.u16(v);
      glyf.push(data.subarray(start, composites.o));
      if (hasInstructions) {
        const instructionLength = glyphs.u255();
        glyf.u16(instructionLength);
        glyf.push(instructions.bytes(instructionLength));
      }
    } else throw new Error(`glyph ${i} has ${contours} contours`);
    glyf.pad(4);
  }
  offsets.push(glyf.length);
  const loca = new Writer();
  for (const off of offsets) {
    if (indexFormat === 0) loca.u16(off / 2);
    else loca.u32(off);
  }
  return { glyf: glyf.bytes(), loca: loca.bytes(), indexFormat };
}

function checksum(bytes) {
  let sum = 0;
  const padded = Buffer.alloc(Math.ceil(bytes.length / 4) * 4);
  Buffer.from(bytes).copy(padded);
  for (let i = 0; i < padded.length; i += 4) sum = (sum + padded.readUInt32BE(i)) >>> 0;
  return sum;
}

/** WOFF2 in, TrueType out. */
export function woff2ToTtf(file) {
  const r = new Reader(new Uint8Array(file));
  if (r.u32() !== 0x774f4632) throw new Error("not a WOFF2 file");
  const flavor = r.u32();
  if (flavor === 0x74746366) throw new Error("font collections aren't handled");
  r.u32(); // length
  const numTables = r.u16();
  r.u16(); // reserved
  r.u32(); // totalSfntSize
  const compressedSize = r.u32();
  r.bytes(24); // versions, metadata and private block
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const flags = r.u8();
    const tag = (flags & 0x3f) === 0x3f ? Buffer.from(r.bytes(4)).toString("latin1") : KNOWN_TAGS[flags & 0x3f];
    const version = flags >> 6;
    const origLength = r.base128();
    const transformed = tag === "glyf" || tag === "loca" ? version === 0 : version !== 0;
    const storedLength = transformed ? r.base128() : origLength;
    if (transformed && tag !== "glyf" && tag !== "loca") throw new Error(`the ${tag} transform isn't handled`);
    tables.push({ tag, origLength, storedLength, transformed });
  }
  const stream = brotliDecompressSync(Buffer.from(r.bytes(compressedSize)));
  let at = 0;
  const data = {};
  for (const t of tables) {
    data[t.tag] = stream.subarray(at, at + t.storedLength);
    at += t.storedLength;
  }
  if (at !== stream.length) throw new Error("the WOFF2 stream doesn't match its table directory");
  const glyfTable = tables.find((t) => t.tag === "glyf");
  if (glyfTable?.transformed) {
    const rebuilt = rebuildGlyf(data.glyf);
    data.glyf = rebuilt.glyf;
    data.loca = rebuilt.loca;
    const head = Buffer.from(data.head);
    if (head.readInt16BE(50) !== rebuilt.indexFormat) throw new Error("head and the transformed glyf disagree on the loca format");
    data.head = head;
  }

  const tags = tables.map((t) => t.tag).sort();
  const searchRange = 2 ** Math.floor(Math.log2(tags.length)) * 16;
  const header = new Writer();
  header.u32(flavor);
  header.u16(tags.length);
  header.u16(searchRange);
  header.u16(Math.floor(Math.log2(tags.length)));
  header.u16(tags.length * 16 - searchRange);
  let offset = 12 + tags.length * 16;
  const body = new Writer();
  const records = [];
  for (const tag of tags) {
    let bytes = Buffer.from(data[tag]);
    if (tag === "head") {
      bytes = Buffer.from(bytes);
      bytes.writeUInt32BE(0, 8); // checkSumAdjustment, set below
    }
    records.push({ tag, sum: checksum(bytes), offset, length: bytes.length });
    body.push(bytes);
    body.pad(4);
    offset = 12 + tags.length * 16 + body.length;
  }
  for (const rec of records) {
    header.push(Buffer.from(rec.tag, "latin1"));
    header.u32(rec.sum);
    header.u32(rec.offset);
    header.u32(rec.length);
  }
  const font = Buffer.concat([header.bytes(), body.bytes()]);
  const head = records.find((rec) => rec.tag === "head");
  font.writeUInt32BE((0xb1b0afba - checksum(font)) >>> 0, head.offset + 8);
  return font;
}

/** The font's name records that say who made it and under what licence, so a build can check they're kept. */
export function licenceNames(ttf) {
  const numTables = ttf.readUInt16BE(4);
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (ttf.toString("latin1", rec, rec + 4) !== "name") continue;
    const start = ttf.readUInt32BE(rec + 8);
    const count = ttf.readUInt16BE(start + 2);
    const strings = start + ttf.readUInt16BE(start + 4);
    const found = {};
    for (let n = 0; n < count; n++) {
      const r = start + 6 + n * 12;
      const platform = ttf.readUInt16BE(r);
      const id = ttf.readUInt16BE(r + 6);
      if (platform !== 3 || ![0, 1, 13, 14].includes(id) || found[id]) continue;
      const len = ttf.readUInt16BE(r + 8);
      const off = strings + ttf.readUInt16BE(r + 10);
      found[id] = ttf.subarray(off, off + len).swap16().toString("utf16le");
      ttf.subarray(off, off + len).swap16(); // back as it was
    }
    return found;
  }
  return {};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(out, { recursive: true });
  for (const [from, to] of [
    ["geist-latin.woff2", "geist.ttf"],
    ["geist-mono-latin.woff2", "geist-mono.ttf"],
  ]) {
    const ttf = woff2ToTtf(readFileSync(join(fonts, from)));
    writeFileSync(join(out, to), ttf);
    const names = licenceNames(ttf);
    console.log(`${to}: ${ttf.length} bytes. ${names[1] ?? "?"}. ${names[0] ?? "no copyright line"}. Licence: ${names[13] ? names[13].slice(0, 80) : "none in the name table"} ${names[14] ?? ""}`);
  }
}
