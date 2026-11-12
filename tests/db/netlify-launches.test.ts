/**
 * Migration v59: LaunchOS with Netlify (ADR 0093). Netlify connects and
 * launches through the same functions as Vercel; an order's address and its
 * link to the provider stay on that provider's own domain; a lost launch
 * says which provider to look at; Netlify counts as one more integration.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let project: string;

const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const SEALED = `v1.k1.${"A".repeat(60)}`;
const DIGEST = "d".repeat(64);
const REASON = "Shipping the landing page before the checks exist.";

const connect = (provider: string, limit: number | null = null) =>
  q<{ id: string }>("select public.app_connect_provider($1, $2, $3, 'acc_1', 'Suvin', null, $4, $5) as id", [org, USERS.alice, provider, SEALED, limit]).then((r) => r[0]!.id);
const authorize = (provider: string) =>
  q<{ id: string }>("select public.app_authorize_launch($1, $2, $3, $4, $5, 'storefront', $6, 3, 2048, $7) as id", [org, USERS.alice, project, provider, crypto.randomUUID(), DIGEST, REASON]).then((r) => r[0]!.id);
const update = (id: string, status: string, url: string | null = null, inspector: string | null = null, failure: string | null = null) =>
  q("select public.app_update_launch_order($1, $2, 'dep_1', $3, $4, $5)", [id, status, url, inspector, failure]);
const finishRunning = () => admin("update public.launch_orders set status = 'failed', failure = 'x', finished_at = now() where status not in ('ready', 'failed')");

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  project = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Storefront', null, null) as id", [org, USERS.alice]))[0]!.id;
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("Netlify launches", () => {
  it("connects and launches through the same functions as Vercel, and nothing else is a provider", async () => {
    await connect("netlify");
    const id = await authorize("netlify");
    await update(id, "uploading");
    await update(id, "building", null, "https://app.netlify.com/sites/storefront/deploys/dep_1");
    await update(id, "ready", "https://storefront.netlify.app");
    expect((await admin<{ provider: string; status: string; url: string }>("select provider, status, url from public.launch_orders where id = $1", [id]))[0]).toEqual({ provider: "netlify", status: "ready", url: "https://storefront.netlify.app" });
    await expect(connect("heroku")).rejects.toThrow(/provider_connections_provider_check/);
    const next = await authorize("netlify");
    await expect(admin("update public.launch_orders set provider = 'heroku' where id = $1", [next])).rejects.toThrow(/launch_orders_provider_check/);
    await finishRunning();
  });

  it("keeps each order's address and link on its own provider's domain", async () => {
    const id = await authorize("netlify");
    await expect(update(id, "building", "https://storefront.vercel.app")).rejects.toThrow(/launch_orders_url_check/);
    await expect(update(id, "building", "https://storefront.netlify.app.evil.example")).rejects.toThrow(/launch_orders_url_check/);
    await expect(update(id, "building", "http://storefront.netlify.app")).rejects.toThrow(/launch_orders_url_check/);
    await expect(update(id, "building", null, "https://vercel.com/suvin/storefront")).rejects.toThrow(/launch_orders_inspector_url_check/);
    await expect(update(id, "building", null, "https://app.netlify.com.evil.example/")).rejects.toThrow(/launch_orders_inspector_url_check/);
    // A deploy's own permanent address is on netlify.app too.
    await update(id, "ready", "https://6720aa--storefront.netlify.app");
    await finishRunning();

    await connect("vercel");
    const vercel = await authorize("vercel");
    await expect(update(vercel, "building", "https://storefront.netlify.app")).rejects.toThrow(/launch_orders_url_check/);
    await expect(update(vercel, "building", null, "https://app.netlify.com/sites/storefront")).rejects.toThrow(/launch_orders_inspector_url_check/);
    await update(vercel, "ready", "https://storefront-abc.vercel.app", "https://vercel.com/suvin/storefront/dpl_1");
  });

  it("names the provider when Farbaek lost track of a launch", async () => {
    const lost = await authorize("netlify");
    await admin("update public.launch_orders set updated_at = now() - interval '61 minutes' where id = $1", [lost]);
    await authorize("vercel");
    expect((await admin<{ status: string; failure: string }>("select status, failure from public.launch_orders where id = $1", [lost]))[0]).toEqual({
      status: "failed",
      failure: "Farbaek lost track of this launch. Check its state in Netlify, then launch again if needed.",
    });
    await finishRunning();
  });

  it("counts Netlify as one more integration", async () => {
    await q("select public.app_disconnect_provider($1, $2, 'netlify')", [org, USERS.alice]);
    // Vercel is connected, so a plan with one integration has none left for Netlify.
    await expect(connect("netlify", 1)).rejects.toThrow(/QUOTA_EXCEEDED/);
    await connect("netlify", 2);
    expect((await admin<{ provider: string }>("select provider from public.provider_connections order by provider")).map((r) => r.provider)).toEqual(["netlify", "vercel"]);
  });
});
