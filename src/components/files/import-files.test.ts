import { deflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { crc32, zipFiles } from "@/core/workspace/zip";

vi.mock("@/app/app/actions", () => ({ importFilesAction: async () => ({ status: "error", message: "not in tests" }) }));
const { prepare } = await import("./import-files");

const enc = (s: string) => new TextEncoder().encode(s);
const zipFile = (bytes: Uint8Array, name = "project.zip") => new File([bytes as Uint8Array<ArrayBuffer>], name, { type: "application/zip" });

/** One deflated entry, as GitHub's and the Finder's zips are packed. */
function deflatedZip(path: string, text: string): Uint8Array {
  const data = enc(text);
  const body = new Uint8Array(deflateRawSync(data));
  const name = enc(path);
  const out = new Uint8Array(30 + name.length + body.length + 46 + name.length + 22);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x04034b50, true);
  v.setUint16(8, 8, true);
  v.setUint16(26, name.length, true);
  out.set(name, 30);
  out.set(body, 30 + name.length);
  const cd = 30 + name.length + body.length;
  v.setUint32(cd, 0x02014b50, true);
  v.setUint16(cd + 10, 8, true);
  v.setUint32(cd + 16, crc32(data), true);
  v.setUint32(cd + 20, body.length, true);
  v.setUint32(cd + 24, data.length, true);
  v.setUint16(cd + 28, name.length, true);
  out.set(name, cd + 46);
  const end = cd + 46 + name.length;
  v.setUint32(end, 0x06054b50, true);
  v.setUint16(end + 8, 1, true);
  v.setUint16(end + 10, 1, true);
  v.setUint32(end + 12, 46 + name.length, true);
  v.setUint32(end + 16, cd, true);
  return out;
}

describe("prepare, for a picked .zip", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("unpacks it and screens each file as if it had been picked", async () => {
    const zip = zipFiles([
      { path: "my-app-main/index.html", content: "<h1>Hi</h1>\n" },
      { path: "my-app-main/src/app.js", content: "export const x = 1;\n" },
      { path: "my-app-main/.env", content: "API_KEY=abc\n" },
      { path: "my-app-main/src/config.js", content: "const key = 'AKIAABCDEFGHIJKLMNOP';\n" },
      { path: "my-app-main/logo.png", content: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe, 0x00]) },
      { path: "my-app-main/node_modules/left-pad/index.js", content: "module.exports = 1;\n" },
      { path: "my-app-main/.DS_Store", content: new Uint8Array([0, 0, 0, 1]) },
      { path: "__MACOSX/my-app-main/._index.html", content: new Uint8Array([0, 5, 22, 7]) },
    ]);
    const r = await prepare([zipFile(zip)], false);
    expect(r.zipProblems).toEqual([]);
    expect(r.files.map((f) => f.path)).toEqual(["index.html", "src/app.js"]);
    expect(r.bytes).toBe(enc("<h1>Hi</h1>\nexport const x = 1;\n").length);
    expect(r.skipped).toEqual([
      { path: ".env", reason: "secret_file" },
      { path: "node_modules/left-pad/index.js", reason: "ignored_folder" },
      { path: "src/config.js", reason: "secret_content" },
      { path: "logo.png", reason: "binary" },
    ]);
  });

  it("inflates deflated entries, and keeps picked files beside the zip without doubling a path", async () => {
    const zip = deflatedZip("notes/readme.md", "# Notes\n");
    const r = await prepare([new File(["# Mine\n"], "readme.md"), zipFile(zip), new File(["a {}\n"], "style.css")], false);
    expect(r.files).toEqual([
      { path: "readme.md", content: "# Mine\n" },
      { path: "style.css", content: "a {}\n" },
    ]);
  });

  it("lists files the zip itself can't give back, with their reason", async () => {
    const zip = zipFiles([
      { path: "ok.txt", content: "fine" },
      { path: "big.txt", content: "x".repeat(600 * 1024) },
    ]);
    const r = await prepare([zipFile(zip)], false);
    expect(r.files.map((f) => f.path)).toEqual(["ok.txt"]);
    expect(r.skipped).toEqual([{ path: "big.txt", reason: "too_large" }]);
  });

  it("says plainly why a zip wasn't opened, and still reads the other files", async () => {
    const r = await prepare([zipFile(enc("not really a zip"), "broken.zip"), new File(["ok\n"], "a.txt")], false);
    expect(r.files.map((f) => f.path)).toEqual(["a.txt"]);
    expect(r.zipProblems).toEqual([{ name: "broken.zip", message: "This file isn't a zip archive, or it's damaged." }]);
  });

  it("says so when the browser can't unpack zips", async () => {
    vi.stubGlobal("DecompressionStream", undefined);
    const r = await prepare([zipFile(deflatedZip("a.txt", "hello"), "app.zip")], false);
    expect(r.files).toEqual([]);
    expect(r.zipProblems).toEqual([{ name: "app.zip", message: "This browser can't unpack zip files. Update it and try again." }]);
  });

  it("doesn't unpack a zip found inside a picked folder", async () => {
    const r = await prepare([zipFile(zipFiles([{ path: "a.txt", content: "a" }]), "backup.zip")], true);
    expect(r.files).toEqual([]);
    expect(r.zipProblems).toEqual([]);
    expect(r.skipped).toEqual([{ path: "backup.zip", reason: "binary" }]);
  });
});
