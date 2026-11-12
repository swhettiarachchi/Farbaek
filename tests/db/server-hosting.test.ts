/**
 * Migration v92: Render, Railway and Fly.io behind the same connections and
 * launch orders (ADR 0191). Each order's address and dashboard link stay on
 * its own provider's domain, and a repository launch records the commit it
 * built from, so the next one moves the launch branch only from there.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let project: string;
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const H = (c: string) => c.repeat(64);
const SEALED = `v1.k1.${"A".repeat(60)}`;

async function order(provider: string, target: string) {
  await db.query("update public.launch_orders set status = 'failed', failure = 'x', finished_at = now() where project_id = $1 and status not in ('ready', 'failed')", [project]);
  return (
    await q<{ id: string }>("select public.app_authorize_launch($1, $2, $3, $4, $5, $6, $7, 1, 10, 'Trying the new hosts out here.') as id", [org, USERS.alice, project, provider, crypto.randomUUID(), target, H("d")])
  )[0]!.id;
}
const update = (id: string, url: string | null, inspector: string | null) => q("select public.app_update_launch_order($1, 'building', 'dep_1', $2, $3, null)", [id, url, inspector]);

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  project = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Fieldnote', null, null) as id", [org, USERS.alice]))[0]!.id;
  for (const p of ["render", "railway", "flyio"]) {
    await q("select public.app_connect_provider($1, $2, $3, 'acc_1', 'Alice', null, $4, null)", [org, USERS.alice, p, SEALED]);
  }
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("server hosts in launch orders", () => {
  it("keeps each host's address and dashboard link on its own domain", async () => {
    const cases: [string, string, string, string[]][] = [
      ["render", "https://fieldnote.onrender.com", "https://dashboard.render.com/web/srv-1", ["https://fieldnote.up.railway.app", "https://fieldnote.onrender.com.evil.example"]],
      ["railway", "https://fieldnote-production.up.railway.app", "https://railway.com/project/1", ["https://fieldnote.fly.dev", "http://fieldnote-production.up.railway.app"]],
      ["flyio", "https://fieldnote.fly.dev", "https://fly.io/apps/fieldnote", ["https://fieldnote.onrender.com", "https://fly.dev"]],
    ];
    for (const [provider, good, inspector, bad] of cases) {
      const id = await order(provider, "fieldnote");
      for (const url of bad) await expect(update(id, url, null)).rejects.toThrow(/launch_orders_url_check/);
      await expect(update(id, null, "https://vercel.com/x")).rejects.toThrow(/launch_orders_inspector_url_check/);
      await update(id, good, inspector);
    }
  });

  it("records the commit a repository launch built from, and finds it for the next one", async () => {
    const id = await order("render", "fieldnote");
    await q("select public.app_record_launch_commit($1, $2)", [id, "a".repeat(40)]);
    expect((await q<{ c: string[] }>("select public.app_recent_launch_commits($1) as c", [project]))[0]!.c).toEqual(["a".repeat(40)]);
    const second = await order("railway", "fieldnote");
    await q("select public.app_record_launch_commit($1, $2)", [second, "e".repeat(40)]);
    expect((await q<{ c: string[] }>("select public.app_recent_launch_commits($1) as c", [project]))[0]!.c).toEqual(["e".repeat(40), "a".repeat(40)]);
    await expect(q("select public.app_record_launch_commit($1, 'not-a-sha')", [second])).rejects.toThrow(/commit_sha_check/);
    // A Fly.io launch has no commit.
    const fly = await order("flyio", "fieldnote");
    await expect(q("select public.app_record_launch_commit($1, $2)", [fly, "b".repeat(40)])).rejects.toThrow(/NOT_FOUND/);
  });

  it("names the host when it closes a lost launch, and keeps the new functions from browsers", async () => {
    const id = await order("railway", "fieldnote");
    await db.query("update public.launch_orders set updated_at = now() - interval '2 hours' where id = $1", [id]);
    await db.query("select private.close_stale_launches($1)", [project]);
    expect((await q<{ failure: string }>("select failure from public.launch_orders where id = $1", [id]))[0]!.failure).toMatch(/in Railway/);
    for (const role of ["anon", "authenticated"] as const) {
      await expect(as(db, role, role === "anon" ? null : USERS.alice, () => db.query("select public.app_recent_launch_commits($1)", [project]))).rejects.toThrow(/permission denied/);
    }
  });
});
