import { describe, expect, it } from "vitest";
import { DEVICE_COPY_VERSION, DeviceCopyPayloadSchema, blobName, compareLines, deviceCopyPath, dequeue, enqueue, projectFolder, readManifest, readQueue, settle, sha256Hex, userFolder, type QueuedSave } from "./device-copy";

const USER = "6f1c2b9e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
const OTHER = "7a2d3c0f-2b3c-4d5e-9f0a-1b2c3d4e5f60";
const PROJECT = "8b3e4d1a-3c4d-4e6f-8a1b-2c3d4e5f6071";
const ORG = "9c4f5e2b-4d5e-4f70-9b2c-3d4e5f607182";
const SHA = "a".repeat(64);

const manifest = (over: object = {}) => ({
  v: DEVICE_COPY_VERSION,
  userId: USER,
  orgId: ORG,
  projectId: PROJECT,
  projectName: "Fieldnote",
  keptAt: "2026-11-12T08:00:00.000Z",
  saveReason: null,
  files: [
    { path: "src/app.js", revision: 3, sha256: SHA, kind: "text" },
    { path: "public/logo.png", revision: 1, sha256: SHA, kind: "image" },
  ],
  ...over,
});

const save = (over: Partial<QueuedSave> = {}): QueuedSave => ({ orgId: ORG, projectId: PROJECT, path: "src/app.js", content: "one", baseRevision: 3, savedAt: "2026-11-12T08:01:00.000Z", ...over });

describe("a copy kept on the device", () => {
  it("reads a manifest made for this person and project", () => {
    expect(readManifest(manifest(), { userId: USER, projectId: PROJECT })?.files).toHaveLength(2);
  });

  it("keeps a picture under a build folder, which a project may hold", () => {
    expect(readManifest(manifest({ files: [{ path: "build/logo.png", revision: 1, sha256: SHA, kind: "image" }] }), { userId: USER, projectId: PROJECT })?.files).toHaveLength(1);
  });

  it("reads another account's copy, or another project's, as no copy", () => {
    expect(readManifest(manifest(), { userId: OTHER, projectId: PROJECT })).toBeNull();
    expect(readManifest(manifest({ projectId: OTHER }), { userId: USER, projectId: PROJECT })).toBeNull();
  });

  it("refuses a manifest with a path outside the project, or the same path twice", () => {
    for (const path of ["../outside.js", "/etc/passwd", "a//b.js", "a\\b.js"]) {
      expect(readManifest(manifest({ files: [{ path, revision: 1, sha256: SHA, kind: "text" }] }), { userId: USER, projectId: PROJECT })).toBeNull();
    }
    const twice = { path: "a.js", revision: 1, sha256: SHA, kind: "text" };
    expect(readManifest(manifest({ files: [twice, twice] }), { userId: USER, projectId: PROJECT })).toBeNull();
  });

  it("reads damaged storage as no copy", () => {
    expect(readManifest(null, { userId: USER, projectId: PROJECT })).toBeNull();
    expect(readManifest({ ...manifest(), v: 2 }, { userId: USER, projectId: PROJECT })).toBeNull();
    expect(readManifest({ ...manifest(), keptAt: "yesterday" }, { userId: USER, projectId: PROJECT })).toBeNull();
  });
});

describe("saves waiting on the device", () => {
  it("keeps one save per file, with the revision the edit started from", () => {
    let q = enqueue([], save());
    q = enqueue(q, save({ content: "two", baseRevision: 5 }));
    expect(q).toEqual([save({ content: "two", baseRevision: 3 })]);
    q = enqueue(q, save({ path: "src/other.js", baseRevision: 0 }));
    expect(q.map((s) => s.path)).toEqual(["src/app.js", "src/other.js"]);
    expect(dequeue(q, { projectId: PROJECT, path: "src/app.js" }).map((s) => s.path)).toEqual(["src/other.js"]);
  });

  it("reads only this account's queue, and drops a path the project wouldn't accept", () => {
    const raw = { v: DEVICE_COPY_VERSION, userId: USER, saves: [save(), save({ path: "../x.js" })] };
    expect(readQueue(raw, USER)).toEqual([save()]);
    expect(readQueue(raw, OTHER)).toEqual([]);
    expect(readQueue("broken", USER)).toEqual([]);
  });
});

describe("when a save meets a newer revision", () => {
  it("settles by itself when the server already has the same words", () => {
    expect(settle({ content: "same" }, { revision: 7, content: "same" })).toEqual({ kind: "same", revision: 7 });
  });

  it("asks the person when the server's file differs, or was deleted", () => {
    expect(settle({ content: "mine" }, { revision: 7, content: "theirs" })).toMatchObject({ kind: "conflict" });
    expect(settle({ content: "" }, { revision: 0, content: null })).toMatchObject({ kind: "conflict", server: { revision: 0 } });
  });
});

describe("names", () => {
  it("puts the device's version next to the server's when both are kept", () => {
    expect(deviceCopyPath("src/app.ts", new Set())).toBe("src/app.device.ts");
    expect(deviceCopyPath("src/app.ts", new Set(["src/app.device.ts"]))).toBe("src/app.device-2.ts");
    expect(deviceCopyPath("Makefile", new Set())).toBe("Makefile.device");
    expect(deviceCopyPath(".gitignore", new Set())).toBe(".gitignore.device");
  });

  it("names stored files by their content's hash, and folders only by uuids", async () => {
    const sha = await sha256Hex("hello");
    expect(sha).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
    expect(await sha256Hex(new TextEncoder().encode("hello"))).toBe(sha);
    expect(blobName(sha)).toBe(`c-${sha}`);
    expect(blobName("../../x")).toBeNull();
    expect(userFolder(USER)).toBe(`u-${USER}`);
    expect(userFolder("../../x")).toBeNull();
    expect(userFolder("demo-user")).toBe("u-demo-user");
    expect(userFolder("")).toBeNull();
    expect(projectFolder("p")).toBeNull();
  });
});

describe("the copy the server sends", () => {
  it("is checked before anything is stored", () => {
    const copy = { orgId: ORG, projectId: PROJECT, projectName: "Fieldnote", userId: USER, saveReason: null, files: [{ path: "a.js", revision: 1, sha256: SHA, kind: "text", content: "x" }, { path: "b.png", revision: 2, sha256: SHA, kind: "image", base64: "iVBO" }] };
    expect(DeviceCopyPayloadSchema.safeParse(copy).success).toBe(true);
    expect(DeviceCopyPayloadSchema.safeParse({ ...copy, files: [{ path: "a.js", revision: 1, sha256: SHA, kind: "text" }] }).success).toBe(false);
    expect(DeviceCopyPayloadSchema.safeParse({ ...copy, userId: "../me" }).success).toBe(false);
  });
});

describe("comparing the server's file with the device's", () => {
  it("shows each changed run with two unchanged lines before it", () => {
    expect(compareLines("a\nb\nc\nd\ne\n", "a\nb\nc\nD\ne\n")).toEqual({
      truncated: false,
      lines: [
        { kind: "context", text: "b" },
        { kind: "context", text: "c" },
        { kind: "removed", text: "d" },
        { kind: "added", text: "D" },
      ],
    });
  });

  it("cuts off a long comparison and says so", () => {
    const many = Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n");
    expect(compareLines("", many, 10)).toMatchObject({ truncated: true });
    expect(compareLines("", many, 10).lines).toHaveLength(10);
  });
});
