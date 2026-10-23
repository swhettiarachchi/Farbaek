import { describe, expect, it } from "vitest";
import { checkDomainRecords, dnsRecordsFor, isApex, normalizeDomain } from "./domains";

const RESERVED = ["farbaek.com", "farbaek.si"];
const TARGET = { cname: "sites.farbaek.si", ip: "203.0.113.7" };
const TOKEN = "k".repeat(32);

describe("normalizeDomain", () => {
  it("takes a domain as people type it", () => {
    expect(normalizeDomain("  https://WWW.Example.com/shop?x=1 ", RESERVED)).toEqual({ ok: true, hostname: "www.example.com" });
    expect(normalizeDomain("shop.example.co.uk.", RESERVED)).toEqual({ ok: true, hostname: "shop.example.co.uk" });
    expect(normalizeDomain("example.com:443", RESERVED)).toEqual({ ok: true, hostname: "example.com" });
  });

  it("turns an international name into its ASCII form", () => {
    expect(normalizeDomain("bücher.example", RESERVED)).toEqual({ ok: true, hostname: "xn--bcher-kva.example" });
  });

  it("refuses empty input, IPs, single labels, bad characters and Farbaek's own zones", () => {
    expect(normalizeDomain(" ", RESERVED)).toEqual({ ok: false, problem: "empty" });
    expect(normalizeDomain("203.0.113.7", RESERVED)).toEqual({ ok: false, problem: "ip" });
    expect(normalizeDomain("[::1]", RESERVED)).toEqual({ ok: false, problem: "ip" });
    expect(normalizeDomain("localhost", RESERVED)).toEqual({ ok: false, problem: "single_label" });
    expect(normalizeDomain("bad_name.example.com", RESERVED)).toEqual({ ok: false, problem: "invalid" });
    expect(normalizeDomain("user@example.com", RESERVED)).toEqual({ ok: false, problem: "invalid" });
    expect(normalizeDomain("-x.example.com", RESERVED)).toEqual({ ok: false, problem: "invalid" });
    expect(normalizeDomain("shop.farbaek.si", RESERVED)).toEqual({ ok: false, problem: "ours" });
    expect(normalizeDomain("farbaek.com", RESERVED)).toEqual({ ok: false, problem: "ours" });
    expect(normalizeDomain("notfarbaek.com", RESERVED)).toEqual({ ok: true, hostname: "notfarbaek.com" });
  });
});

describe("dnsRecordsFor", () => {
  it("asks a subdomain for a CNAME and a TXT record", () => {
    expect(dnsRecordsFor("www.example.com", TOKEN, TARGET)).toEqual([
      { type: "CNAME", name: "www.example.com", value: "sites.farbaek.si", purpose: expect.any(String) },
      { type: "TXT", name: "_farbaek.www.example.com", value: `farbaek-verify=${TOKEN}`, purpose: expect.any(String) },
    ]);
  });

  it("asks an apex for an A record, or nothing when the server's address isn't configured", () => {
    expect(isApex("example.com")).toBe(true);
    expect(dnsRecordsFor("example.com", TOKEN, TARGET)?.[0]).toMatchObject({ type: "A", value: "203.0.113.7" });
    expect(dnsRecordsFor("example.com", TOKEN, { ...TARGET, ip: null })).toBeNull();
  });
});

describe("checkDomainRecords", () => {
  const txt = [`farbaek-verify=${TOKEN}`];

  it("passes a subdomain with its CNAME, or flattened to the server's address", () => {
    expect(checkDomainRecords("www.example.com", TOKEN, TARGET, { txt, cname: ["sites.farbaek.si."], a: [] })).toEqual({ ok: true });
    expect(checkDomainRecords("www.example.com", TOKEN, TARGET, { txt, cname: [], a: ["203.0.113.7"] })).toEqual({ ok: true });
  });

  it("passes an apex only with the A record", () => {
    expect(checkDomainRecords("example.com", TOKEN, TARGET, { txt, cname: [], a: ["198.51.100.1", "203.0.113.7"] })).toEqual({ ok: true });
    expect(checkDomainRecords("example.com", TOKEN, TARGET, { txt, cname: ["sites.farbaek.si"], a: [] })).toMatchObject({ ok: false, missing: ["target"] });
  });

  it("says what's missing in words", () => {
    const r = checkDomainRecords("www.example.com", TOKEN, TARGET, { txt: ["farbaek-verify=wrong"], cname: ["elsewhere.example.net"], a: [] });
    expect(r).toEqual({
      ok: false,
      missing: ["txt", "target"],
      message: "Not verified: the TXT record at _farbaek.www.example.com isn't there yet, and www.example.com doesn't point at Farbaek yet. DNS changes can take up to an hour to show; check again then.",
    });
  });
});
