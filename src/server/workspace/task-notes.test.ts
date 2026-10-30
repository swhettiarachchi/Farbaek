import { describe, expect, it } from "vitest";
import { INTENT_CONTRACT_SCHEMA, type IntentContract } from "@/core/realityloop/contract";
import { acceptTaskNote, taskNoteRequest, type TaskMode, type TaskNoteOutput } from "@/core/realityloop/modes";
import type { TaskNoteOutcome, TaskNoteWriter } from "@/server/ai/task-note-writer";
import type { AiUsageDeps } from "./ai-usage";
import type { ProposalDeps } from "./proposals";
import { writeTaskNote, type TaskNoteDeps } from "./task-notes";
import type { OrgRole } from "./types";
import type { WriteDeps } from "./use-cases";

const contract: IntentContract = {
  schema: INTENT_CONTRACT_SCHEMA,
  version: 1,
  outcome: "Explain how the cart totals work.",
  scope: { organizationId: "o1", projectId: "p1", resources: ["src/lib"] },
  allowedOperations: ["files.read"],
  forbiddenOperations: [],
  protectedFields: [],
  protectedInvariants: [],
  assumptions: [],
  openQuestions: [],
  acceptanceCriteria: [{ id: "ac-1", statement: "The totals are explained.", verification: "manual" }],
  approvals: [],
  limits: {},
  requiredChecks: [],
  recovery: "Nothing changes.",
};

const ANSWER: TaskNoteOutput = {
  summary: "The cart sums whole quantities.",
  points: [
    { title: "Totals", body: "add() returns the quantity.", path: "src/lib/cart.ts" },
    { title: "Invented", body: "About a file that wasn't sent.", path: "src/lib/secret.ts" },
  ],
  uncertainty: "",
};

/** A labelled fake writer: it never calls a model. */
function fakeWriter(result: TaskNoteOutcome) {
  const w = { model: "claude-sonnet-5-5", maxOutputTokens: 8_000, requests: [] as unknown[], async write(r: unknown) { w.requests.push(r); return result; } };
  return w satisfies TaskNoteWriter & { requests: unknown[] };
}

function fakeDeps(over: { role?: OrgRole; mode?: TaskMode } = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the spy records inputs of several shapes
  const calls: { name: string; input: any }[] = [];
  const deps: WriteDeps & AiUsageDeps & Pick<ProposalDeps, "approvedContract" | "projectFiles" | "fileContent"> & TaskNoteDeps = {
    role: async () => over.role ?? "member",
    billing: async () => ({ state: "active", paidPlanId: "pro" }),
    countActiveProjects: async () => 0,
    loadTask: async () => null,
    createProject: async () => ({ ok: true, value: "p1" }),
    createTask: async () => ({ ok: true, value: "t1" }),
    applyTransition: async () => ({ ok: true, value: 1 }),
    saveContract: async () => ({ ok: true, value: 1 }),
    approveContract: async () => ({ ok: true, value: null }),
    listUsageGrants: async () => [],
    reserveUsage: async (input) => (calls.push({ name: "reserve", input }), { ok: true, value: "entry-1" }),
    settleUsage: async (input) => (calls.push({ name: "settle", input }), { ok: true, value: null }),
    approvedContract: async () => ({ version: 1, sha256: "c".repeat(64), body: contract }),
    projectFiles: async () => [
      { path: "src/lib/cart.ts", revision: 1, sizeBytes: 40 },
      { path: "src/app/page.tsx", revision: 1, sizeBytes: 40 },
      { path: "public/logo.png", revision: 1, sizeBytes: 40 },
    ],
    fileContent: async (_o, _p, path) => ({ revision: 1, sha256: "a".repeat(64), content: `// ${path}\nexport const add = (q: number) => q;\n` }),
    taskForNote: async () => ({ id: "t1", projectId: "p1", title: "Understand the cart", mode: over.mode ?? "learn" }),
    recordTaskNote: async (input) => (calls.push({ name: "record", input }), { ok: true, value: "note-1" }),
    newEventId: () => "key-1",
    now: () => new Date("2026-10-30T10:00:00Z"),
  };
  return { deps, calls };
}

const input = { orgId: "o1", userId: "u1", taskId: "t1" };
const usage = { model: "claude-sonnet-5-5", inputTokens: 1_000, outputTokens: 300, cacheWriteTokens: 0, cacheReadTokens: 0 };

describe("notes for Learn and Audit tasks (ADR 0131)", () => {
  it("reads the contract's files, meters the call as task_note, and keeps only paths it sent", async () => {
    const f = fakeDeps();
    const w = fakeWriter({ ok: true, output: ANSWER, usage });
    const r = await writeTaskNote(f.deps, { family: "anthropic", create: () => w }, input);
    expect(r).toEqual({ ok: true, value: { kind: "explanation", noteId: "note-1", model: "claude-sonnet-5-5" } });
    expect((w.requests[0] as { files: { path: string }[] }).files.map((x) => x.path)).toEqual(["src/lib/cart.ts"]);
    expect(f.calls.map((c) => c.name)).toEqual(["reserve", "settle", "record"]);
    expect(f.calls[0]!.input).toMatchObject({ operation: "task_note", taskId: "t1" });
    expect(f.calls[2]!.input.body.points.map((p: { path: string | null }) => p.path)).toEqual(["src/lib/cart.ts", null]);
  });

  it("writes an audit report for an Audit task, and nothing for Build or Pair", async () => {
    const audit = fakeDeps({ mode: "audit" });
    expect(await writeTaskNote(audit.deps, { family: "anthropic", create: () => fakeWriter({ ok: true, output: ANSWER, usage }) }, input)).toMatchObject({ ok: true, value: { kind: "audit" } });
    for (const mode of ["build", "pair"] as const) {
      const f = fakeDeps({ mode });
      expect(await writeTaskNote(f.deps, { family: "anthropic", create: () => fakeWriter({ ok: true, output: ANSWER, usage }) }, input)).toMatchObject({ ok: false, message: expect.stringMatching(/Learn and Audit/) });
      expect(f.calls).toEqual([]);
    }
    expect(await writeTaskNote(fakeDeps({ role: "viewer" }).deps, { family: "anthropic", create: () => fakeWriter({ ok: true, output: ANSWER, usage }) }, input)).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("gives the usage back when the note fails, and keeps nothing", async () => {
    const f = fakeDeps();
    const r = await writeTaskNote(f.deps, { family: "anthropic", create: () => fakeWriter({ ok: false, failure: "PROVIDER_BUSY", usage: null }) }, input);
    expect(r).toMatchObject({ ok: false, code: "AI_BUSY" });
    expect(f.calls.map((c) => [c.name, c.input.status ?? null])).toEqual([
      ["reserve", null],
      ["settle", "refunded"],
    ]);
  });
});

describe("what a note reads", () => {
  it("takes up to 8 files and 60,000 characters, and names what it left", () => {
    const files = Array.from({ length: 10 }, (_, i) => ({ path: `f${i}.ts`, content: "x".repeat(25_000) }));
    const { request, left } = taskNoteRequest("audit", "Audit", null, files);
    expect(request.files.map((f) => [f.path, f.content.length, f.truncated])).toEqual([
      ["f0.ts", 20_000, true],
      ["f1.ts", 20_000, true],
      ["f2.ts", 20_000, true],
    ]);
    expect(left).toEqual(["f3.ts", "f4.ts", "f5.ts", "f6.ts", "f7.ts", "f8.ts", "f9.ts"]);
    expect(acceptTaskNote(request, { summary: " s ", points: [{ title: "t", body: "b", path: "f9.ts" }], uncertainty: "" }, left)).toEqual({ summary: "s", points: [{ title: "t", body: "b", path: null }], uncertainty: "", left });
  });
});
