import { describe, expect, it } from "vitest";
import { addSiteDomain, checkSiteDomain, tlsAllowed, type DomainDeps, type SiteDomainView } from "./domains";
import type { SiteForServing } from "./store";

const TOKEN = "t".repeat(32);
const TARGET = { cname: "sites.farbaek.si", ip: "203.0.113.7" };

function fakeDeps(over: { dns?: Partial<Record<"txt" | "cname" | "a", string[] | Error>>; domain?: Partial<SiteDomainView>; canChange?: boolean; target?: DomainDeps["target"]; addError?: string } = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the spy records inputs of several shapes
  const calls: { name: string; input: any }[] = [];
  const answer = (k: "txt" | "cname" | "a") => async () => {
    const v = over.dns?.[k] ?? [];
    if (v instanceof Error) throw v;
    return v;
  };
  const deps: DomainDeps = {
    canChange: async () => over.canChange ?? true,
    target: over.target === undefined ? TARGET : over.target,
    reserved: ["farbaek.com", "farbaek.si"],
    add: async (input) => (calls.push({ name: "add", input }), over.addError ? { ok: false, error: over.addError } : { ok: true, value: "dom-1" }),
    mark: async (input) => (calls.push({ name: "mark", input }), { ok: true, value: input.verified ? "verified" : "pending" }),
    remove: async (input) => (calls.push({ name: "remove", input }), { ok: true, value: null }),
    load: async () => ({ id: "dom-1", siteId: "s1", hostname: "www.example.com", status: "pending", verifyToken: TOKEN, verifiedAt: null, checkedAt: null, ...over.domain }),
    dns: { txt: answer("txt"), cname: answer("cname"), a: answer("a") },
    token: () => TOKEN,
    now: () => new Date("2026-10-23T10:00:00Z"),
  };
  return { deps, calls };
}

const base = { orgId: "o1", userId: "u1" };

describe("addSiteDomain", () => {
  it("adds the domain as people typed it, cleaned up, with a fresh token", async () => {
    const { deps, calls } = fakeDeps();
    expect(await addSiteDomain(deps, { ...base, siteId: "s1", domain: "https://WWW.Example.com/" })).toEqual({ ok: true, value: { id: "dom-1", hostname: "www.example.com" } });
    expect(calls[0]!.input).toEqual({ siteId: "s1", actor: "u1", hostname: "www.example.com", token: TOKEN });
  });

  it("explains bad names, Farbaek's own zones, a root domain with no server address, and database refusals", async () => {
    expect(await addSiteDomain(fakeDeps().deps, { ...base, siteId: "s1", domain: "shop.farbaek.si" })).toMatchObject({ ok: false, message: expect.stringMatching(/belongs to Farbaek/) });
    expect(await addSiteDomain(fakeDeps({ target: { ...TARGET, ip: null } }).deps, { ...base, siteId: "s1", domain: "example.com" })).toMatchObject({ ok: false, message: expect.stringMatching(/subdomain/) });
    expect(await addSiteDomain(fakeDeps({ addError: "DOMAIN_TAKEN" }).deps, { ...base, siteId: "s1", domain: "www.example.com" })).toMatchObject({ ok: false, message: expect.stringMatching(/already connected/) });
    expect(await addSiteDomain(fakeDeps({ canChange: false }).deps, { ...base, siteId: "s1", domain: "www.example.com" })).toMatchObject({ ok: false, message: expect.stringMatching(/role/) });
    expect(await addSiteDomain(fakeDeps({ target: null }).deps, { ...base, siteId: "s1", domain: "www.example.com" })).toMatchObject({ ok: false, message: expect.stringMatching(/aren't connected/) });
  });
});

describe("checkSiteDomain", () => {
  it("marks the domain verified when both records are in place", async () => {
    const { deps, calls } = fakeDeps({ dns: { txt: [`farbaek-verify=${TOKEN}`], cname: ["sites.farbaek.si"] } });
    expect(await checkSiteDomain(deps, { ...base, domainId: "dom-1" })).toMatchObject({ ok: true, value: { verified: true } });
    expect(calls).toEqual([{ name: "mark", input: { domainId: "dom-1", actor: "u1", verified: true } }]);
  });

  it("records a failed check and says what's missing", async () => {
    const { deps, calls } = fakeDeps({ dns: { cname: ["sites.farbaek.si"] } });
    expect(await checkSiteDomain(deps, { ...base, domainId: "dom-1" })).toMatchObject({ ok: true, value: { verified: false, message: expect.stringMatching(/TXT record at _farbaek\.www\.example\.com/) } });
    expect(calls[0]!.input.verified).toBe(false);
  });

  it("changes nothing when DNS doesn't answer, and limits checks to one every few seconds", async () => {
    const slow = fakeDeps({ dns: { txt: new Error("ETIMEOUT") } });
    expect(await checkSiteDomain(slow.deps, { ...base, domainId: "dom-1" })).toMatchObject({ ok: false, message: expect.stringMatching(/didn't answer/) });
    expect(slow.calls).toEqual([]);
    const recent = fakeDeps({ domain: { checkedAt: "2026-10-23T09:59:55Z" } });
    expect(await checkSiteDomain(recent.deps, { ...base, domainId: "dom-1" })).toMatchObject({ ok: false, message: expect.stringMatching(/a moment ago/) });
  });
});

describe("tlsAllowed", () => {
  const live: SiteForServing = { state: "live", deploymentId: "d1", projectId: "p1", files: [] };
  const deps = (sites: Record<string, SiteForServing>, domains: Record<string, string>) => ({
    domain: "farbaek.si",
    liveSite: async (name: string) => sites[name] ?? { state: "none" as const },
    nameForDomain: async (host: string) => domains[host] ?? null,
  });

  it("allows a live site's name and a verified domain whose site is live", async () => {
    const d = deps({ "harbour-lane": live, paused: { state: "paused" } }, { "www.example.com": "harbour-lane", "old.example.com": "paused" });
    expect(await tlsAllowed("harbour-lane.farbaek.si", d)).toBe(true);
    expect(await tlsAllowed("WWW.example.com.", d)).toBe(true);
    expect(await tlsAllowed("old.example.com", d)).toBe(false);
  });

  it("refuses preview names, unknown names, unverified domains and junk", async () => {
    const d = deps({ "harbour-lane": live }, {});
    expect(await tlsAllowed("p-abcdefghijklmnopqrstuvwxyz.farbaek.si", d)).toBe(false);
    expect(await tlsAllowed("nobody.farbaek.si", d)).toBe(false);
    expect(await tlsAllowed("www.example.com", d)).toBe(false);
    expect(await tlsAllowed("bad host!", d)).toBe(false);
    expect(await tlsAllowed("", d)).toBe(false);
  });
});
