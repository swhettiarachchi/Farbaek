/**
 * Migration 30: custom domains for published sites. A domain is added as
 * pending, becomes verified only through the server's DNS check, and only
 * a verified domain maps to its site.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let site: string;
let otherSite: string;
const TOKEN = "a".repeat(32);

const asService = <T>(fn: () => Promise<T>) => as(db, "service_role", null, fn);
const asUser = <T>(uid: string, fn: () => Promise<T>) => as(db, "authenticated", uid, fn);
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => asService(async () => (await db.query<T>(sql, params)).rows);

const add = async (hostname: string, actor: string = USERS.alice, s = site) => (await q<{ id: string }>("select public.app_add_site_domain($1, $2, $3, $4) as id", [s, actor, hostname, TOKEN]))[0]!.id;
const mark = async (id: string, verified: boolean) => (await q<{ s: string }>("select public.app_mark_site_domain($1, $2, $3) as s", [id, USERS.alice, verified]))[0]!.s;
const nameFor = async (host: string) => (await q<{ n: string | null }>("select public.app_site_name_for_domain($1) as n", [host]))[0]!.n;

async function newSite(name: string): Promise<string> {
  const project = (await q<{ id: string }>("select public.app_create_project($1, $2, $3, null, null) as id", [org, USERS.alice, `Project ${name}`]))[0]!.id;
  return (await admin<{ id: string }>("insert into public.sites (org_id, project_id, name, created_by) values ($1, $2, $3, $4) returning id", [org, project, name, USERS.alice]))[0]!.id;
}

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  await createOrg(db, USERS.bob, "Bob Labs");
  site = await newSite("harbour-lane");
  otherSite = await newSite("second-site");
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("adding a domain", () => {
  it("adds it as pending and records it", async () => {
    const id = await add("www.example.com");
    const [row] = await admin<{ status: string; verified_at: string | null; hostname: string }>("select status, verified_at, hostname from public.site_domains where id = $1", [id]);
    expect(row).toEqual({ status: "pending", verified_at: null, hostname: "www.example.com" });
    const audit = await admin<{ action: string }>("select action from public.audit_events where org_id = $1 order by id desc limit 1", [org]);
    expect(audit[0]!.action).toBe("site.domain_added");
  });

  it("refuses a domain another site has, a third domain, bad names and Farbaek's own zones", async () => {
    await expect(add("www.example.com", USERS.alice, otherSite)).rejects.toThrow(/DOMAIN_TAKEN/);
    await add("shop.example.com");
    await expect(add("third.example.com")).rejects.toThrow(/DOMAIN_LIMIT/);
    for (const bad of ["Upper.Example.com", "nodot", "a..b.com", "evil.farbaek.si", "x.farbaek.com", "-x.example.com"]) {
      await expect(add(bad, USERS.alice, otherSite)).rejects.toThrow(/INVALID_DOMAIN/);
    }
  });

  it("is for contributors of the site's workspace, through the server only", async () => {
    await expect(add("bob.example.com", USERS.bob, otherSite)).rejects.toThrow(/FORBIDDEN/);
    await expect(asUser(USERS.alice, () => db.query("select public.app_add_site_domain($1, $2, 'x.example.com', $3)", [otherSite, USERS.alice, TOKEN]))).rejects.toThrow(/permission denied/);
    await expect(asUser(USERS.alice, () => db.query("update public.site_domains set status = 'verified'"))).rejects.toThrow(/permission denied/);
  });
});

describe("verifying and serving", () => {
  it("maps only a verified domain to its site, and stops when the records go", async () => {
    const [{ id }] = (await admin<{ id: string }>("select id from public.site_domains where hostname = 'www.example.com'")) as [{ id: string }];
    expect(await nameFor("www.example.com")).toBeNull();
    expect(await mark(id, true)).toBe("verified");
    expect(await nameFor("WWW.example.com")).toBe("harbour-lane");
    expect(await mark(id, false)).toBe("pending");
    expect(await nameFor("www.example.com")).toBeNull();
    const actions = (await admin<{ action: string }>("select action from public.audit_events where org_id = $1 and action like 'site.domain_%' order by id", [org])).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["site.domain_verified", "site.domain_unverified"]));
    await mark(id, true);
  });

  it("lets members read their own workspace's domains only", async () => {
    expect((await asUser(USERS.alice, () => db.query("select hostname from public.site_domains order by hostname"))).rows).toEqual([{ hostname: "shop.example.com" }, { hostname: "www.example.com" }]);
    expect((await asUser(USERS.bob, () => db.query("select hostname from public.site_domains"))).rows).toEqual([]);
  });

  it("removes a domain, records it, and lets the name be used again", async () => {
    const [{ id }] = (await admin<{ id: string }>("select id from public.site_domains where hostname = 'shop.example.com'")) as [{ id: string }];
    await q("select public.app_remove_site_domain($1, $2)", [id, USERS.alice]);
    expect(await admin("select 1 from public.site_domains where id = $1", [id])).toEqual([]);
    await expect(add("shop.example.com", USERS.alice, otherSite)).resolves.toMatch(/[0-9a-f-]{36}/);
  });

  it("goes with its site", async () => {
    await admin("delete from public.sites where id = $1", [site]);
    expect(await nameFor("www.example.com")).toBeNull();
    expect(await admin("select 1 from public.site_domains where hostname = 'www.example.com'")).toEqual([]);
  });
});
