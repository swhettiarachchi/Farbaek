import { describe, expect, it } from "vitest";
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
    publish: async (input) => (calls.push(input), { ok: true, value: "d1" }),
    ...over,
  };
  return { d, calls };
}

const input = { orgId: "o1", userId: "u1", projectId: "p1", name: "Sunrise-Bakery " };

describe("publishSite", () => {
  it("publishes the current files with their digest and the passing check", async () => {
    const { d, calls } = deps();
    const r = await publishSite(d, input);
    const digest = await deploymentDigest("p1", FILES.map((f) => ({ path: f.path, revision: f.revision, sha256: f.sha256, size: f.sizeBytes })));
    expect(r).toEqual({ ok: true, deploymentId: "d1", digest });
    expect(calls).toEqual([
      {
        orgId: "o1",
        actor: "u1",
        projectId: "p1",
        name: "sunrise-bakery",
        reportId: "r1",
        digest,
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
});
