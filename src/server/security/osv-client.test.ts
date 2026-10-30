import { describe, expect, it } from "vitest";
import type { LockedPackage } from "@/core/security/osv";
import { createOsvLookup } from "./osv-client";

const pkg = (name: string, version = "1.0.0"): LockedPackage => ({ ecosystem: "npm", name, version, file: "package-lock.json" });

/** A labelled fake of OSV.dev: it never reaches the network. */
function fakeOsv(opts: { vulnFor?: Record<string, string[]>; fail?: "batch" | "detail"; badBatch?: boolean } = {}) {
  const calls: string[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push(`${init.method ?? "GET"} ${url}`);
    if (url.endsWith("/v1/querybatch")) {
      if (opts.fail === "batch") throw new TypeError("network");
      const body = JSON.parse(String(init.body)) as { queries: { package: { name: string } }[] };
      const results = opts.badBatch ? [] : body.queries.map((q) => (opts.vulnFor?.[q.package.name] ? { vulns: opts.vulnFor[q.package.name]!.map((id) => ({ id, modified: "x" })) } : {}));
      return new Response(JSON.stringify({ results }), { status: 200 });
    }
    if (opts.fail === "detail") return new Response("no", { status: 500 });
    const id = decodeURIComponent(url.split("/").pop()!);
    return new Response(JSON.stringify({ id, summary: `About ${id}`, database_specific: { severity: "HIGH" }, affected: [] }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

describe("looking packages up in OSV.dev", () => {
  it("asks in batches of 1,000, and fetches details for at most 40 advisories", async () => {
    const many = Array.from({ length: 1_500 }, (_, i) => pkg(`p${i}`));
    const vulnFor = Object.fromEntries(many.slice(0, 50).map((p, i) => [p.name, [`GHSA-${i}`]]));
    const f = fakeOsv({ vulnFor });
    const r = await createOsvLookup(f.fetcher)(many);
    expect(f.calls.filter((c) => c.startsWith("POST https://api.osv.dev/v1/querybatch"))).toHaveLength(2);
    expect(f.calls.filter((c) => c.startsWith("GET https://api.osv.dev/v1/vulns/"))).toHaveLength(40);
    expect(r.ok && r.hits).toHaveLength(50);
    expect(r.ok && r.details.get("GHSA-0")).toMatchObject({ summary: "About GHSA-0", severity: "HIGH" });
  });

  it("says why when OSV.dev can't be reached or answers oddly, and keeps advisories whose details failed", async () => {
    expect(await createOsvLookup(fakeOsv({ fail: "batch" }).fetcher)([pkg("a")])).toEqual({ ok: false, reason: "Farbaek couldn't reach OSV.dev just now. Run the check again later." });
    expect(await createOsvLookup(fakeOsv({ badBatch: true }).fetcher)([pkg("a")])).toEqual({ ok: false, reason: "OSV.dev answered in a way Farbaek didn't expect." });
    const r = await createOsvLookup(fakeOsv({ vulnFor: { a: ["GHSA-x"] }, fail: "detail" }).fetcher)([pkg("a")]);
    expect(r.ok && r.hits).toEqual([{ pkg: pkg("a"), ids: ["GHSA-x"] }]);
    expect(r.ok && r.details.size).toBe(0);
  });
});
