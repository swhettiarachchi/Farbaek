import { describe, expect, it } from "vitest";
import { WORKSPACE_LIMITS } from "@/config/workspace";
import type { OrgRole } from "./types";
import { deleteProjectFile, importProjectFiles, saveProjectFile, saveProjectImage, type FileDeps } from "./files";
import type { WriteDeps } from "./use-cases";

const fake = (...parts: string[]) => parts.join("");

function fakeDeps(over: { role?: OrgRole | null; rpcError?: string } = {}) {
  const calls: { name: string; input: unknown }[] = [];
  const result = <T>(name: string, input: unknown, value: T) => {
    calls.push({ name, input });
    return over.rpcError ? { ok: false as const, error: over.rpcError } : { ok: true as const, value };
  };
  const deps: WriteDeps & FileDeps = {
    role: async () => (over.role === undefined ? "member" : over.role),
    billing: async () => ({ state: "free" }),
    countActiveProjects: async () => 0,
    loadTask: async () => null,
    createProject: async () => ({ ok: true, value: "p1" }),
    createTask: async () => ({ ok: true, value: "t1" }),
    applyTransition: async () => ({ ok: true, value: 1 }),
    saveContract: async () => ({ ok: true, value: 1 }),
    approveContract: async () => ({ ok: true, value: null }),
    importFiles: async (input) => result("import", input, { created: input.files.length, updated: 0, unchanged: 0 }),
    saveFile: async (input) => result("save", input, input.expectedRevision + 1),
    saveImage: async (input) => result("image", input, input.expectedRevision + 1),
    deleteFile: async (input) => result("delete", input, null),
    newEventId: () => "e1",
    now: () => new Date("2026-10-15T10:00:00Z"),
  };
  return { deps, calls };
}

const base = { orgId: "o1", userId: "u1", projectId: "p1" };

describe("importProjectFiles", () => {
  it("screens every file on the server and sends only accepted ones", async () => {
    const { deps, calls } = fakeDeps();
    const result = await importProjectFiles(deps, {
      ...base,
      files: [
        { path: "./src/index.ts", content: "export {};\n" },
        { path: "node_modules/x/index.js", content: "module.exports = 1;" },
        { path: ".env", content: "KEY=value" },
        { path: "src/config.ts", content: fake("const key = 'sb_secret_", "abcdefghijklmnop';") },
        { path: "../escape.ts", content: "x" },
        { path: "src/index.ts", content: "duplicate after normalising" },
      ],
    });
    expect(result).toEqual({
      ok: true,
      value: {
        created: 1,
        updated: 0,
        unchanged: 0,
        skipped: [
          { path: "node_modules/x/index.js", reason: "ignored_folder" },
          { path: ".env", reason: "secret_file" },
          { path: "src/config.ts", reason: "secret_content" },
          { path: "../escape.ts", reason: "invalid_path" },
        ],
      },
    });
    expect(calls).toEqual([{ name: "import", input: { projectId: "p1", actor: "u1", files: [{ path: "src/index.ts", content: "export {};\n" }] } }]);
  });

  it("refuses an import with nothing usable, or one over the size limit, without calling the database", async () => {
    const { deps, calls } = fakeDeps();
    expect(await importProjectFiles(deps, { ...base, files: [{ path: ".env", content: "A=1" }] })).toMatchObject({ code: "NOTHING_TO_IMPORT" });
    const chunk = "x".repeat(WORKSPACE_LIMITS.maxFileBytes);
    const many = Array.from({ length: 9 }, (_, i) => ({ path: `f${i}.txt`, content: chunk }));
    expect(await importProjectFiles(deps, { ...base, files: many })).toMatchObject({ code: "IMPORT_TOO_LARGE", message: expect.stringContaining("4 MB") });
    expect(calls).toEqual([]);
  });

  it("refuses viewers and maps database limits", async () => {
    expect(await importProjectFiles(fakeDeps({ role: "viewer" }).deps, { ...base, files: [{ path: "a.ts", content: "" }] })).toMatchObject({ code: "FORBIDDEN" });
    expect(await importProjectFiles(fakeDeps({ rpcError: "PROJECT_TOO_LARGE" }).deps, { ...base, files: [{ path: "a.ts", content: "" }] })).toMatchObject({
      code: "PROJECT_TOO_LARGE",
      message: expect.stringContaining("25 MB"),
    });
  });
});

describe("saveProjectFile", () => {
  it("saves a valid text file with the expected revision", async () => {
    const { deps, calls } = fakeDeps();
    expect(await saveProjectFile(deps, { ...base, path: "src/a.ts", content: "let a = 1;", expectedRevision: 3 })).toEqual({ ok: true, value: 4 });
    expect(calls[0]!.input).toMatchObject({ path: "src/a.ts", expectedRevision: 3 });
  });

  it("blocks secrets, credential files, bad paths and oversized content", async () => {
    const { deps, calls } = fakeDeps();
    const save = (path: string, content: string) => saveProjectFile(deps, { ...base, path, content, expectedRevision: 0 });
    expect(await save("src/a.ts", fake("-----BEGIN ", "PRIVATE KEY-----"))).toMatchObject({ code: "SECRET_IN_CONTENT" });
    expect(await save(".env.local", "A=1")).toMatchObject({ code: "INVALID_PATH", message: expect.stringContaining("keys and passwords") });
    expect(await save("../a.ts", "x")).toMatchObject({ code: "INVALID_PATH" });
    expect(await save("big.txt", "x".repeat(WORKSPACE_LIMITS.maxFileBytes + 1))).toMatchObject({ code: "FILE_TOO_LARGE" });
    expect(calls).toEqual([]);
  });

  it("reports a concurrent edit", async () => {
    expect(await saveProjectFile(fakeDeps({ rpcError: "FILE_CHANGED" }).deps, { ...base, path: "a.ts", content: "x", expectedRevision: 1 })).toMatchObject({ code: "FILE_CHANGED" });
  });
});

describe("deleteProjectFile", () => {
  it("deletes with the expected revision and maps errors", async () => {
    const { deps, calls } = fakeDeps();
    expect(await deleteProjectFile(deps, { ...base, path: "a.ts", expectedRevision: 2 })).toEqual({ ok: true, value: null });
    expect(calls[0]!.input).toEqual({ projectId: "p1", actor: "u1", path: "a.ts", expectedRevision: 2 });
    expect(await deleteProjectFile(fakeDeps({ rpcError: "NOT_FOUND" }).deps, { ...base, path: "a.ts", expectedRevision: 2 })).toMatchObject({ code: "NOT_FOUND" });
    expect(await deleteProjectFile(fakeDeps({ role: "viewer" }).deps, { ...base, path: "a.ts", expectedRevision: 2 })).toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("saveProjectImage (ADR 0108)", () => {
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

  it("sends a real image at an image path as base64", async () => {
    const { deps, calls } = fakeDeps();
    expect(await saveProjectImage(deps, { ...base, path: "assets/dot.png", bytes: PNG, expectedRevision: 0 })).toEqual({ ok: true, value: 1 });
    expect(calls).toEqual([{ name: "image", input: { projectId: "p1", actor: "u1", path: "assets/dot.png", base64: PNG.toString("base64"), expectedRevision: 0 } }]);
  });

  it("refuses viewers, renamed files, non-images and text paths before anything reaches the database", async () => {
    const viewer = fakeDeps({ role: "viewer" });
    expect((await saveProjectImage(viewer.deps, { ...base, path: "a.png", bytes: PNG, expectedRevision: 0 })).ok).toBe(false);
    const { deps, calls } = fakeDeps();
    expect(await saveProjectImage(deps, { ...base, path: "a.jpg", bytes: PNG, expectedRevision: 0 })).toMatchObject({ ok: false, code: "INVALID_IMAGE" });
    expect(await saveProjectImage(deps, { ...base, path: "a.png", bytes: new TextEncoder().encode("hi"), expectedRevision: 0 })).toMatchObject({ ok: false, code: "INVALID_IMAGE" });
    expect(await saveProjectImage(deps, { ...base, path: "notes.txt", bytes: PNG, expectedRevision: 0 })).toMatchObject({ ok: false, code: "INVALID_IMAGE" });
    expect(await saveProjectImage(deps, { ...base, path: "../a.png", bytes: PNG, expectedRevision: 0 })).toMatchObject({ ok: false, code: "INVALID_PATH" });
    expect(calls).toEqual([]);
  });

  it("keeps text saves off image paths", async () => {
    const { deps, calls } = fakeDeps();
    expect(await saveProjectFile(deps, { ...base, path: "assets/dot.png", content: "text", expectedRevision: 0 })).toMatchObject({ ok: false, code: "IMAGE_PATH" });
    expect(calls).toEqual([]);
  });
});
