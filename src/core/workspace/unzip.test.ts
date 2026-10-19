import { describe, expect, it } from "vitest";
import { ZipError, readZip } from "./unzip";
import { crc32, zipFiles } from "./zip";

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new CompressionStream("deflate-raw");
  const writer = stream.writable.getWriter();
  void writer.write(bytes as Uint8Array<ArrayBuffer>);
  void writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

interface TestEntry {
  path: string;
  data: Uint8Array;
  deflate?: boolean;
  flags?: number;
  /** Lie about the unpacked size, as a zip bomb would. */
  claimedSize?: number;
  crc?: number;
}

/** A small archive built by hand, so tests can make deflated, encrypted and lying entries. */
async function buildZip(entries: TestEntry[]): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const body = e.deflate ? await deflateRaw(e.data) : e.data;
    const name = enc(e.path);
    const header = (size: number) => {
      const h = new DataView(new ArrayBuffer(size));
      return h;
    };
    const local = header(30);
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(6, e.flags ?? 0, true);
    local.setUint16(8, e.deflate ? 8 : 0, true);
    local.setUint32(14, e.crc ?? crc32(e.data), true);
    local.setUint32(18, body.length, true);
    local.setUint32(22, e.claimedSize ?? e.data.length, true);
    local.setUint16(26, name.length, true);
    const cd = header(46);
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(8, e.flags ?? 0, true);
    cd.setUint16(10, e.deflate ? 8 : 0, true);
    cd.setUint32(16, e.crc ?? crc32(e.data), true);
    cd.setUint32(20, body.length, true);
    cd.setUint32(24, e.claimedSize ?? e.data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    parts.push(new Uint8Array(local.buffer), name, body);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + body.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

describe("readZip", () => {
  it("reads back an archive from Farbaek's own writer", async () => {
    const files = [
      { path: "index.html", content: "<h1>Hi</h1>\n" },
      { path: "src/app.js", content: "console.log('héllo')\n" },
    ];
    const r = await readZip(zipFiles(files), { maxFileBytes: 1_000 });
    expect(r.entries.map((e) => [e.path, dec(e.bytes)])).toEqual(files.map((f) => [f.path, f.content]));
    expect(r.skipped).toEqual([]);
  });

  it("inflates deflated entries and leaves unwanted folders packed", async () => {
    const text = "body { color: red; }\n".repeat(50);
    const zip = await buildZip([
      { path: "styles.css", data: enc(text), deflate: true },
      { path: "node_modules/x/index.js", data: enc("module.exports = 1"), deflate: true },
      { path: "assets/", data: new Uint8Array() },
    ]);
    const r = await readZip(zip, { maxFileBytes: 10_000, wanted: (p) => !p.startsWith("node_modules/") });
    expect(r.entries.map((e) => [e.path, dec(e.bytes)])).toEqual([["styles.css", text]]);
  });

  it("skips files over the size limit, encrypted ones and ones whose checksum doesn't match", async () => {
    const zip = await buildZip([
      { path: "big.txt", data: enc("x".repeat(2_000)) },
      { path: "secret.txt", data: enc("hidden"), flags: 1 },
      { path: "tampered.txt", data: enc("hello"), crc: 1234 },
      { path: "ok.txt", data: enc("fine") },
    ]);
    const r = await readZip(zip, { maxFileBytes: 1_000 });
    expect(r.entries.map((e) => e.path)).toEqual(["ok.txt"]);
    expect(r.skipped).toEqual([
      { path: "big.txt", reason: "too_large" },
      { path: "secret.txt", reason: "encrypted" },
      { path: "tampered.txt", reason: "corrupt" },
    ]);
  });

  it("stops inflating an entry that unpacks to more than it claims, and an archive past the total", async () => {
    // Claims 100 bytes, unpacks to 50,000: inflation stops at the file limit.
    const bomb = await buildZip([{ path: "bomb.txt", data: new Uint8Array(50_000), deflate: true, claimedSize: 100 }]);
    expect((await readZip(bomb, { maxFileBytes: 1_000 })).skipped).toEqual([{ path: "bomb.txt", reason: "too_large" }]);

    const two = await buildZip([
      { path: "a.txt", data: enc("a".repeat(600)), deflate: true },
      { path: "b.txt", data: enc("b".repeat(600)), deflate: true },
    ]);
    await expect(readZip(two, { maxFileBytes: 1_000, maxTotalBytes: 1_000 })).rejects.toMatchObject({ code: "too_big" });
  });

  it("refuses something that isn't a zip, and too many entries", async () => {
    await expect(readZip(enc("just text, not an archive at all"), { maxFileBytes: 1_000 })).rejects.toBeInstanceOf(ZipError);
    const many = await buildZip([0, 1, 2].map((i) => ({ path: `f${i}.txt`, data: enc(String(i)) })));
    await expect(readZip(many, { maxFileBytes: 1_000, maxEntries: 2 })).rejects.toMatchObject({ code: "too_many_entries" });
  });
});
