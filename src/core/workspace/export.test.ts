import { describe, expect, it } from "vitest";
import { inspectEvidence } from "../proof/inspect";
import { buildProofPack, proofPackDigest } from "../proof/proofpack";
import { sha256Hex } from "../trust/canonical-json";
import { EXPORT_FORMAT, buildExport, type ExportInput, type ExportTask } from "./export";

const H = (c: string) => c.repeat(64);

async function task(): Promise<ExportTask> {
  const statement = buildProofPack({
    task: { id: "t1", organizationId: "o1", projectId: "p1" },
    contract: { version: 1, sha256: H("c") },
    proposal: { id: "prop-1", sha256: H("a"), model: null },
    policy: null,
    approval: { approvedBy: "u1", approvedAt: "2026-10-20T10:00:00.000Z", appliedSha256: H("b") },
    files: [{ path: "index.html", kind: "edit", baseRevision: 1, sha256: await sha256Hex("<h1>Hi</h1>") }],
    checks: [],
    execution: { mode: "review_only", reason: "No sandbox." },
    createdAt: "2026-10-20T10:00:01.000Z",
    previous: null,
  });
  const digest = await proofPackDigest(statement);
  return {
    id: "t1",
    title: "Say hello",
    state: "VERIFICATION_PENDING",
    createdAt: "2026-10-20T09:00:00.000Z",
    updatedAt: "2026-10-20T10:00:01.000Z",
    transitions: [{ eventType: "approve", from: "APPROVAL_PENDING", to: "EXECUTING", actorKind: "user", at: "2026-10-20T10:00:00.000Z" }],
    contract: { version: 1, status: "approved", sha256: H("c"), body: { outcome: "Say hello" }, createdAt: "2026-10-20T09:30:00.000Z", approvedAt: "2026-10-20T09:40:00.000Z" },
    proofPacks: [{ digest, status: "unverified", statement, createdAt: "2026-10-20T10:00:01.000Z" }],
    recoveries: [],
    checks: [],
  };
}

const base = async (): Promise<ExportInput> => ({
  project: { id: "p1", name: "Harbour Lane", description: null, createdAt: "2026-10-01T00:00:00.000Z" },
  exportedAt: "2026-10-22T12:00:00.000Z",
  files: [
    { path: "index.html", content: "<h1>Hi</h1>" },
    { path: "package.json", content: JSON.stringify({ scripts: { build: "vite build" }, devDependencies: { vite: "7.0.0" } }) },
  ],
  tasks: [await task()],
  history: { events: [{ path: "index.html", change: "edit", revision: 2, at: "2026-10-20T10:00:00.000Z", proposalId: "prop-1" }], truncated: false },
});

describe("buildExport", () => {
  it("keeps the project's files at the root and lays out .farbaek/", async () => {
    const out = buildExport(await base());
    const paths = out.files.map((f) => f.path);
    expect(out.folder).toBe(".farbaek");
    expect(paths).toEqual(
      expect.arrayContaining([
        "index.html",
        "package.json",
        ".farbaek/README.md",
        ".farbaek/project.json",
        ".farbaek/history.json",
        ".farbaek/index.json",
        ".farbaek/tasks/t1/task.json",
        ".farbaek/tasks/t1/contract.json",
        `.farbaek/tasks/t1/proofpacks/${out.index[0]!.digest}.json`,
      ]),
    );
    expect(new Set(paths).size).toBe(paths.length);
    const project = JSON.parse(out.files.find((f) => f.path === ".farbaek/project.json")!.content);
    expect(project).toMatchObject({ format: EXPORT_FORMAT, name: "Harbour Lane", files: 2, tasks: 1 });
  });

  it("writes every evidence file so it checks as intact on its own", async () => {
    const out = buildExport(await base());
    expect(out.index).toHaveLength(1);
    for (const entry of out.index) {
      const file = JSON.parse(out.files.find((f) => f.path === entry.path)!.content);
      expect(await inspectEvidence(file)).toMatchObject({ ok: true, kind: entry.kind, intact: true });
    }
  });

  it("explains how to build it elsewhere, without Farbaek", async () => {
    const readme = buildExport(await base()).files.find((f) => f.path === ".farbaek/README.md")!.content;
    expect(readme).toMatch(/A Vite app\./);
    expect(readme).toMatch(/Install: `npm install`/);
    expect(readme).toMatch(/Build: `npm run build`/);
    expect(readme).toMatch(/farbaek\.com\/verify/);
    expect(readme).toMatch(/doesn't yet prove who made it/);
    expect(readme).not.toMatch(/—/);
  });

  it("says when history was cut, and steps aside for a project's own .farbaek folder", async () => {
    const input = await base();
    const cut = buildExport({ ...input, history: { ...input.history, truncated: true } });
    expect(cut.files.find((f) => f.path === ".farbaek/README.md")!.content).toMatch(/the first 500; later ones may be missing/);
    const own = buildExport({ ...input, files: [...input.files, { path: ".farbaek/notes.md", content: "mine" }] });
    expect(own.folder).toBe(".farbaek-export");
    expect(own.files.find((f) => f.path === ".farbaek/notes.md")!.content).toBe("mine");
    expect(own.files.some((f) => f.path === ".farbaek-export/index.json")).toBe(true);
  });
});
