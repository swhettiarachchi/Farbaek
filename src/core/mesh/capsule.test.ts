import { describe, expect, it } from "vitest";
import { zipFiles } from "@/core/workspace/zip";
import { blake3Hex, buildCapsule, capsuleCopyPath, CHUNK_BYTES, encodeCapsule, fileHash, filesToWrite, manifestDigest, openCapsule, planImport, type CapsuleFile } from "./capsule";

const LIMITS = { maxFileBytes: 512 * 1024, maxFiles: 3_000, maxTotalBytes: 4 * 1024 * 1024 };
const FIXED = { id: "capsule-test-0001", createdAt: "2026-10-22T10:00:00.000Z", projectId: "p-1", projectName: "Harbor Café", maxFileBytes: LIMITS.maxFileBytes };
const enc = new TextEncoder();

function pack(files: CapsuleFile[]) {
  return buildCapsule({ ...FIXED, files });
}

describe("BLAKE3", () => {
  it("matches the published test vector for empty input", () => {
    expect(blake3Hex(new Uint8Array())).toBe("af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262");
  });
});

describe("buildCapsule", () => {
  it("hashes every file and sorts them, so the same project packs the same way", () => {
    const a = pack([{ path: "src/b.ts", content: "b" }, { path: "index.html", content: "<h1>Hi</h1>" }]);
    const b = pack([{ path: "index.html", content: "<h1>Hi</h1>" }, { path: "src/b.ts", content: "b" }]);
    expect(a.manifest.files.map((f) => f.path)).toEqual(["index.html", "src/b.ts"]);
    expect(a.manifest.files[0]!.blake3).toBe(fileHash("<h1>Hi</h1>"));
    expect(manifestDigest(a.manifest)).toBe(manifestDigest(b.manifest));
    expect(a.manifest.totals).toEqual({ files: 2, bytes: 12 });
  });

  it("splits files into 4 MiB chunks with a hash each", () => {
    const big = "x".repeat(CHUNK_BYTES + 10);
    const built = buildCapsule({ ...FIXED, maxFileBytes: 2 * CHUNK_BYTES, files: [{ path: "big.txt", content: big }] });
    const chunks = built.manifest.files[0]!.chunks;
    expect(chunks.map((c) => c.bytes)).toEqual([CHUNK_BYTES, 10]);
    expect(chunks[1]!.blake3).toBe(blake3Hex(enc.encode("x".repeat(10))));
  });

  it("leaves out secrets, credentials, dependencies and binaries, with the reason", () => {
    const built = pack([
      { path: ".env", content: "API_KEY=x" },
      { path: "keys/server.pem", content: "-----BEGIN PRIVATE KEY-----" },
      { path: "node_modules/a/index.js", content: "module.exports = 1" },
      { path: "src/config.ts", content: 'const key = "sk-ant-api03-' + "a".repeat(80) + '";' },
      { path: "logo.bin", content: "\u0000\u0001" },
      { path: "index.html", content: "<p>ok</p>" },
    ]);
    expect(built.files.map((f) => f.path)).toEqual(["index.html"]);
    expect(Object.fromEntries(built.excluded.map((e) => [e.path, e.reason]))).toEqual({
      ".env": "secret_file",
      "keys/server.pem": "secret_file",
      "node_modules/a/index.js": "ignored_folder",
      "src/config.ts": "secret_content",
      "logo.bin": "binary",
    });
  });
});

describe("openCapsule", () => {
  it("opens what buildCapsule packed, with the same digest", async () => {
    const built = pack([{ path: "index.html", content: "<p>Café ☕</p>" }, { path: "styles.css", content: "p{}" }]);
    const opened = await openCapsule(encodeCapsule(built), LIMITS);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.files).toEqual(built.files);
    expect(opened.digest).toBe(manifestDigest(built.manifest));
  });

  it("rejects a file changed after packing", async () => {
    const built = pack([{ path: "index.html", content: "<p>original</p>" }]);
    const tampered = encodeCapsule({ manifest: built.manifest, files: [{ path: "index.html", content: "<p>altered!</p>" }] });
    const opened = await openCapsule(tampered, LIMITS);
    expect(opened.ok).toBe(false);
    if (!opened.ok) expect(opened.problems.join(" ")).toMatch(/changed after the Capsule was made/);
  });

  it("rejects archives that aren't Capsules, and malformed manifests", async () => {
    expect(await openCapsule(enc.encode("not a zip"), LIMITS)).toMatchObject({ ok: false });
    const noManifest = await openCapsule(zipFiles([{ path: "index.html", content: "x" }]), LIMITS);
    expect(noManifest.ok === false && noManifest.problems[0]).toMatch(/no capsule.json/);
    const badJson = await openCapsule(zipFiles([{ path: "capsule.json", content: "{" }]), LIMITS);
    expect(badJson.ok === false && badJson.problems[0]).toMatch(/isn't valid JSON/);
    const wrongShape = await openCapsule(zipFiles([{ path: "capsule.json", content: '{"format":"other"}' }]), LIMITS);
    expect(wrongShape.ok === false && wrongShape.problems[0]).toMatch(/doesn't match the Capsule format/);
  });

  function withManifestPaths(paths: string[]) {
    const built = pack(paths.map((p, i) => ({ path: `f${i}.txt`, content: `c${i}` })));
    const files = built.manifest.files.map((f, i) => ({ ...f, path: paths[i]! }));
    const manifest = { ...built.manifest, files };
    return zipFiles([{ path: "capsule.json", content: JSON.stringify(manifest) }, ...files.map((f, i) => ({ path: `files/${f.path}`, content: `c${i}` }))]);
  }

  it("rejects traversal, absolute paths, NFC duplicates and case collisions", async () => {
    const cases: [string[], RegExp][] = [
      [["../escape.txt"], /"\." or "\.\."/],
      [["/etc/passwd"], /relative to the project root/],
      [["café.txt"], /normalised \(NFC\)/],
      [["Readme.md", "README.md"], /differ only in capital letters/],
      [[".env"], /credentials files can't be in a Capsule/],
    ];
    for (const [paths, problem] of cases) {
      const opened = await openCapsule(withManifestPaths(paths), LIMITS);
      expect(opened.ok, paths.join(",")).toBe(false);
      if (!opened.ok) expect(opened.problems.join(" "), paths.join(",")).toMatch(problem);
    }
  });

  it("rejects extra files the manifest doesn't list, and missing ones", async () => {
    const built = pack([{ path: "a.txt", content: "a" }]);
    const extra = zipFiles([{ path: "capsule.json", content: JSON.stringify(built.manifest) }, { path: "files/a.txt", content: "a" }, { path: "files/run.sh", content: "rm -rf ~" }]);
    expect((await openCapsule(extra, LIMITS)).ok).toBe(false);
    const missing = zipFiles([{ path: "capsule.json", content: JSON.stringify(built.manifest) }]);
    const opened = await openCapsule(missing, LIMITS);
    expect(opened.ok === false && opened.problems.join(" ")).toMatch(/missing from the file/);
  });

  it("rejects oversized content, like a zip bomb, before unpacking it all", async () => {
    const built = pack([{ path: "a.txt", content: "a" }]);
    const big = zipFiles([{ path: "capsule.json", content: JSON.stringify(built.manifest) }, { path: "files/a.txt", content: "a".repeat(LIMITS.maxTotalBytes + 2 * 1024 * 1024) }]);
    const opened = await openCapsule(big, { ...LIMITS, maxFileBytes: 64 * 1024 * 1024 });
    expect(opened.ok).toBe(false);
  });
});

describe("planImport and filesToWrite", () => {
  const built = pack([{ path: "index.html", content: "new home" }, { path: "about.html", content: "same" }, { path: "menu.html", content: "fresh" }]);

  it("marks files new, unchanged or different, and never defaults to overwriting", () => {
    const plan = planImport(built.manifest, [
      { path: "index.html", blake3: fileHash("old home") },
      { path: "about.html", blake3: fileHash("same") },
    ]);
    expect(plan).toEqual([
      { path: "about.html", status: "unchanged", choice: "skip" },
      { path: "index.html", status: "differs", choice: "keep_mine" },
      { path: "menu.html", status: "new", choice: "take" },
    ]);
    expect(filesToWrite(built.files, plan, {}, ["index.html", "about.html"]).map((f) => f.path)).toEqual(["menu.html"]);
  });

  it("writes the Capsule's version, or a copy beside the original, only when chosen", () => {
    const plan = planImport(built.manifest, [{ path: "index.html", blake3: fileHash("old home") }]);
    expect(filesToWrite(built.files, plan, { "index.html": "take" }, ["index.html"]).find((f) => f.path === "index.html")?.content).toBe("new home");
    const both = filesToWrite(built.files, plan, { "index.html": "keep_both" }, ["index.html"]);
    expect(both.map((f) => f.path)).toEqual(["about.html", "index.capsule.html", "menu.html"]);
  });

  it("numbers copies when the plain copy name is taken", () => {
    expect(capsuleCopyPath("src/app.ts", new Set())).toBe("src/app.capsule.ts");
    expect(capsuleCopyPath("src/app.ts", new Set(["src/app.capsule.ts"]))).toBe("src/app.capsule-2.ts");
    expect(capsuleCopyPath("Makefile", new Set())).toBe("Makefile.capsule");
  });
});

describe("images in Capsules (stage 179)", () => {
  const PNG = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));
  const IMAGE_LIMITS = { ...LIMITS, maxImageBytes: 2 * 1024 * 1024 };

  it("packs an image as its bytes and opens it again, hashed and unchanged", async () => {
    const built = pack([{ path: "index.html", content: "<img src=assets/dot.png>" }, { path: "assets/dot.png", content: PNG }]);
    expect(built.excluded).toEqual([]);
    expect(built.manifest.files.find((f) => f.path === "assets/dot.png")!.blake3).toBe(blake3Hex(PNG));
    const opened = await openCapsule(encodeCapsule(built), IMAGE_LIMITS);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const image = opened.files.find((f) => f.path === "assets/dot.png")!;
    expect(image.content).toBeInstanceOf(Uint8Array);
    expect(Array.from(image.content as Uint8Array)).toEqual(Array.from(PNG));
    expect(fileHash(PNG)).toBe(blake3Hex(PNG));
  });

  it("leaves out bytes that aren't the image their name says, and other binaries", () => {
    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    const built = pack([
      { path: "assets/run.png", content: exe },
      { path: "tool.exe", content: exe },
      { path: "assets/dot.jpg", content: PNG },
      { path: "assets/dot.png", content: PNG },
    ]);
    expect(built.manifest.files.map((f) => f.path)).toEqual(["assets/dot.png"]);
    expect(built.excluded.map((e) => [e.path, e.reason])).toEqual([
      ["assets/dot.jpg", "binary"],
      ["assets/run.png", "binary"],
      ["tool.exe", "binary"],
    ]);
  });

  it("refuses a Capsule whose image was swapped for other bytes, even with matching hashes", async () => {
    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    // A hostile sender packs an exe under an image name and lists its true hashes.
    const forged = buildCapsule({ ...FIXED, files: [{ path: "assets/dot.png", content: PNG }] });
    const entry = forged.manifest.files[0]!;
    const manifest = {
      ...forged.manifest,
      files: [{ ...entry, bytes: exe.length, blake3: blake3Hex(exe), chunks: [{ index: 0, bytes: exe.length, blake3: blake3Hex(exe) }] }],
      totals: { files: 1, bytes: exe.length },
    };
    const opened = await openCapsule(encodeCapsule({ manifest, files: [{ path: "assets/dot.png", content: exe }] }), IMAGE_LIMITS);
    expect(opened.ok).toBe(false);
    if (!opened.ok) expect(opened.problems.join(" ")).toMatch(/assets\/dot\.png/);
  });

  it("refuses an image whose bytes changed after packing", async () => {
    const built = pack([{ path: "assets/dot.png", content: PNG }]);
    const altered = PNG.slice();
    altered[altered.length - 5] ^= 0xff;
    const opened = await openCapsule(encodeCapsule({ manifest: built.manifest, files: [{ path: "assets/dot.png", content: altered }] }), IMAGE_LIMITS);
    expect(opened.ok).toBe(false);
    if (!opened.ok) expect(opened.problems.join(" ")).toMatch(/changed after the Capsule was made/);
  });

  it("still opens a text-only Capsule made before images could travel", async () => {
    const built = pack([{ path: "index.html", content: "<p>old</p>" }]);
    const opened = await openCapsule(encodeCapsule(built), LIMITS);
    expect(opened.ok).toBe(true);
  });

  it("compares and copies images like text: an unchanged image is left alone, and keep both makes a .capsule copy", () => {
    const built = pack([{ path: "assets/dot.png", content: PNG }]);
    expect(planImport(built.manifest, [{ path: "assets/dot.png", blake3: blake3Hex(PNG) }])[0]!.status).toBe("unchanged");
    const plan = planImport(built.manifest, [{ path: "assets/dot.png", blake3: "0".repeat(64) }]);
    expect(plan[0]!.status).toBe("differs");
    const out = filesToWrite(built.files, plan, { "assets/dot.png": "keep_both" }, ["assets/dot.png"]);
    expect(out.map((f) => f.path)).toEqual(["assets/dot.capsule.png"]);
    expect(out[0]!.content).toBeInstanceOf(Uint8Array);
  });
});
