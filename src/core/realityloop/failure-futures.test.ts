import { describe, expect, it } from "vitest";
import { FAILURE_KINDS, addedLines, classifyLabRun, failureTestRequest, incidentKinds, labRunner, outputTail, suggestFailureFutures, withIncidents, LAB_NO_RUNNER, type IncidentMemory } from "./failure-futures";

const WEBHOOK_BEFORE = `export async function POST(req: Request) {
  return new Response("ok");
}
`;
const WEBHOOK_AFTER = `export async function POST(req: Request) {
  const event = JSON.parse(await req.text());
  const signature = req.headers.get("webhook-signature");
  await db.from("payments").insert({ id: event.id, amount: event.amount });
  await fetch(process.env.SLACK_URL, { method: "POST", body: JSON.stringify(event) });
  return new Response("ok");
}
`;

describe("failure scenarios from a change (ADR 0135)", () => {
  it("counts only the lines a change adds", () => {
    expect(addedLines(null, "a\nb")).toEqual([1, 2]);
    expect(addedLines("a\nb\n", "a\nx\nb\n\n")).toEqual([2]);
  });

  it("suggests scenarios from added lines, in the spec's order, with the line that suggested each", () => {
    const futures = suggestFailureFutures([{ path: "src/app/api/webhooks/route.ts", content: WEBHOOK_AFTER, before: WEBHOOK_BEFORE }]);
    expect(futures.map((f) => f.kind)).toEqual(["duplicate_delivery", "out_of_order", "timeout", "rate_limit", "partial_db_failure", "malformed_input"]);
    expect(futures[0]).toMatchObject({ title: "The same webhook arrives twice", evidence: [{ path: "src/app/api/webhooks/route.ts", line: 3, snippet: 'const signature = req.headers.get("webhook-signature");' }] });
    expect(suggestFailureFutures([{ path: "src/app/api/webhooks/route.ts", content: WEBHOOK_AFTER, before: WEBHOOK_BEFORE }], 20).map((f) => f.kind)).toContain("missing_config");
  });

  it("leaves out what's already handled, unchanged lines, tests and non-code files", () => {
    const guarded = `const r = await fetch(url, { signal: AbortSignal.timeout(5000) });\nif (r.status === 429) throw new Error("busy");\n`;
    expect(suggestFailureFutures([{ path: "src/call.ts", content: guarded, before: null }]).map((f) => f.kind)).not.toContain("timeout");
    expect(suggestFailureFutures([{ path: "src/call.ts", content: guarded, before: null }]).map((f) => f.kind)).not.toContain("rate_limit");
    expect(suggestFailureFutures([{ path: "src/call.ts", content: WEBHOOK_AFTER, before: WEBHOOK_AFTER }])).toEqual([]);
    expect(suggestFailureFutures([{ path: "src/call.test.ts", content: WEBHOOK_AFTER, before: null }])).toEqual([]);
    expect(suggestFailureFutures([{ path: "README.md", content: WEBHOOK_AFTER, before: null }])).toEqual([]);
    expect(suggestFailureFutures([{ path: "src/env.ts", content: "export const url = process.env.API_URL ?? 'http://localhost';\n", before: null }]).map((f) => f.kind)).not.toContain("missing_config");
  });

  it("picks the project's own test runner and a free test path beside the code, or says why it can't", () => {
    const evidence = { path: "src/app/api/webhooks/route.ts", line: 3, snippet: "" };
    const pkg = (d: string) => (p: string) => (p === "package.json" ? JSON.stringify({ devDependencies: { [d]: "1.0.0" } }) : null);
    expect(labRunner("duplicate_delivery", evidence, ["package.json"], pkg("vitest"))).toEqual({
      ok: true,
      runner: { framework: "vitest", testPath: "src/app/api/webhooks/route.failure-duplicate-delivery.test.ts", command: "npx --no-install vitest run src/app/api/webhooks/route.failure-duplicate-delivery.test.ts" },
    });
    const taken = labRunner("timeout", evidence, ["package.json", "src/app/api/webhooks/route.failure-timeout.test.ts"], pkg("jest"));
    expect(taken).toMatchObject({ ok: true, runner: { framework: "jest", testPath: "src/app/api/webhooks/route.failure-timeout-2.test.ts" } });
    expect(labRunner("timeout", evidence, ["package.json"], pkg("mocha"))).toEqual({ ok: false, reason: LAB_NO_RUNNER });
    const py = labRunner("timeout", { path: "app/client.py", line: 1, snippet: "" }, ["requirements.txt"], (p) => (p === "requirements.txt" ? "pytest==8.3.0\nhttpx==0.27.0" : null));
    expect(py).toEqual({ ok: true, runner: { framework: "pytest", testPath: "app/test_failure_timeout_client.py", command: "python3 -m pytest -q -p no:cacheprovider app/test_failure_timeout_client.py" } });
  });

  it("records only what a run observed", () => {
    const run = (state: string, exitCode: number | null, output: string) => classifyLabRun({ framework: "vitest", state, exitCode, output }).outcome;
    expect(run("succeeded", 0, " Test Files  1 passed (1)\n      Tests  2 passed (2)")).toBe("handled");
    expect(run("failed", 1, "AssertionError: expected 2 to be 1\n Tests  1 failed (1)")).toBe("reproduced");
    expect(run("failed", 1, "Error: Failed to load url ./route (resolved id: ./route)")).toBe("inconclusive");
    expect(run("failed", 1, "No test files found, exiting with code 1")).toBe("inconclusive");
    expect(run("timed_out", null, "")).toBe("inconclusive");
    expect(run("succeeded", 0, "nothing here")).toBe("inconclusive");
    expect(classifyLabRun({ framework: "pytest", state: "failed", exitCode: 1, output: "1 failed in 0.2s" }).outcome).toBe("reproduced");
    expect(outputTail("a".repeat(5000), "")).toHaveLength(4000);
  });

  it("sends the files the scenario came from first, within the budget", () => {
    const [future] = suggestFailureFutures([{ path: "src/app/api/webhooks/route.ts", content: WEBHOOK_AFTER, before: null }]);
    const runner = { framework: "vitest" as const, testPath: "src/app/api/webhooks/route.failure-duplicate-delivery.test.ts", command: "" };
    const request = failureTestRequest(future!, runner, ["vitest", "next"], [
      { path: "src/big.ts", content: "x".repeat(59_900) },
      { path: "src/app/api/webhooks/route.ts", content: WEBHOOK_AFTER },
    ]);
    expect(request.files.map((f) => f.path)).toEqual(["src/app/api/webhooks/route.ts"]);
    expect(request).toMatchObject({ framework: "vitest", testPath: runner.testPath, packages: ["vitest", "next"], scenario: { kind: "duplicate_delivery" } });
  });
});

describe("past incidents in the lab (ADR 0145)", () => {
  it("reads the kinds of failure an incident's words name, and nothing from vague ones", () => {
    expect(incidentKinds("Checkout timed out after the payment provider was slow")).toEqual(["timeout"]);
    expect(incidentKinds("Customers were charged twice: webhook duplicates")).toEqual(["duplicate_delivery"]);
    expect(incidentKinds("429 Too Many Requests from the maps API")).toEqual(["rate_limit"]);
    expect(incidentKinds("Orders vanished at midnight UTC on the last day")).toEqual(["timezone_boundary"]);
    expect(incidentKinds("STRIPE_KEY was missing in production, env var not set")).toEqual(["missing_config"]);
    expect(incidentKinds("Site down")).toEqual([]);
    expect(incidentKinds("Something broke on the home page")).toEqual([]);
  });

  const handler = { path: "src/lib/pay.ts", before: "export const a = 1;\n", content: "export const a = 1;\nexport const total = (n: number) => n * 2;\n" };
  const timeout: IncidentMemory = { number: 12, title: "Checkout timed out", outcome: null, exact: true, paths: ["src/lib/pay.ts"] };

  it("adds a scenario an incident names, with this change's added lines as evidence", () => {
    const out = withIncidents(suggestFailureFutures([handler], FAILURE_KINDS.length), [handler], [timeout]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "timeout", incident: { number: 12, title: "Checkout timed out", exact: true }, evidence: [{ path: "src/lib/pay.ts", line: 2, snippet: "export const total = (n: number) => n * 2;" }] });
  });

  it("marks a scenario already suggested and puts incident ones first", () => {
    const webhook = { path: "src/app/api/webhooks/route.ts", content: WEBHOOK_AFTER, before: WEBHOOK_BEFORE };
    const all = suggestFailureFutures([webhook], FAILURE_KINDS.length);
    const charged: IncidentMemory = { number: 3, title: "Charged twice", outcome: "The provider retried and we stored it again", exact: false, paths: [webhook.path] };
    const out = withIncidents(all, [webhook], [charged]);
    expect(out[0]).toMatchObject({ kind: "duplicate_delivery", incident: { number: 3, exact: false } });
    expect(out[0]!.evidence).toEqual(all.find((f) => f.kind === "duplicate_delivery")!.evidence);
    expect(out.filter((f) => f.incident)).toHaveLength(1);
    expect(out.length).toBeLessThanOrEqual(6);
  });

  it("ignores incidents about other files, tests, or with no failure named", () => {
    const base = suggestFailureFutures([handler], FAILURE_KINDS.length);
    expect(withIncidents(base, [handler], [{ ...timeout, paths: ["src/other.ts"] }])).toEqual([]);
    expect(withIncidents(base, [handler], [{ ...timeout, title: "Something broke" }])).toEqual([]);
    const test = { path: "src/lib/pay.test.ts", before: null, content: "it('x', () => {});\n" };
    expect(withIncidents([], [test], [{ ...timeout, paths: [test.path] }])).toEqual([]);
  });

  it("is the plain suggestions when there are no incidents", () => {
    const webhook = { path: "src/app/api/webhooks/route.ts", content: WEBHOOK_AFTER, before: WEBHOOK_BEFORE };
    expect(withIncidents(suggestFailureFutures([webhook], FAILURE_KINDS.length), [webhook], [])).toEqual(suggestFailureFutures([webhook]));
  });
});
