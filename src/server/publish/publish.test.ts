import { describe, expect, it } from "vitest";
import type { LaunchEvidence } from "@/core/publish/evidence";
import { deploymentDigest } from "@/core/publish/site";
import { publishSite, type PublishDeps } from "./publish";

const FILES = [
  { path: "index.html", revision: 2, sha256: "a".repeat(64), sizeBytes: 100, updatedAt: "2026-10-19T10:00:00Z" },
  { path: "styles.css", revision: 1, sha256: "b".repeat(64), sizeBytes: 50, updatedAt: "2026-10-19T09:00:00Z" },
];

function deps(over: Partial<PublishDeps> = {}) {
  const calls: unknown[] = [];
  const d: PublishDeps = {
    domain: "farbaek.si",
    canPublish: async () => true,
    files: async () => FILES,
    latestCheck: async () => ({ id: "r1", status: "done", startedAt: "2026-10-19T10:05:00Z", critical: 0 }),
    evidence: async () => VERIFIED,
    canOverride: async () => true,
    publish: async (input) => (calls.push(input), { ok: true, value: "d1" }),
    ...over,
  };
  return { d, calls };
}

const input = { orgId: "o1", userId: "u1", projectId: "p1", name: "Sunrise-Bakery " };
const VERIFIED: LaunchEvidence = { status: "verified", proofPack: "v".repeat(64), taskId: "t1" };
const NONE: LaunchEvidence = { status: "none", proofPack: null, taskId: null };

describe("publishSite", () => {
  it("publishes the current files with their digest and the passing check", async () => {
    const { d, calls } = deps();
    const r = await publishSite(d, input);
    const digest = await deploymentDigest("p1", FILES.map((f) => ({ path: f.path, revision: f.revision, sha256: f.sha256, size: f.sizeBytes })));
    expect(r).toEqual({ ok: true, deploymentId: "d1", digest, overridden: false });
    expect(calls).toEqual([
      {
        orgId: "o1",
        actor: "u1",
        projectId: "p1",
        name: "sunrise-bakery",
        reportId: "r1",
        digest,
        overrideReason: null,
        files: [
          { path: "index.html", revision: 2, sha256: "a".repeat(64), size: 100 },
          { path: "styles.css", revision: 1, sha256: "b".repeat(64), size: 50 },
        ],
      },
    ]);
  });

  it("stops before the database for a bad name, a viewer, or a gate that isn't met", async () => {
    expect(await publishSite(deps().d, { ...input, name: "www" })).toMatchObject({ ok: false, code: "INVALID_NAME" });
    expect(await publishSite(deps({ canPublish: async () => false }).d, input)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await publishSite(deps({ domain: null }).d, input)).toMatchObject({ ok: false, code: "NO_DOMAIN" });
    expect(await publishSite(deps({ latestCheck: async () => null }).d, input)).toMatchObject({ ok: false, code: "NO_CHECK" });
    const critical = deps({ latestCheck: async () => ({ id: "r1", status: "done", startedAt: "2026-10-19T10:05:00Z", critical: 1 }) });
    expect(await publishSite(critical.d, input)).toMatchObject({ ok: false, code: "CRITICAL_FINDINGS" });
    expect(critical.calls).toEqual([]);
  });

  it("explains what the database refused", async () => {
    const taken = deps({ publish: async () => ({ ok: false, error: 'NAME_TAKEN (duplicate key value violates unique constraint "sites_name_key")' }) });
    expect(await publishSite(taken.d, input)).toMatchObject({ ok: false, code: "NAME_TAKEN", message: expect.stringContaining("already used") });
    const changed = deps({ publish: async () => ({ ok: false, error: "FILES_CHANGED" }) });
    expect(await publishSite(changed.d, input)).toMatchObject({ ok: false, code: "FILES_CHANGED" });
  });

  it("needs verified evidence, or an owner's or admin's reason, before the database", async () => {
    const none = deps({ evidence: async () => NONE });
    expect(await publishSite(none.d, input)).toMatchObject({ ok: false, code: "EVIDENCE_REQUIRED" });
    expect(await publishSite(none.d, { ...input, overrideReason: "   " })).toMatchObject({ ok: false, code: "EVIDENCE_REQUIRED" });
    expect(await publishSite(none.d, { ...input, overrideReason: "short" })).toMatchObject({ ok: false, code: "REASON_REQUIRED" });
    const member = deps({ evidence: async () => ({ status: "failed", proofPack: "f".repeat(64), taskId: "t1" }), canOverride: async () => false });
    expect(await publishSite(member.d, { ...input, overrideReason: "A member can't decide this." })).toMatchObject({ ok: false, code: "OVERRIDE_FORBIDDEN" });
    expect([...none.calls, ...member.calls]).toEqual([]);
  });

  it("passes the trimmed reason on, and only when it's needed", async () => {
    const none = deps({ evidence: async () => NONE });
    const r = await publishSite(none.d, { ...input, overrideReason: "  Hand-made page, reviewed by me. " });
    expect(r).toMatchObject({ ok: true, overridden: true });
    expect(none.calls).toEqual([expect.objectContaining({ overrideReason: "Hand-made page, reviewed by me." })]);
    const verified = deps();
    await publishSite(verified.d, { ...input, overrideReason: "Not needed: it's verified." });
    expect(verified.calls).toEqual([expect.objectContaining({ overrideReason: null })]);
  });

  it("explains the database's evidence refusals, without mistaking them for a role problem", async () => {
    const forbidden = deps({ publish: async () => ({ ok: false, error: "OVERRIDE_FORBIDDEN" }) });
    expect(await publishSite(forbidden.d, input)).toMatchObject({ ok: false, code: "OVERRIDE_FORBIDDEN", message: expect.stringContaining("owner or admin") });
    const required = deps({ publish: async () => ({ ok: false, error: "EVIDENCE_REQUIRED" }) });
    expect(await publishSite(required.d, input)).toMatchObject({ ok: false, code: "EVIDENCE_REQUIRED" });
  });
});
