import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { currentFile, readDeviceCopy, saveFromDevice, type DeviceSaveDeps } from "./device-saves";
import type { WorkspaceReader } from "./types";

const ORG = "9c4f5e2b-4d5e-4f70-9b2c-3d4e5f607182";
const PROJECT = "8b3e4d1a-3c4d-4e6f-8a1b-2c3d4e5f6071";
const USER = "6f1c2b9e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
const sha = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function reader(over: { contents?: () => { path: string; content: string }[]; project?: boolean } = {}) {
  let reads = 0;
  const r = {
    getProject: async () => (over.project === false ? null : { id: PROJECT, name: "Fieldnote" }),
    listFiles: async () => [
      { path: "public/logo.png", revision: 1, sizeBytes: PNG.length, sha256: sha(PNG), updatedAt: "2026-11-12T08:00:00Z", encoding: "base64" as const },
      { path: "src/app.js", revision: 4, sizeBytes: 5, sha256: sha("hello"), updatedAt: "2026-11-12T08:00:00Z" },
    ],
    getProjectContents: async () => {
      reads += 1;
      return over.contents ? over.contents() : [{ path: "src/app.js", content: "hello" }];
    },
    getProjectImages: async () => [{ path: "public/logo.png", base64: PNG.toString("base64") }],
    getFile: async (_o: string, _p: string, path: string) =>
      path === "src/app.js" ? { path, revision: 6, sizeBytes: 5, sha256: sha("other"), updatedAt: "", content: "other" } : path === "public/logo.png" ? { path, revision: 1, sizeBytes: 1, sha256: "", updatedAt: "", content: "iVBO", encoding: "base64" as const } : null,
  };
  return { reader: r as unknown as WorkspaceReader, reads: () => reads };
}

describe("a project copied to the device", () => {
  it("carries every file with its revision and hash, text as text and images as base64", async () => {
    const r = await readDeviceCopy(reader().reader, { orgId: ORG, projectId: PROJECT, userId: USER, saveReason: () => null });
    expect(r.ok && r.copy).toMatchObject({
      projectName: "Fieldnote",
      userId: USER,
      files: [
        { path: "public/logo.png", kind: "image", revision: 1, base64: PNG.toString("base64") },
        { path: "src/app.js", kind: "text", revision: 4, content: "hello" },
      ],
    });
  });

  it("refuses, to try again, when a save lands between the list and the contents", async () => {
    const changed = reader({ contents: () => [{ path: "src/app.js", content: "newer" }] });
    expect(await readDeviceCopy(changed.reader, { orgId: ORG, projectId: PROJECT, userId: USER, saveReason: () => null })).toMatchObject({ ok: false, status: 409 });
    expect(changed.reads()).toBe(1);
  });

  it("says why the person can't change the project, when they can't", async () => {
    const r = await readDeviceCopy(reader().reader, { orgId: ORG, projectId: PROJECT, userId: USER, saveReason: () => "You have view-only access to this workspace." });
    expect(r.ok && r.copy.saveReason).toBe("You have view-only access to this workspace.");
  });

  it("finds nothing for a project the person can't read", async () => {
    expect(await readDeviceCopy(reader({ project: false }).reader, { orgId: ORG, projectId: PROJECT, userId: USER, saveReason: () => null })).toMatchObject({ ok: false, status: 404 });
  });
});

describe("a save sent from the device", () => {
  const deps = (result: Awaited<ReturnType<DeviceSaveDeps["save"]>>): DeviceSaveDeps => ({ save: async () => result, current: (path) => currentFile(reader().reader, ORG, PROJECT, path) });

  it("answers the new revision", async () => {
    expect(await saveFromDevice(deps({ ok: true, value: 5 }), { owner: USER, orgId: ORG, path: "src/app.js", content: "mine", expectedRevision: 4 })).toEqual({ status: 200, body: { revision: 5 } });
  });

  it("answers a stale revision with the server's file, so the device can compare", async () => {
    const r = await saveFromDevice(deps({ ok: false, code: "FILE_CHANGED", message: "x" }), { owner: USER, orgId: ORG, path: "./src/app.js", content: "mine", expectedRevision: 4 });
    expect(r).toMatchObject({ status: 409, body: { code: "FILE_CHANGED", server: { revision: 6, content: "other" } } });
  });

  it("says a file deleted on the server is at revision 0, and gives no text for an image", async () => {
    expect(await currentFile(reader().reader, ORG, PROJECT, "gone.js")).toEqual({ revision: 0, content: null });
    expect(await currentFile(reader().reader, ORG, PROJECT, "public/logo.png")).toEqual({ revision: 1, content: null });
  });

  it("never calls a file deleted when Farbaek only couldn't read it", async () => {
    const unreadable: DeviceSaveDeps = { save: async () => ({ ok: false, code: "FILE_CHANGED", message: "x" }), current: async () => null };
    expect(await saveFromDevice(unreadable, { owner: USER, orgId: ORG, path: "a.js", content: "mine", expectedRevision: 2 })).toMatchObject({ status: 503, body: { code: "UNREADABLE" } });
    const broken = { getFile: async () => Promise.reject(new Error("down")) } as unknown as WorkspaceReader;
    expect(await currentFile(broken, ORG, PROJECT, "a.js")).toBeNull();
  });

  it("passes the editor's own refusals through with their words", async () => {
    expect(await saveFromDevice(deps({ ok: false, code: "SECRET_IN_CONTENT", message: "Remove the key." }), { owner: USER, orgId: ORG, path: "a.js", content: "k", expectedRevision: 0 })).toEqual({
      status: 422,
      body: { code: "SECRET_IN_CONTENT", message: "Remove the key." },
    });
    expect((await saveFromDevice(deps({ ok: false, code: "FORBIDDEN", message: "No." }), { owner: USER, orgId: ORG, path: "a.js", content: "k", expectedRevision: 0 })).status).toBe(403);
  });
});
