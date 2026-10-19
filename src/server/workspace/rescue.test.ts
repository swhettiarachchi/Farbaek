import { describe, expect, it } from "vitest";
import type { FileDeps } from "./files";
import { rescueImport } from "./rescue";
import type { WriteDeps } from "./use-cases";

const NOW = new Date("2026-10-19T10:00:00.000Z");

function fakeDeps(over: { importFails?: boolean; createFails?: string } = {}) {
  const log: string[] = [];
  const deps: WriteDeps & FileDeps = {
    role: async () => "owner",
    billing: async () => ({ state: "free" }),
    countActiveProjects: async () => 0,
    loadTask: async () => null,
    createProject: async (input) => (log.push(`project:${input.name}`), over.createFails ? { ok: false, error: over.createFails } : { ok: true, value: "p1" }),
    createTask: async () => ({ ok: true, value: "t1" }),
    applyTransition: async () => ({ ok: true, value: 1 }),
    saveContract: async () => ({ ok: true, value: 1 }),
    approveContract: async () => ({ ok: true, value: null }),
    importFiles: async (input) => (log.push(`import:${input.files.length}`), over.importFails ? { ok: false, error: "PROJECT_TOO_LARGE" } : { ok: true, value: { created: input.files.length, updated: 0, unchanged: 0 } }),
    saveFile: async () => ({ ok: true, value: 1 }),
    deleteFile: async () => ({ ok: true, value: null }),
    newEventId: () => "key-1",
    now: () => NOW,
  };
  return { deps, log };
}

const files = [
  { path: "index.html", content: "<h1>Hi</h1>" },
  { path: "server.js", content: "const key = process.env.API_KEY;" },
];
const input = { orgId: "o1", userId: "u1", name: "Rescued app", files };

describe("rescueImport", () => {
  it("creates the project, imports the files, then starts a security check on it", async () => {
    const { deps, log } = fakeDeps();
    const checked: string[] = [];
    const r = await rescueImport(deps, async (projectId) => (checked.push(projectId), { ok: true, value: { reportId: "r1" } }), input);
    expect(r).toEqual({ ok: true, value: { projectId: "p1", imported: { files: 2 }, check: { reportId: "r1" } } });
    expect(log).toEqual(["project:Rescued app", "import:2"]);
    expect(checked).toEqual(["p1"]);
  });

  it("keeps the files and says why when the check can't start", async () => {
    const { deps } = fakeDeps();
    const r = await rescueImport(deps, { unavailable: "Security checks are included from the Plus plan up, and in the trial." }, input);
    expect(r).toMatchObject({ ok: true, value: { imported: { files: 2 }, check: { reason: expect.stringContaining("Plus plan") } } });
    const refused = await rescueImport(fakeDeps().deps, async () => ({ ok: false, code: "QUOTA_EXCEEDED", message: "No checks left this period." }), input);
    expect(refused).toMatchObject({ ok: true, value: { check: { reason: "No checks left this period." } } });
  });

  it("keeps the project and reports a failed import, without starting a check", async () => {
    const { deps } = fakeDeps({ importFails: true });
    let started = false;
    const r = await rescueImport(deps, async () => ((started = true), { ok: true, value: { reportId: "r1" } }), input);
    expect(r).toMatchObject({ ok: true, value: { projectId: "p1", imported: { error: expect.any(String) }, check: { reason: expect.any(String) } } });
    expect(started).toBe(false);
  });

  it("stops when the project can't be created", async () => {
    const r = await rescueImport(fakeDeps({ createFails: "QUOTA_EXCEEDED" }).deps, { unavailable: "x" }, input);
    expect(r.ok).toBe(false);
  });
});
