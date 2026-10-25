/**
 * Migration v50: outcome watch (ADR 0080). Contributors turn it on; two
 * failed checks in a row mean down, the next good one means back up, each
 * returned once; nothing live leaves the state alone; 24 results are kept.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let project: string;
const asService = <T>(fn: () => Promise<T>) => as(db, "service_role", null, fn);
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => asService(async () => (await db.query<T>(sql, params)).rows);
const record = async (ok: boolean | null, detail = "") => (await q<{ r: string | null }>("select public.app_record_watch_result($1, $2, $3) as r", [project, ok, detail]))[0]!.r;
const watch = async () => (await admin<{ state: string; failures: number; breached_at: string | null; history: { ok: boolean }[]; last_detail: string | null }>("select state, failures, breached_at, history, last_detail from public.outcome_watches where project_id = $1", [project]))[0];

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  await createOrg(db, USERS.bob, "Bob Labs");
  project = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Storefront', null, null) as id", [org, USERS.alice]))[0]!.id;
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("outcome watch", () => {
  it("is turned on by people in the workspace only", async () => {
    await expect(q("select public.app_set_outcome_watch($1, $2, $3, true)", [org, USERS.bob, project])).rejects.toThrow(/NOT_A_MEMBER|FORBIDDEN|NOT_FOUND/);
    await q("select public.app_set_outcome_watch($1, $2, $3, true)", [org, USERS.alice, project]);
    expect(await watch()).toMatchObject({ state: "unknown", failures: 0 });
  });

  it("calls it down after two failed checks in a row, once, and back up on the next good one", async () => {
    expect(await record(true, "Answering.")).toBeNull();
    expect(await record(false, "Not answering.")).toBeNull();
    expect(await watch()).toMatchObject({ state: "ok", failures: 1 });
    expect(await record(false, "Not answering.")).toBe("down");
    expect((await watch())!.breached_at).not.toBeNull();
    expect(await record(false, "Still not answering.")).toBeNull();
    expect(await record(true, "Answering.")).toBe("recovered");
    expect(await watch()).toMatchObject({ state: "ok", failures: 0, breached_at: null });
    expect((await admin<{ action: string }>("select action from public.audit_events where action like 'watch.%' order by id")).map((r) => r.action)).toEqual(["watch.on", "watch.down", "watch.recovered"]);
  });

  it("leaves the state alone when nothing is live, and keeps the last 24 results", async () => {
    expect(await record(null, "Nothing is live to check yet.")).toBeNull();
    expect(await watch()).toMatchObject({ state: "ok", last_detail: "Nothing is live to check yet." });
    for (let i = 0; i < 30; i++) await record(true);
    expect((await watch())!.history).toHaveLength(24);
  });

  it("lets members read it, nobody write it directly, and goes when turned off", async () => {
    expect((await as(db, "authenticated", USERS.alice, () => db.query("select state from public.outcome_watches"))).rows).toHaveLength(1);
    expect((await as(db, "authenticated", USERS.bob, () => db.query("select state from public.outcome_watches"))).rows).toEqual([]);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("update public.outcome_watches set state = 'ok'"))).rejects.toThrow(/permission denied/);
    await q("select public.app_set_outcome_watch($1, $2, $3, false)", [org, USERS.alice, project]);
    expect(await watch()).toBeUndefined();
    expect(await record(false)).toBeNull();
  });
});
