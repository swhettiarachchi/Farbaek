import { createInflateRaw, deflateRawSync, inflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InflateUnavailableError, ZipError, inflateThrough, readZip, sharedTopFolder, type Inflate } from "./unzip";
import { crc32, zipFiles } from "./zip";

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);
const deflate = (b: Uint8Array) => new Uint8Array(deflateRawSync(b));

/** node's zlib as the injected inflate. maxOutputLength makes it stop once the output passes the limit. */
const zlibInflate: Inflate = async (input, limit) => {
  try {
    const out = inflateRawSync(input, { maxOutputLength: Math.max(1, limit) });
    return out.length > limit ? null : new Uint8Array(out);
  } catch (e) {
    if ((e as { code?: string }).code === "ERR_BUFFER_TOO_LARGE") return null;
    throw e;
  }
};

/** A streaming zlib inflate that records how many bytes it actually produced. */
function countingInflate() {
  const seen = { produced: 0 };
  const inflate: Inflate = (input, limit) =>
    new Promise((resolve, reject) => {
      const z = createInflateRaw();
      const chunks: Buffer[] = [];
      let length = 0;
      z.on("data", (chunk: Buffer) => {
        seen.produced += chunk.length;
        length += chunk.length;
        if (length > limit) {
          z.destroy();
          resolve(null);
        } else chunks.push(chunk);
      });
      z.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
      z.on("error", reject);
      z.end(input);
    });
  return { inflate, seen };
}

interface TestEntry {
  path: string;
  data: Uint8Array;
  deflate?: boolean;
  flags?: number;
  /** Lie about the unpacked size, as a zip bomb would. */
  claimedSize?: number;
  crc?: number;
  method?: number;
  /** Stored as the entry's data instead of `data` (or its deflated form). */
  body?: Uint8Array;
}

/** A small archive built by hand, so tests can make deflated, encrypted and lying entries. */
function buildZip(entries: TestEntry[], comment = ""): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const body = e.body ?? (e.deflate ? deflate(e.data) : e.data);
    const method = e.method ?? (e.deflate ? 8 : 0);
    const name = enc(e.path);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(6, e.flags ?? 0, true);
    local.setUint16(8, method, true);
    local.setUint32(14, e.crc ?? crc32(e.data), true);
    local.setUint32(18, body.length, true);
    local.setUint32(22, e.claimedSize ?? e.data.length, true);
    local.setUint16(26, name.length, true);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(8, e.flags ?? 0, true);
    cd.setUint16(10, method, true);
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
  const note = enc(comment);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  end.setUint16(20, note.length, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer), note];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const viewOf = (zip: Uint8Array) => new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
const firstCentral = (zip: Uint8Array) => {
  const view = viewOf(zip);
  let cd = 0;
  while (view.getUint32(cd, true) !== 0x02014b50) cd += 1;
  return cd;
};

describe("readZip", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads back an archive from Farbaek's own writer", async () => {
    const files = [
      { path: "index.html", content: "<h1>Hi</h1>\n" },
      { path: "src/app.js", content: "console.log('héllo')\n" },
    ];
    const r = await readZip(zipFiles(files), { maxFileBytes: 1_000 });
    expect(r.entries.map((e) => [e.path, dec(e.bytes)])).toEqual(files.map((f) => [f.path, f.content]));
    expect(r.skipped).toEqual([]);
  });

  it("inflates entries deflated by zlib, with the platform's inflate or an injected one", async () => {
    const text = "body { color: red; }\n".repeat(50);
    const zip = buildZip([
      { path: "styles.css", data: enc(text), deflate: true },
      { path: "empty.txt", data: new Uint8Array(), deflate: true },
    ]);
    for (const inflate of [undefined, zlibInflate]) {
      const r = await readZip(zip, { maxFileBytes: 10_000, inflate });
      expect(r.entries.map((e) => [e.path, dec(e.bytes)])).toEqual([
        ["styles.css", text],
        ["empty.txt", ""],
      ]);
    }
  });

  it("leaves unwanted folders packed and ignores directory entries", async () => {
    const zip = buildZip([
      { path: "styles.css", data: enc("a {}"), deflate: true },
      { path: "node_modules/x/index.js", data: enc("module.exports = 1"), deflate: true },
      { path: "assets/", data: new Uint8Array() },
    ]);
    const asked: string[] = [];
    const r = await readZip(zip, {
      maxFileBytes: 10_000,
      wanted: (p) => {
        asked.push(p);
        return !p.startsWith("node_modules/");
      },
    });
    expect(r.entries.map((e) => e.path)).toEqual(["styles.css"]);
    expect(asked).toEqual(["styles.css", "node_modules/x/index.js"]);
  });

  it("returns paths as stored, with forward slashes, and never acts on them", async () => {
    const zip = buildZip([
      { path: "../../outside.txt", data: enc("a") },
      { path: "/etc/hosts", data: enc("b") },
      { path: "win\\style.css", data: enc("c") },
    ]);
    const r = await readZip(zip, { maxFileBytes: 1_000 });
    // Screening (checkPath) is the caller's job: these come back exactly as the archive names them.
    expect(r.entries.map((e) => e.path)).toEqual(["../../outside.txt", "/etc/hosts", "win/style.css"]);
  });

  it("skips files over the size limit, encrypted ones, unknown methods and ones whose checksum doesn't match", async () => {
    const zip = buildZip([
      { path: "big.txt", data: enc("x".repeat(2_000)) },
      { path: "secret.txt", data: enc("hidden"), flags: 1 },
      { path: "bzip.txt", data: enc("packed"), method: 12 },
      { path: "tampered.txt", data: enc("hello"), crc: 1234 },
      { path: "tampered-deflated.txt", data: enc("hello"), deflate: true, crc: 1234 },
      { path: "ok.txt", data: enc("fine") },
    ]);
    const r = await readZip(zip, { maxFileBytes: 1_000 });
    expect(r.entries.map((e) => e.path)).toEqual(["ok.txt"]);
    expect(r.skipped).toEqual([
      { path: "big.txt", reason: "too_large" },
      { path: "secret.txt", reason: "encrypted" },
      { path: "bzip.txt", reason: "unsupported_method" },
      { path: "tampered.txt", reason: "corrupt" },
      { path: "tampered-deflated.txt", reason: "corrupt" },
    ]);
  });

  it("calls an entry damaged when its deflate data is broken or shorter than it says", async () => {
    const good = deflate(enc("export const x = 1;\n".repeat(40)));
    const zip = buildZip([
      { path: "junk.js", data: enc("x"), body: enc("this is not deflate data at all"), method: 8 },
      { path: "cut.js", data: enc("export const x = 1;\n".repeat(40)), body: good.subarray(0, good.length >> 1), method: 8 },
    ]);
    for (const inflate of [undefined, zlibInflate]) {
      const r = await readZip(zip, { maxFileBytes: 10_000, inflate });
      expect(r.skipped).toEqual([
        { path: "junk.js", reason: "corrupt" },
        { path: "cut.js", reason: "corrupt" },
      ]);
    }
  });

  it("stops inflating a bomb that claims to be small, long before it unpacks in full", async () => {
    // Claims 100 bytes, unpacks to 16 MB from about 16 KB.
    const bomb = buildZip([{ path: "bomb.txt", data: new Uint8Array(16 * 1024 * 1024), deflate: true, claimedSize: 100 }]);
    const { inflate, seen } = countingInflate();
    expect((await readZip(bomb, { maxFileBytes: 1_000, inflate })).skipped).toEqual([{ path: "bomb.txt", reason: "too_large" }]);
    expect(seen.produced).toBeLessThan(256 * 1024);
    // The platform's inflate gives up too.
    expect((await readZip(bomb, { maxFileBytes: 1_000 })).skipped).toEqual([{ path: "bomb.txt", reason: "too_large" }]);
  });

  it("the platform inflate stops reading soon after the limit", async () => {
    const bomb = deflate(new Uint8Array(32 * 1024 * 1024));
    const ds = new DecompressionStream("deflate-raw");
    let produced = 0;
    const counter = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        produced += chunk.length;
        controller.enqueue(chunk);
      },
    });
    expect(await inflateThrough({ readable: ds.readable.pipeThrough(counter), writable: ds.writable }, bomb, 1_000)).toBeNull();
    expect(produced).toBeLessThan(8 * 1024 * 1024);
  });

  it("refuses an archive that unpacks past the total", async () => {
    const two = buildZip([
      { path: "a.txt", data: enc("a".repeat(600)), deflate: true },
      { path: "b.txt", data: enc("b".repeat(600)), deflate: true },
    ]);
    await expect(readZip(two, { maxFileBytes: 1_000, maxTotalBytes: 1_000, inflate: zlibInflate })).rejects.toMatchObject({ code: "too_big" });
  });

  it("refuses entries that share one stream, which is how a small file costs gigabytes of work", async () => {
    const zip = buildZip([
      { path: "a.txt", data: enc("same"), deflate: true },
      { path: "b.txt", data: enc("same"), deflate: true },
    ]);
    // Point the second central-directory entry at the first file's data.
    const view = viewOf(zip);
    const cd = firstCentral(zip);
    const second = cd + 46 + view.getUint16(cd + 28, true);
    view.setUint32(second + 42, 0, true);
    await expect(readZip(zip, { maxFileBytes: 1_000 })).rejects.toMatchObject({ code: "too_big" });
  });

  it("counts what it unpacks even when the file then fails its check", async () => {
    const zip = buildZip([
      { path: "a.txt", data: enc("a".repeat(600)), deflate: true, crc: 1 },
      { path: "b.txt", data: enc("b".repeat(600)), deflate: true, crc: 1 },
    ]);
    await expect(readZip(zip, { maxFileBytes: 1_000, maxTotalBytes: 1_000 })).rejects.toMatchObject({ code: "too_big" });
  });

  it("stops after enough entries lie about their size, instead of paying for each", async () => {
    const liars = buildZip([0, 1, 2, 3].map((i) => ({ path: `${i}.txt`, data: new Uint8Array(5_000), deflate: true, claimedSize: 10 })));
    await expect(readZip(liars, { maxFileBytes: 1_000, maxTotalBytes: 2_000 })).rejects.toMatchObject({ code: "too_big" });
  });

  it("refuses something that isn't a zip, and too many entries", async () => {
    await expect(readZip(enc("just text, not an archive at all"), { maxFileBytes: 1_000 })).rejects.toBeInstanceOf(ZipError);
    await expect(readZip(new Uint8Array(), { maxFileBytes: 1_000 })).rejects.toMatchObject({ code: "not_zip" });
    const many = buildZip([0, 1, 2].map((i) => ({ path: `f${i}.txt`, data: enc(String(i)) })));
    await expect(readZip(many, { maxFileBytes: 1_000, maxEntries: 2 })).rejects.toMatchObject({ code: "too_many_entries" });
  });

  it("refuses a truncated file, and a central directory that runs past its end", async () => {
    const zip = zipFiles([
      { path: "a.txt", content: "first file\n" },
      { path: "b.txt", content: "second file\n" },
    ]);
    // Cut short: the end record is gone.
    await expect(readZip(zip.subarray(0, zip.length - 10), { maxFileBytes: 1_000 })).rejects.toMatchObject({ code: "not_zip" });
    await expect(readZip(zip.subarray(0, zip.length >> 1), { maxFileBytes: 1_000 })).rejects.toMatchObject({ code: "not_zip" });
    // The end record says there are more entries than the directory holds.
    const more = zip.slice();
    viewOf(more).setUint16(more.length - 22 + 10, 3, true);
    await expect(readZip(more, { maxFileBytes: 1_000 })).rejects.toMatchObject({ code: "not_zip" });
    // An entry's data runs past the end of the file.
    const long = zip.slice();
    viewOf(long).setUint32(firstCentral(long) + 20, 100_000, true);
    expect((await readZip(long, { maxFileBytes: 1_000 })).skipped).toEqual([{ path: "a.txt", reason: "corrupt" }]);
  });

  it("refuses ZIP64 markers in the end record and in an entry", async () => {
    const zip = zipFiles([{ path: "a.txt", content: "a" }]);
    const count = zip.slice();
    viewOf(count).setUint16(count.length - 22 + 10, 0xffff, true);
    await expect(readZip(count, { maxFileBytes: 1_000 })).rejects.toMatchObject({ code: "zip64" });
    const offset = zip.slice();
    viewOf(offset).setUint32(offset.length - 22 + 16, 0xffffffff, true);
    await expect(readZip(offset, { maxFileBytes: 1_000 })).rejects.toMatchObject({ code: "zip64" });
    const entry = zip.slice();
    viewOf(entry).setUint32(firstCentral(entry) + 24, 0xffffffff, true);
    await expect(readZip(entry, { maxFileBytes: 1_000 })).rejects.toMatchObject({ code: "zip64", message: expect.stringContaining("ZIP64") });
  });

  it("finds the directory behind a comment, as GitHub's zips have", async () => {
    const zip = buildZip([{ path: "repo-main/README.md", data: enc("# Hi\n"), deflate: true }], "c0ffee1234567890c0ffee1234567890c0ffee12");
    const r = await readZip(zip, { maxFileBytes: 1_000 });
    expect(r.entries.map((e) => [e.path, dec(e.bytes)])).toEqual([["repo-main/README.md", "# Hi\n"]]);
  });

  it("says so when the platform can't inflate, and still reads stored entries", async () => {
    vi.stubGlobal("DecompressionStream", undefined);
    const deflated = buildZip([{ path: "a.txt", data: enc("hello"), deflate: true }]);
    await expect(readZip(deflated, { maxFileBytes: 1_000 })).rejects.toBeInstanceOf(InflateUnavailableError);
    const stored = zipFiles([{ path: "a.txt", content: "hello" }]);
    expect((await readZip(stored, { maxFileBytes: 1_000 })).entries.map((e) => e.path)).toEqual(["a.txt"]);
  });
});

describe("readZip as a zipped folder", () => {
  it("drops the one top folder GitHub wraps a repository in, and wanted sees the short path", async () => {
    const zip = buildZip(
      [
        { path: "repo-main/", data: new Uint8Array() },
        { path: "repo-main/index.html", data: enc("<h1>Hi</h1>"), deflate: true },
        { path: "repo-main/src/app.js", data: enc("export {};"), deflate: true },
      ],
      "c0ffee",
    );
    const asked: string[] = [];
    const r = await readZip(zip, { maxFileBytes: 1_000, unwrapFolder: true, wanted: (p) => (asked.push(p), true) });
    expect(r.entries.map((e) => e.path)).toEqual(["index.html", "src/app.js"]);
    expect(asked).toEqual(["index.html", "src/app.js"]);
  });

  it("leaves out the Finder's __MACOSX folder and .DS_Store files, then drops the top folder", async () => {
    const entries = [
      { path: "my-app/index.html", data: enc("<p>x</p>") },
      { path: "my-app/.DS_Store", data: new Uint8Array([0, 0, 0, 1]) },
      { path: "__MACOSX/my-app/._index.html", data: new Uint8Array([0, 5, 22, 7]) },
      { path: ".DS_Store", data: new Uint8Array([0, 0, 0, 1]) },
    ];
    const r = await readZip(buildZip(entries), { maxFileBytes: 1_000, unwrapFolder: true });
    expect(r.entries.map((e) => e.path)).toEqual(["index.html"]);
    // Without the option, nothing changes for Capsules and rescue imports.
    const plain = await readZip(buildZip(entries), { maxFileBytes: 1_000 });
    expect(plain.entries.map((e) => e.path)).toEqual(entries.map((e) => e.path));
  });

  it("keeps paths as they are when the files don't share one folder", async () => {
    const zip = zipFiles([
      { path: "index.html", content: "a" },
      { path: "src/app.js", content: "b" },
    ]);
    const r = await readZip(zip, { maxFileBytes: 1_000, unwrapFolder: true });
    expect(r.entries.map((e) => e.path)).toEqual(["index.html", "src/app.js"]);
  });

  it("never strips a folder that would hide a bad path", () => {
    expect(sharedTopFolder(["app/x.js", "app/src/y.js"])).toBe("app");
    expect(sharedTopFolder(["index.html", "src/a.js"])).toBeNull();
    expect(sharedTopFolder(["a/x.js", "b/y.js"])).toBeNull();
    expect(sharedTopFolder(["app/x.js", "application/y.js"])).toBeNull();
    expect(sharedTopFolder(["../x.js", "../y.js"])).toBeNull();
    expect(sharedTopFolder(["./x.js", "./y.js"])).toBeNull();
    expect(sharedTopFolder(["/etc/x", "/etc/y"])).toBeNull();
    expect(sharedTopFolder([])).toBeNull();
  });
});
