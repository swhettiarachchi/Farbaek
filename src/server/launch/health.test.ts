import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { ProbeResult } from "@/core/launch/health";
import { runLiveCheck } from "./health";

const DEP = "00000000-0000-4000-8000-0000000000aa";
const SHA = "a".repeat(64);
const site = { id: "00000000-0000-4000-8000-0000000000bb", name: "sunrise-bakery" };

function fakeAdmin(error: string | null = null) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const admin = { rpc: async (fn: string, args: Record<string, unknown>) => (calls.push({ fn, args }), { data: 1, error: error ? { message: error } : null }) } as unknown as SupabaseClient;
  return { admin, calls };
}
const live: ProbeResult = { status: 200, ms: 120, deploymentHeader: DEP, etag: `"${SHA}"` };

describe("running a live check", () => {
  it("fetches only the site's own address and records the verdict", async () => {
    const { admin, calls } = fakeAdmin();
    const urls: string[] = [];
    const r = await runLiveCheck({ admin, actor: "u1", domain: "farbaek.si", site, deploymentId: DEP, indexSha256: SHA }, async (url) => (urls.push(url), live));
    expect(r).toMatchObject({ ok: true, result: { verdict: "live", status: 200 } });
    expect(urls).toEqual(["https://sunrise-bakery.farbaek.si/"]);
    expect(calls).toEqual([
      { fn: "app_record_site_health", args: { p_actor: "u1", p_site: site.id, p_deployment: DEP, p_verdict: "live", p_status: 200, p_ms: 120, p_detail: "Answered 200 in 120 ms with exactly these files." } },
    ]);
  });

  it("checks nothing without a site domain, and says so", async () => {
    const { admin, calls } = fakeAdmin();
    let fetched = false;
    const r = await runLiveCheck({ admin, actor: "u1", domain: null, site, deploymentId: DEP, indexSha256: SHA }, async () => ((fetched = true), live));
    expect(r).toMatchObject({ ok: false, reason: "no_domain" });
    expect(fetched).toBe(false);
    expect(calls).toEqual([]);
  });

  it("passes on the database's limit and refusals as plain messages", async () => {
    expect(await runLiveCheck({ admin: fakeAdmin("CHECK_LIMIT").admin, actor: "u1", domain: "farbaek.si", site, deploymentId: DEP, indexSha256: SHA }, async () => live)).toMatchObject({ ok: false, reason: "limit" });
    expect(await runLiveCheck({ admin: fakeAdmin("NOT_FOUND").admin, actor: "u1", domain: "farbaek.si", site, deploymentId: DEP, indexSha256: SHA }, async () => live)).toMatchObject({ ok: false, reason: "not_found" });
  });
});
