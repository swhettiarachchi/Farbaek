import { describe, expect, it } from "vitest";
import { IN_TOTO_STATEMENT_TYPE, PROOFPACK_PREDICATE_TYPE, buildProofPack, proofPackDigest, proofPackStatus, verifyProofPack, type ProofPackInput } from "./proofpack";

const H = (c: string) => c.repeat(64);

const input: ProofPackInput = {
  task: { id: "t1", organizationId: "o1", projectId: "p1" },
  contract: { version: 2, sha256: H("c") },
  proposal: { id: "prop-1", sha256: H("a"), model: "claude-opus-5-5" },
  policy: { outcome: "REQUIRE_APPROVAL", version: H("e"), findings: [] },
  approval: { approvedBy: "u1", approvedAt: "2026-10-13T10:00:00.000Z", appliedSha256: H("b") },
  files: [
    { path: "src/lib/cart.ts", kind: "edit", baseRevision: 3, sha256: H("1") },
    { path: "src/lib/a.ts", kind: "create", baseRevision: 0, sha256: H("2") },
  ],
  checks: [{ name: "pnpm test", command: "pnpm test", exitCode: null }],
  execution: { mode: "review_only", reason: "No isolated sandbox is connected yet, so project code doesn't run here." },
  createdAt: "2026-10-13T10:00:01.000Z",
  previous: null,
};

describe("proofPackStatus", () => {
  it("comes only from real exit codes", () => {
    expect(proofPackStatus([])).toBe("unverified");
    expect(proofPackStatus([{ name: "t", command: "t", exitCode: null }])).toBe("unverified");
    expect(proofPackStatus([{ name: "t", command: "t", exitCode: 0 }])).toBe("verified");
    expect(proofPackStatus([{ name: "t", command: "t", exitCode: 0 }, { name: "l", command: "l", exitCode: 1 }])).toBe("partially_verified");
    expect(proofPackStatus([{ name: "t", command: "t", exitCode: 0 }, { name: "l", command: "l", exitCode: null }])).toBe("partially_verified");
    expect(proofPackStatus([{ name: "t", command: "t", exitCode: 2 }])).toBe("failed");
  });
});

describe("buildProofPack", () => {
  it("emits an in-toto statement whose subjects are the applied content digests", () => {
    const s = buildProofPack(input);
    expect(s._type).toBe(IN_TOTO_STATEMENT_TYPE);
    expect(s.predicateType).toBe(PROOFPACK_PREDICATE_TYPE);
    expect(s.subject).toEqual([
      { name: "src/lib/a.ts", digest: { sha256: H("2") } },
      { name: "src/lib/cart.ts", digest: { sha256: H("1") } },
    ]);
  });

  it("says what it doesn't prove, and why it isn't verified", () => {
    const s = buildProofPack(input);
    expect(s.predicate.status).toBe("unverified");
    expect(s.predicate.checks).toEqual([{ name: "pnpm test", command: "pnpm test", exitCode: null, status: "not_run" }]);
    expect(s.predicate.limits.join(" ")).toMatch(/does not prove that external claims/);
    expect(s.predicate.limits.join(" ")).toMatch(/Checks did not run. No isolated sandbox/);
    expect(s.predicate.limits.join(" ")).toMatch(/No Seal is issued/);
  });

  it("notes a contract with no checks and a missing policy decision", () => {
    const s = buildProofPack({ ...input, checks: [], policy: null });
    expect(s.predicate.limits.join(" ")).toMatch(/listed no required checks/);
    expect(s.predicate.limits.join(" ")).toMatch(/No rules decision/);
  });
});

describe("integrity", () => {
  it("detects any change to the stored record", async () => {
    const s = buildProofPack(input);
    const digest = await proofPackDigest(s);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(await verifyProofPack(JSON.parse(JSON.stringify(s)), digest)).toEqual({ intact: true, computed: digest });
    const tampered = structuredClone(s);
    tampered.predicate.checks[0]!.exitCode = 0;
    expect((await verifyProofPack(tampered, digest)).intact).toBe(false);
  });

  it("is independent of key order and file order", async () => {
    const a = await proofPackDigest(buildProofPack(input));
    const b = await proofPackDigest(buildProofPack({ ...input, files: [...input.files].reverse() }));
    expect(a).toBe(b);
  });

  it("links to the previous ProofPack", async () => {
    const first = await proofPackDigest(buildProofPack(input));
    const second = buildProofPack({ ...input, previous: first });
    expect(second.predicate.previous).toBe(first);
    expect(await proofPackDigest(second)).not.toBe(first);
  });
});
