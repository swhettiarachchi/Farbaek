import { describe, expect, it } from "vitest";
import type { ArenaSandbox } from "@/server/arena/runner";
import type { ArenaProposal } from "@/server/arena/store";
import type { ExecutionRecord } from "@/server/sandbox/types";
import { mutationPlanFor, runMutationRun, startMutationRun, type MutationDeps, type MutationPerson } from "./runner";
import type { MutationStore } from "./store";

const alice: MutationPerson = { orgId: "o1", userId: "u-alice", role: "member", permissions: {} };
const BEFORE = "export const max = 3;\n";
const AFTER = "export const max = 3;\nexport const ok = (n: number) => n > 0 && n <= max;\n";
const PROPOSAL: ArenaProposal = { id: "pr1", taskId: "t1", projectId: "p1", status: "pending", changes: [{ path: "src/limits.ts", kind: "edit", content: AFTER }] };

type Reply = Partial<ExecutionRecord>;
const passed: Reply = { exitCode: 0, state: "succeeded", stdout: " Tests  3 passed (3)", durationMs: 4000 };
const failed: Reply = { exitCode: 1, state: "failed", stdout: " FAIL  src/limits.test.ts > ok > rejects zero", durationMs: 3000 };

function fakes(over: { proposal?: Partial<ArenaProposal> | null; running?: boolean; manifest?: string; runs?: Reply[]; restoreFails?: boolean; clock?: () => number } = {}) {
  const calls: string[] = [];
  const finished: Parameters<MutationStore["finish"]>[0][] = [];
  const runs = [...(over.runs ?? [passed, failed, passed, failed])];
  const written = new Map<string, string>();
  const store: MutationStore = {
    proposal: async () => (over.proposal === null ? null : { ...PROPOSAL, ...over.proposal }),
    start: async () => (calls.push("start"), over.running ? { ok: false, error: "MUTATION_RUNNING" } : { ok: true, value: "m1" }),
    attach: async () => ({ ok: true, value: null }),
    finish: async (i) => (finished.push(i), { ok: true, value: null }),
  };
  let writes = 0;
  const service: ArenaSandbox = {
    overview: async () => ({ limits: { limits: { networkProfiles: ["none", "package_registries"], sizes: ["small"], maxSessionMinutes: 30 } } }) as never,
    createSession: async () => (calls.push("create"), { ok: true, value: { sessionId: "s1", created: true } }),
    runCommand: async (_a, _s, input) => {
      const command = String(input.command);
      if (command.startsWith("npm ci")) return (calls.push("install"), { ok: true, value: { ...passed, stdout: "" } as ExecutionRecord });
      calls.push(`test:${written.get("src/limits.ts")?.split("\n")[1] ?? ""}`);
      return { ok: true, value: { stderr: "", ...(runs.shift() ?? passed) } as ExecutionRecord };
    },
    trialChecks: async () => ({ ok: true, value: [] }),
    stopSession: async () => (calls.push("stop"), { ok: true, value: { state: "stopping" } }),
    writeFile: async (_a, _s, path, content) => {
      writes += 1;
      if (over.restoreFails && writes > 2) return { ok: false, code: "INVALID_REQUEST", message: "gone", category: "invalid_request" };
      written.set(String(path), String(content));
      return { ok: true, value: { path: String(path), bytes: 1 } };
    },
  };
  const deps: MutationDeps = {
    store,
    checks: {
      loadTask: async () => ({ id: "t1", title: "Limits", projectId: "p1", state: "APPROVAL_PENDING", version: 7 }),
      projectFiles: async () => ["package.json", "package-lock.json", "src/limits.ts", "src/limits.test.ts"].map((path) => ({ path, revision: 1, sha256: "e".repeat(64), sizeBytes: 10 })),
      fileContents: async () =>
        new Map([
          ["package.json", over.manifest ?? JSON.stringify({ devDependencies: { vitest: "4.0.0" } })],
          ["src/limits.ts", BEFORE],
        ]),
    },
    sandbox: { service, actor: { orgId: "o1", userId: "u-alice" } },
    newKey: () => "k",
    clock: over.clock,
  };
  return { deps, calls, finished };
}

async function input(f: ReturnType<typeof fakes>) {
  const plan = await mutationPlanFor(f.deps, "o1", PROPOSAL);
  return { id: "m1", proposal: PROPOSAL, mutants: plan.mutants, framework: plan.framework!, paths: plan.paths, read: plan.read, changed: plan.changed };
}

describe("startMutationRun (ADR 0136)", () => {
  it("refuses viewers, a change not waiting, nothing to mutate, no test runner and a second run", async () => {
    expect(await startMutationRun(fakes().deps, { ...alice, role: "viewer" }, "pr1")).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await startMutationRun(fakes({ proposal: { status: "applied" } }).deps, alice, "pr1")).toMatchObject({ ok: false, message: expect.stringMatching(/waiting for review/) });
    expect(await startMutationRun(fakes({ proposal: { changes: [{ path: "README.md", kind: "edit", content: "a > b" }] } }).deps, alice, "pr1")).toMatchObject({ ok: false, message: expect.stringMatching(/no lines/) });
    expect(await startMutationRun(fakes({ manifest: "{}" }).deps, alice, "pr1")).toMatchObject({ ok: false, message: expect.stringMatching(/Vitest, Jest or pytest/) });
    expect(await startMutationRun(fakes({ running: true }).deps, alice, "pr1")).toMatchObject({ ok: false, message: expect.stringMatching(/already running/) });
  });
});

describe("runMutationRun", () => {
  it("runs the related tests clean, then once per mutant, writing the original back each time", async () => {
    const f = fakes();
    const r = await runMutationRun(f.deps, alice, await input(f));
    expect(f.calls).toEqual([
      "create",
      "install",
      "test:export const ok = (n: number) => n > 0 && n <= max;",
      "test:export const ok = (n: number) => n >= 0 && n <= max;",
      "test:export const ok = (n: number) => n > 0 || n <= max;",
      "test:export const ok = (n: number) => n > 0 && n < max;",
      "stop",
    ]);
    expect(r).toMatchObject({ status: "done", command: "npx --no-install vitest related --run --bail=1 src/limits.ts", baselineMs: 4000, computeMs: 4000 + 3000 + 4000 + 3000 });
    expect(r.status === "done" && r.mutants.map((m) => [m.original, m.result, m.failingTest])).toEqual([
      [">", "killed", "src/limits.test.ts > ok > rejects zero"],
      ["&&", "survived", null],
      ["<=", "killed", "src/limits.test.ts > ok > rejects zero"],
    ]);
  });

  it("judges nothing when the clean run fails or finds no tests", async () => {
    const red = fakes({ runs: [failed] });
    expect(await runMutationRun(red.deps, alice, await input(red))).toMatchObject({ status: "failed", reason: expect.stringMatching(/fail without any mutant/) });
    const none = fakes({ runs: [{ exitCode: 1, state: "failed", stdout: "No test files found, exiting with code 1" }] });
    expect(await runMutationRun(none.deps, alice, await input(none))).toMatchObject({ status: "failed", reason: expect.stringMatching(/No tests cover/) });
    expect(none.calls).toContain("stop");
  });

  it("stops taking mutants when the original can't be written back, or the time budget is spent", async () => {
    const broken = fakes({ restoreFails: true });
    const r = await runMutationRun(broken.deps, alice, await input(broken));
    // The first mutant ran before its original couldn't be written back; nothing after it is trusted.
    expect(r.status === "done" && r.mutants.map((m) => m.result)).toEqual(["killed", "not_run", "not_run"]);

    let now = 0;
    const slow = fakes({ clock: () => (now += 7 * 60_000) });
    const s = await runMutationRun(slow.deps, alice, await input(slow));
    expect(s.status === "done" && s.mutants.map((m) => m.result)).toEqual(["killed", "not_run", "not_run"]);
  });
});
