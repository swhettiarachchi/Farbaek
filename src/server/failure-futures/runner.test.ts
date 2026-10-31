import { describe, expect, it } from "vitest";
import type { FailureTestOutcome, FailureTestWriter } from "@/server/ai/failure-test-writer";
import type { ArenaSandbox } from "@/server/arena/runner";
import type { ArenaProposal } from "@/server/arena/store";
import type { ExecutionRecord } from "@/server/sandbox/types";
import { failureFuturesFor, runFailureFuture, startFailureFuture, type FailureDeps, type FailurePerson } from "./runner";
import type { IncidentMemory } from "@/core/realityloop/failure-futures";
import type { FailureStore } from "./store";

const alice: FailurePerson = { orgId: "o1", userId: "u-alice", role: "member", permissions: {} };
const BEFORE = 'export async function POST(req: Request) {\n  return new Response("ok");\n}\n';
const AFTER = 'export async function POST(req: Request) {\n  const event = JSON.parse(await req.text());\n  const signature = req.headers.get("webhook-signature");\n  await db.from("payments").insert({ id: event.id });\n  return new Response("ok");\n}\n';
const PROPOSAL: ArenaProposal = { id: "pr1", taskId: "t1", projectId: "p1", status: "pending", changes: [{ path: "src/app/api/webhooks/route.ts", kind: "edit", content: AFTER }] };
const TEST = "import { it, expect } from 'vitest';\nit('processes a duplicate delivery once', async () => { expect(1).toBe(1); });";
const usage = { model: "claude-sonnet-5-5", inputTokens: 2_000, outputTokens: 600, cacheWriteTokens: 0, cacheReadTokens: 0 };

/** A labelled fake writer: it never calls a model. */
function fakeWriter(result: FailureTestOutcome) {
  const w = { model: "claude-sonnet-5-5", maxOutputTokens: 12_000, requests: [] as unknown[], async write(r: unknown) { w.requests.push(r); return result; } };
  return w satisfies FailureTestWriter & { requests: unknown[] };
}

function fakes(over: { proposal?: Partial<ArenaProposal> | null; running?: boolean; manifest?: string; run?: Partial<ExecutionRecord>; writer?: FailureTestOutcome; sandbox?: "unavailable"; incidents?: IncidentMemory[] } = {}) {
  const calls: string[] = [];
  const finished: Parameters<FailureStore["finish"]>[0][] = [];
  const ledger: string[] = [];
  const writer = fakeWriter(over.writer ?? { ok: true, output: { test: TEST, expects: "The second delivery is ignored.", cannotTest: null }, usage });
  const store: FailureStore = {
    proposal: async () => (over.proposal === null ? null : { ...PROPOSAL, ...over.proposal }),
    incidents: async () => over.incidents ?? [],
    start: async (i) => (calls.push(`start:${i.kind}:${i.evidence[0]!.line}`), over.running ? { ok: false, error: "FAILURE_TRIAL_RUNNING" } : { ok: true, value: "f1" }),
    attach: async (i) => (calls.push(`attach:${i.sessionId}`), { ok: true, value: null }),
    finish: async (i) => (finished.push(i), { ok: true, value: null }),
  };
  const service: ArenaSandbox = {
    overview: async () => ({ limits: { limits: { networkProfiles: ["none", "package_registries"], sizes: ["small"], maxSessionMinutes: 30 } } }) as never,
    createSession: async (_a, input) => (calls.push(`create:${(input as { network: string }).network}`), { ok: true, value: { sessionId: "s1", created: true } }),
    runCommand: async (_a, _s, input) => {
      calls.push(`run:${String(input.command)}`);
      const test = String(input.command).includes("vitest");
      return { ok: true, value: { exitCode: 0, state: "succeeded", stdout: test ? " Tests  1 passed (1)" : "", stderr: "", durationMs: 2100, ...(test ? over.run : {}) } as ExecutionRecord };
    },
    trialChecks: async () => ({ ok: true, value: [] }),
    stopSession: async () => (calls.push("stop"), { ok: true, value: { state: "stopping" } }),
    writeFile: async (_a, _s, path) => (calls.push(`write:${String(path)}`), { ok: true, value: { path: String(path), bytes: 1 } }),
  };
  const deps: FailureDeps = {
    store,
    checks: {
      loadTask: async () => ({ id: "t1", title: "Record payments", projectId: "p1", state: "APPROVAL_PENDING", version: 7 }),
      projectFiles: async () => ["package.json", "package-lock.json", "src/app/api/webhooks/route.ts"].map((path) => ({ path, revision: 1, sha256: "e".repeat(64), sizeBytes: 10 })),
      fileContents: async () =>
        new Map([
          ["package.json", over.manifest ?? JSON.stringify({ devDependencies: { vitest: "4.0.0" } })],
          ["src/app/api/webhooks/route.ts", BEFORE],
        ]),
    },
    sandbox: over.sandbox ? { unavailable: "No verified sandbox is connected." } : { service, actor: { orgId: "o1", userId: "u-alice" } },
    usage: {
      billing: async () => ({ state: "active", paidPlanId: "pro" }),
      now: () => new Date("2026-10-30T10:00:00Z"),
      newEventId: () => "key-1",
      listUsageGrants: async () => [],
      reserveUsage: async (i) => (ledger.push(`reserve:${i.operation}`), { ok: true, value: "entry-1" }),
      settleUsage: async (i) => (ledger.push(`${i.status}`), { ok: true, value: null }),
    },
    writer: { family: "anthropic", create: () => writer },
    newKey: () => "k",
  };
  return { deps, calls, finished, ledger, writer };
}

async function prepared(f: ReturnType<typeof fakes>) {
  const { futures, paths, read } = await failureFuturesFor(f.deps, "o1", PROPOSAL);
  const future = futures.find((x) => x.kind === "duplicate_delivery")!;
  const runner = { framework: "vitest" as const, testPath: "src/app/api/webhooks/route.failure-duplicate-delivery.test.ts", command: "npx --no-install vitest run src/app/api/webhooks/route.failure-duplicate-delivery.test.ts" };
  return { id: "f1", proposal: PROPOSAL, future, runner, request: { scenario: { ...future }, framework: "vitest" as const, testPath: runner.testPath, packages: [], files: [] }, writer: f.writer, entryId: "entry-1", paths, read };
}

describe("startFailureFuture (ADR 0135)", () => {
  it("refuses viewers, withheld agents, a missing sandbox, a change not waiting, an unsuggested scenario and no test runner", async () => {
    const start = (f: ReturnType<typeof fakes>, person = alice, kind: "duplicate_delivery" | "retry_loop" = "duplicate_delivery") => startFailureFuture(f.deps, person, { proposalId: "pr1", kind });
    expect(await start(fakes(), { ...alice, role: "viewer" })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await start(fakes(), { ...alice, permissions: { run_agents: false } })).toMatchObject({ ok: false, code: "PERMISSION_WITHHELD" });
    expect(await start(fakes({ sandbox: "unavailable" }))).toMatchObject({ ok: false, message: "No verified sandbox is connected." });
    expect(await start(fakes({ proposal: { status: "applied" } }))).toMatchObject({ ok: false, message: expect.stringMatching(/waiting for review/) });
    expect(await start(fakes(), alice, "retry_loop")).toMatchObject({ ok: false, message: expect.stringMatching(/doesn't suggest that scenario/) });
    expect(await start(fakes({ manifest: JSON.stringify({ devDependencies: { mocha: "10.0.0" } }) }))).toMatchObject({ ok: false, message: expect.stringMatching(/Vitest, Jest or pytest/) });
  });

  it("accepts a scenario only a past incident on these files suggests (ADR 0145)", async () => {
    const retries: IncidentMemory = { number: 7, title: "Webhook retry storm", outcome: null, exact: true, paths: ["src/app/api/webhooks/route.ts"] };
    const f = fakes({ incidents: [retries] });
    expect(await startFailureFuture(f.deps, alice, { proposalId: "pr1", kind: "retry_loop" })).toMatchObject({ ok: true });
    expect(f.calls[0]).toBe("start:retry_loop:2");
    const { futures } = await failureFuturesFor(f.deps, "o1", PROPOSAL);
    expect(futures[0]).toMatchObject({ kind: "retry_loop", incident: { number: 7 } });
  });

  it("works the scenario out from the proposal, meters the test as failure_test, and refunds when a trial is already running", async () => {
    const busy = fakes({ running: true });
    expect(await startFailureFuture(busy.deps, alice, { proposalId: "pr1", kind: "duplicate_delivery" })).toMatchObject({ ok: false, message: expect.stringMatching(/already running/) });
    expect(busy.ledger).toEqual(["reserve:failure_test", "refunded"]);

    const f = fakes();
    expect(await startFailureFuture(f.deps, alice, { proposalId: "pr1", kind: "duplicate_delivery" })).toEqual({ ok: true, value: { trialId: "f1" } });
    for (let i = 0; i < 50 && !f.calls.includes("stop"); i += 1) await new Promise((r) => setTimeout(r, 5));
    expect(f.calls[0]).toBe("start:duplicate_delivery:3");
    expect(f.finished[0]).toMatchObject({ status: "handled" });
    expect(f.writer.requests[0]).toMatchObject({ framework: "vitest", testPath: "src/app/api/webhooks/route.failure-duplicate-delivery.test.ts", packages: ["vitest"], files: [{ path: "src/app/api/webhooks/route.ts" }] });
  });
});

describe("runFailureFuture", () => {
  it("writes the change and the test into one sandbox, installs without scripts, runs the test once, and stops", async () => {
    const f = fakes({ run: { exitCode: 1, state: "failed", stdout: "AssertionError: expected 2 to be 1\n Tests  1 failed (1)" } });
    const r = await runFailureFuture(f.deps, alice, await prepared(f));
    expect(f.calls).toEqual([
      "create:package_registries",
      "attach:s1",
      "write:src/app/api/webhooks/route.ts",
      "run:npm ci --ignore-scripts",
      "write:src/app/api/webhooks/route.failure-duplicate-delivery.test.ts",
      "run:npx --no-install vitest run src/app/api/webhooks/route.failure-duplicate-delivery.test.ts",
      "stop",
    ]);
    expect(r.status).toBe("reproduced");
    expect(f.finished[0]).toMatchObject({
      status: "reproduced",
      result: { test: `${TEST}\n`, testSha256: expect.stringMatching(/^[0-9a-f]{64}$/), expects: "The second delivery is ignored.", exitCode: 1, output: expect.stringMatching(/AssertionError/), model: "claude-sonnet-5-5" },
    });
    expect(f.ledger).toEqual(["settled"]);
  });

  it("records a scenario the AI can't test, refunds a failed write, and calls a test that didn't load inconclusive", async () => {
    const untestable = fakes({ writer: { ok: true, output: { test: "", expects: "", cannotTest: "The handler isn't exported." }, usage } });
    expect(await runFailureFuture(untestable.deps, alice, await prepared(untestable))).toMatchObject({ status: "not_testable", result: { reason: "The handler isn't exported." } });
    expect(untestable.calls).toEqual([]);

    const busy = fakes({ writer: { ok: false, failure: "PROVIDER_BUSY", usage: null } });
    expect(await runFailureFuture(busy.deps, alice, await prepared(busy))).toMatchObject({ status: "failed", result: { reason: expect.stringMatching(/busy/) } });
    expect(busy.ledger).toEqual(["refunded"]);

    const broken = fakes({ run: { exitCode: 1, state: "failed", stdout: "Error: Failed to resolve import \"./route\"" } });
    expect(await runFailureFuture(broken.deps, alice, await prepared(broken))).toMatchObject({ status: "inconclusive", result: { reason: expect.stringMatching(/couldn't load/) } });
    expect(broken.calls).toContain("stop");
  });
});
