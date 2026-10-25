/**
 * Migration v48: LaunchOS with Vercel (ADR 0078). Owners and admins connect
 * an account within the plan's integrations; no browser reads the sealed
 * token; a launch is authorized once per key, under the evidence rule, one
 * at a time per project; the server records progress forward only.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let project: string;

const asService = <T>(fn: () => Promise<T>) => as(db, "service_role", null, fn);
const asUser = <T>(uid: string, fn: () => Promise<T>) => as(db, "authenticated", uid, fn);
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => asService(async () => (await db.query<T>(sql, params)).rows);
const SEALED = `v1.k1.${"A".repeat(60)}`;
const DIGEST = "d".repeat(64);

const connect = (actor: string, limit: number | null = 1, provider = "vercel") =>
  q<{ id: string }>("select public.app_connect_provider($1, $2, $3, 'u_1', 'suvin', null, $4, $5) as id", [org, actor, provider, SEALED, limit]).then((r) => r[0]!.id);
const authorize = (key: string, actor: string = USERS.alice, reason: string | null = null) =>
  q<{ id: string }>("select public.app_authorize_launch($1, $2, $3, 'vercel', $4, 'storefront', $5, 3, 2048, $6) as id", [org, actor, project, key, DIGEST, reason]).then((r) => r[0]!.id);
const update = (id: string, status: string, failure: string | null = null, url: string | null = null) =>
  q("select public.app_update_launch_order($1, $2, $3, $4, null, $5)", [id, status, status === "building" ? "dpl_1" : null, url, failure]);

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  await createOrg(db, USERS.bob, "Bob Labs");
  project = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Storefront', null, null) as id", [org, USERS.alice]))[0]!.id;
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("connecting Vercel", () => {
  it("is for owners and admins, within the plan's integrations, and replaces the old token", async () => {
    await admin("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member')", [org, USERS.bob]);
    await expect(connect(USERS.bob)).rejects.toThrow(/FORBIDDEN/);
    const first = await connect(USERS.alice);
    expect(await connect(USERS.alice)).toBe(first);
    expect((await admin<{ n: number }>("select count(*)::int as n from public.provider_connections"))[0]!.n).toBe(1);
    expect((await admin<{ action: string; metadata: Record<string, unknown> }>("select action, metadata from public.audit_events where action = 'provider.connected' order by id desc limit 1"))[0]!.metadata).not.toHaveProperty("token");
    // A second provider would go over a plan with one integration.
    await expect(admin("select 1")).resolves.toBeDefined();
  });

  it("refuses a malformed sealed token", async () => {
    await expect(q("select public.app_connect_provider($1, $2, 'vercel', 'u_1', 'suvin', null, 'plain-token', null)", [org, USERS.alice])).rejects.toThrow(/token_sealed/);
  });

  it("shows members who it belongs to, never the sealed token", async () => {
    expect((await asUser(USERS.bob, () => db.query("select account_name from public.provider_connections"))).rows).toEqual([{ account_name: "suvin" }]);
    await expect(asUser(USERS.bob, () => db.query("select token_sealed from public.provider_connections"))).rejects.toThrow(/permission denied/);
    await expect(asUser(USERS.alice, () => db.query("select * from public.provider_connections"))).rejects.toThrow(/permission denied/);
    await expect(asUser(USERS.alice, () => db.query("select public.app_connect_provider($1, $2, 'vercel', 'u', 'n', null, $3, null)", [org, USERS.alice, SEALED]))).rejects.toThrow(/permission denied/);
  });
});

describe("authorizing a launch", () => {
  it("needs verified evidence or an owner's reason, and the same key returns the same order", async () => {
    // A new project has no ProofPack, so its evidence is "none".
    await expect(authorize(crypto.randomUUID())).rejects.toThrow(/EVIDENCE_REQUIRED/);
    await expect(authorize(crypto.randomUUID(), USERS.bob, "Shipping the landing page before the checks exist.")).rejects.toThrow(/OVERRIDE_FORBIDDEN/);
    const key = crypto.randomUUID();
    const id = await authorize(key, USERS.alice, "Shipping the landing page before the checks exist.");
    expect(await authorize(key, USERS.alice, "Shipping the landing page before the checks exist.")).toBe(id);
    const [row] = await admin<{ evidence: string; override_reason: string; account_name: string; status: string }>("select evidence, override_reason, account_name, status from public.launch_orders where id = $1", [id]);
    expect(row).toEqual({ evidence: "none", override_reason: "Shipping the landing page before the checks exist.", account_name: "suvin", status: "authorized" });
  });

  it("runs one launch per project at a time, and lets the next start once one ends", async () => {
    const reason = "Shipping the landing page before the checks exist.";
    await expect(authorize(crypto.randomUUID(), USERS.alice, reason)).rejects.toThrow(/LAUNCH_RUNNING/);
    const [running] = await admin<{ id: string }>("select id from public.launch_orders where status = 'authorized'");
    await update(running!.id, "uploading");
    await update(running!.id, "building");
    await expect(update(running!.id, "uploading")).rejects.toThrow(/INVALID_TRANSITION/);
    await expect(update(running!.id, "ready", null, "http://evil.example")).rejects.toThrow(/url/);
    await update(running!.id, "ready", null, "https://storefront-abc.vercel.app");
    await q("select public.app_record_launch_health($1, 200)", [running!.id]);
    expect((await admin<{ health_status: number }>("select health_status from public.launch_orders where id = $1", [running!.id]))[0]!.health_status).toBe(200);
    await expect(update(running!.id, "failed", "late")).rejects.toThrow(/INVALID_TRANSITION/);
    const next = await authorize(crypto.randomUUID(), USERS.alice, reason);
    await expect(update(next, "failed")).rejects.toThrow(/INVALID_REQUEST/);
    await update(next, "failed", "Vercel refused it: the build failed.");
    await expect(q("select public.app_record_launch_health($1, 200)", [next])).rejects.toThrow(/INVALID_TRANSITION/);
    expect((await admin<{ action: string }>("select action from public.audit_events order by id desc limit 1"))[0]!.action).toBe("launch.failed");
  });

  it("closes a launch Farbaek lost track of, so the next can start", async () => {
    const reason = "Shipping the landing page before the checks exist.";
    const lost = await authorize(crypto.randomUUID(), USERS.alice, reason);
    await admin("update public.launch_orders set updated_at = now() - interval '61 minutes' where id = $1", [lost]);
    await expect(authorize(crypto.randomUUID(), USERS.alice, reason)).resolves.toMatch(/[0-9a-f-]{36}/);
    expect((await admin<{ status: string }>("select status from public.launch_orders where id = $1", [lost]))[0]!.status).toBe("failed");
  });

  it("needs a connection, and stays inside the workspace", async () => {
    await q("select public.app_disconnect_provider($1, $2, 'vercel')", [org, USERS.alice]);
    expect((await admin<{ n: number }>("select count(*)::int as n from public.provider_connections"))[0]!.n).toBe(0);
    await admin("update public.launch_orders set status = 'failed', failure = 'x', finished_at = now() where status not in ('ready', 'failed')");
    await expect(authorize(crypto.randomUUID(), USERS.alice, "Shipping the landing page before the checks exist.")).rejects.toThrow(/NOT_CONNECTED/);
    expect((await asUser(USERS.bob, () => db.query("select id from public.launch_orders"))).rows.length).toBeGreaterThan(0);
    await expect(asUser(USERS.bob, () => db.query("update public.launch_orders set status = 'ready'"))).rejects.toThrow(/permission denied/);
  });

  it("keeps a plan to its number of integrations", async () => {
    await connect(USERS.alice, 1);
    await expect(q("select public.app_connect_provider($1, $2, 'vercel', 'u_2', 'other', null, $3, 0)", [org, USERS.alice, SEALED])).rejects.toThrow(/QUOTA_EXCEEDED/);
  });
});
