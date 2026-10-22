import { describe, expect, it } from "vitest";
import { egressRules } from "../sandbox/network";
import { buildSandboxReceipt, sandboxReceiptDigest } from "../sandbox/receipts";
import { buildSecurityReport, securityReportDigest } from "../security/report";
import { sha256Hex } from "../trust/canonical-json";
import { inspectEvidence, matchFile } from "./inspect";
import { buildProofPack, proofPackDigest, type ProofPackInput } from "./proofpack";
import { buildRecoveryReceipt, recoveryReceiptDigest } from "./recovery-receipt";

const H = (c: string) => c.repeat(64);

async function packFor(content: string) {
  const input: ProofPackInput = {
    task: { id: "t1", organizationId: "o1", projectId: "p1" },
    contract: { version: 2, sha256: H("c") },
    proposal: { id: "prop-1", sha256: H("a"), model: "claude-opus-5-5" },
    policy: { outcome: "REQUIRE_APPROVAL", version: H("e"), findings: [] },
    approval: { approvedBy: "u1", approvedAt: "2026-10-13T10:00:00.000Z", appliedSha256: H("b") },
    files: [{ path: "src/cart.ts", kind: "edit", baseRevision: 3, sha256: await sha256Hex(content) }],
    checks: [{ name: "test", command: "pnpm test", exitCode: 0 }],
    execution: { mode: "sandboxed", provider: "Vercel Sandbox" },
    createdAt: "2026-10-13T10:00:01.000Z",
    previous: H("9"),
  };
  const statement = buildProofPack(input);
  return { statement, digest: await proofPackDigest(statement) };
}

describe("inspectEvidence", () => {
  it("finds a downloaded ProofPack intact and summarises what it proves", async () => {
    const { statement, digest } = await packFor("export const total = 1;\n");
    const r = await inspectEvidence(JSON.parse(JSON.stringify({ digest, status: "verified", statement })));
    expect(r).toMatchObject({ ok: true, kind: "proofpack", intact: true, claimed: digest, computed: digest, status: "verified" });
    if (!r.ok) return;
    expect(r.summary.files).toEqual([{ path: "src/cart.ts", sha256: await sha256Hex("export const total = 1;\n"), note: "edited" }]);
    expect(r.summary.checks).toEqual([{ name: "test", command: "pnpm test", exitCode: 0, status: "passed" }]);
    expect(r.summary.links).toEqual([{ label: "The project's previous ProofPack", digest: H("9") }]);
    expect(r.summary.limits.length).toBeGreaterThan(0);
  });

  it("catches a single changed character, and a wrong pasted digest", async () => {
    const { statement, digest } = await packFor("a");
    const changed = JSON.parse(JSON.stringify(statement));
    changed.predicate.checks[0].exitCode = 1;
    expect(await inspectEvidence({ digest, statement: changed })).toMatchObject({ ok: true, intact: false, claimed: digest });
    expect(await inspectEvidence(statement, H("0"))).toMatchObject({ ok: true, intact: false });
    expect(await inspectEvidence(statement, `sha256:${digest.toUpperCase()}`)).toMatchObject({ ok: true, intact: true });
    expect(await inspectEvidence(statement)).toMatchObject({ ok: true, intact: null, claimed: null });
  });

  it("matches a file's content to the change it was approved in", async () => {
    const { statement } = await packFor("export const total = 1;\n");
    const r = await inspectEvidence(statement);
    if (!r.ok) throw new Error(r.message);
    expect(matchFile(r.summary, await sha256Hex("export const total = 1;\n")).map((f) => f.path)).toEqual(["src/cart.ts"]);
    expect(matchFile(r.summary, await sha256Hex("export const total = 2;\n"))).toEqual([]);
  });

  it("checks recovery receipts, check receipts and security reports", async () => {
    const recovery = buildRecoveryReceipt({
      task: { id: "t1", organizationId: "o1", projectId: "p1" },
      proposal: { id: "p1", sha256: H("b") },
      proofPack: H("f"),
      plan: { sha256: H("c") },
      operationSha256: H("d"),
      policy: { outcome: "REQUIRE_APPROVAL", version: H("e"), findings: [] },
      approval: { approvedBy: "u1", approvedAt: "2026-10-17T10:00:00.000Z" },
      operations: [{ path: "src/a.ts", kind: "edit", status: "ready", action: "restore", fromRevision: 4, fromSha256: H("1"), toRevision: 3, toSha256: H("2") }],
      left: [],
      complete: true,
      createdAt: "2026-10-17T10:00:00.000Z",
    });
    const receipt = buildSandboxReceipt({
      session: { id: "s1", organizationId: "o1", projectId: "p1", taskId: "t1" },
      runtime: { provider: "E2B", isolation: "microvm", template: "node-ts", image: "farbaek-node-small", vcpu: 1, memoryMiB: 1024, egress: egressRules("none") },
      policy: { version: H("a"), outcome: "ALLOW_WITHIN_LIMITS" },
      snapshot: { sha256: H("b"), files: 3 },
      checks: [{ name: "test", command: "pnpm test", exitCode: 0, durationMs: 1200, failure: null, stdoutSha256: null, stderrSha256: null }],
      proofPackDigest: H("c"),
      createdAt: "2026-10-17T10:00:00.000Z",
    });
    const report = buildSecurityReport({ project: { id: "p1", name: "Harbour Lane" }, files: 12, snapshotDigest: H("d"), checks: [{ name: "rules", ran: true, findings: 0 }], findings: [], model: null, generatedAt: new Date("2026-10-19T10:00:00.000Z") });

    expect(await inspectEvidence({ digest: await recoveryReceiptDigest(recovery), statement: recovery })).toMatchObject({ ok: true, kind: "recovery", intact: true, status: "recovered" });
    expect(await inspectEvidence({ digest: await sandboxReceiptDigest(receipt), statement: receipt })).toMatchObject({ ok: true, kind: "check_receipt", intact: true });
    const sec = await inspectEvidence({ digest: await securityReportDigest(report), statement: report });
    expect(sec).toMatchObject({ ok: true, kind: "security_report", intact: true });
    if (sec.ok) expect(sec.summary.facts.find((f) => f.label === "Score")?.value).toMatch(/^100 \(grade A\)$/);
  });

  it("refuses what isn't Farbaek evidence, in words", async () => {
    expect(await inspectEvidence("text")).toMatchObject({ ok: false, message: expect.stringMatching(/isn't a JSON object/) });
    expect(await inspectEvidence({ hello: 1 })).toMatchObject({ ok: false, message: expect.stringMatching(/in-toto/) });
    expect(await inspectEvidence({ _type: "https://in-toto.io/Statement/v1", predicateType: "https://example.com/x", predicate: {} })).toMatchObject({ ok: false, message: expect.stringMatching(/doesn't record/) });
    const { statement } = await packFor("a");
    const gutted = JSON.parse(JSON.stringify(statement));
    delete gutted.predicate.changes;
    expect(await inspectEvidence(gutted)).toMatchObject({ ok: false, message: expect.stringMatching(/missing parts/) });
    expect(await inspectEvidence(statement, "nope")).toMatchObject({ ok: false, message: expect.stringMatching(/64 hexadecimal/) });
  });
});
