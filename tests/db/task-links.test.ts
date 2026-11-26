/**
 * Migration v109: a link that starts a scheduled task from another app (stage 277, ADR 0284). Only the secret's hash is kept; a
 * task has one live link; a call queues one run as "Run now" does, and what the caller sent is that run's and no other's; the wrong
 * secret, a stopped link and no link at all are answered alike. SYNTHETIC values.
 */
import type { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let otherOrg: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const su = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const SCHEDULE = JSON.stringify({ repeat: { kind: "daily", time: "09:00" }, timeZone: "Asia/Colombo", end: { kind: "never" } });
const OPTIONS = JSON.stringify({ web: true, effort: "balanced", notify: true });
const hash = (secret: string) => createHash("sha256").update(secret).digest("hex");
const FAR = "2030-01-01T00:00:00Z";

const task = (actor: string = USERS.alice, orgId: string = org) =>
  q<{ id: string }>("select id from public.app_scheduled_task_save($1, $2, null, null, 'Morning news', 'Research the news.', $3::jsonb, $4::jsonb, $5, 9)", [orgId, actor, SCHEDULE, OPTIONS, FAR]).then((r) => r[0]!.id);
const create = (taskId: string, secret: string, o: { actor?: string; orgId?: string; wait?: number } = {}) =>
  q<{ id: string }>("select public.app_scheduled_link_create($1, $2, $3, $4, $5) as id", [o.orgId ?? org, o.actor ?? USERS.alice, taskId, hash(secret), o.wait ?? 60]).then((r) => r[0]!.id);
const fire = (link: string, secret: string, payload: string | null = null, minSeconds = 0) => q<{ s: string }>("select public.app_scheduled_link_fire($1, $2, $3, $4) as s", [link, hash(secret), payload, minSeconds]).then((r) => r[0]!.s);
/** Lets the link be used again at once: the wait between runs has its own test. */
const rested = (link: string) => su("update public.scheduled_task_links set last_used_at = null where id = $1", [link]);
const claim = () => q<{ run_id: string; task_id: string; attempt: number; manual: boolean }>("select * from public.app_scheduled_claim(5)");
const finish = (run: string, attempt: number, status: string, o: { retry?: string | null; next?: string | null } = {}) =>
  q("select public.app_scheduled_run_finish($1, $2, $3, null, null, null, $4, $5, null, $6)", [run, attempt, status, o.retry ? null : (o.next ?? FAR), o.retry ?? null, status === "done" ? 0 : 1]);
const payload = (run: string) => q<{ p: string | null }>("select public.app_scheduled_run_payload($1) as p", [run]).then((r) => r[0]!.p);
const waiting = (taskId: string) => su<{ link_payload: string | null; due: boolean }>("select link_payload, link_due is not null as due from public.scheduled_tasks where id = $1", [taskId]).then((r) => r[0]!);
const runRow = (run: string) => su<{ from_link: boolean; payload: string | null }>("select from_link, payload from public.scheduled_task_runs where id = $1", [run]).then((r) => r[0]!);
const clear = async () => {
  await su("delete from public.scheduled_tasks");
};

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  otherOrg = await createOrg(db, USERS.bob, "Bob Studio");
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("a task's link", () => {
  it("is made by the task's owner, kept as a hash, and read by them without it", async () => {
    await clear();
    const t = await task();
    const link = await create(t, "secret-one", { wait: 900 });
    expect(await su("select secret_hash, min_seconds, revoked_at, uses from public.scheduled_task_links where id = $1", [link])).toEqual([{ secret_hash: hash("secret-one"), min_seconds: 900, revoked_at: null, uses: 0 }]);
    const mine = await as(db, "authenticated", USERS.alice, async () => (await db.query("select id, task_id, min_seconds, uses, last_used_at, revoked_at from public.scheduled_task_links where id = $1", [link])).rows);
    expect(mine).toEqual([{ id: link, task_id: t, min_seconds: 900, uses: 0, last_used_at: null, revoked_at: null }]);
    // Its hash is nobody's to read from the browser, not even its owner's; nobody else reads the link at all.
    await expect(as(db, "authenticated", USERS.alice, async () => db.query("select secret_hash from public.scheduled_task_links where id = $1", [link]))).rejects.toThrow();
    await expect(as(db, "authenticated", USERS.alice, async () => db.query("select * from public.scheduled_task_links where id = $1", [link]))).rejects.toThrow();
    expect(await as(db, "authenticated", USERS.bob, async () => (await db.query("select id from public.scheduled_task_links where id = $1", [link])).rows)).toEqual([]);
    await expect(as(db, "anon", null, async () => db.query("select id from public.scheduled_task_links"))).rejects.toThrow();
  });

  it("is written by nobody but the server's functions", async () => {
    await clear();
    const t = await task();
    const link = await create(t, "secret-one");
    await expect(as(db, "authenticated", USERS.alice, async () => db.query("update public.scheduled_task_links set revoked_at = null where id = $1", [link]))).rejects.toThrow();
    await expect(as(db, "authenticated", USERS.alice, async () => db.query("delete from public.scheduled_task_links where id = $1", [link]))).rejects.toThrow();
    for (const call of [
      ["select public.app_scheduled_link_create($1, $2, $3, $4, 60)", [org, USERS.alice, t, hash("x")]],
      ["select public.app_scheduled_link_revoke($1, $2, $3)", [org, USERS.alice, t]],
      ["select public.app_scheduled_link_fire($1, $2, null, 0)", [link, hash("secret-one")]],
      ["select public.app_scheduled_run_payload($1)", [link]],
    ] as const) {
      await expect(as(db, "authenticated", USERS.alice, async () => db.query(call[0], [...call[1]]))).rejects.toThrow();
      await expect(as(db, "anon", null, async () => db.query(call[0], [...call[1]]))).rejects.toThrow();
    }
  });

  it("can't be made for someone else's task, from another workspace, by someone outside, or with a hash or a wait that isn't one", async () => {
    await clear();
    const t = await task();
    await su("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member') on conflict do nothing", [org, USERS.bob]);
    await expect(create(t, "s", { actor: USERS.bob })).rejects.toThrow(/NOT_FOUND/);
    await expect(create(t, "s", { actor: USERS.bob, orgId: otherOrg })).rejects.toThrow(/NOT_FOUND/);
    await su("delete from public.organization_members where org_id = $1 and user_id = $2", [org, USERS.bob]);
    await expect(create(t, "s", { actor: USERS.bob })).rejects.toThrow();
    await expect(q("select public.app_scheduled_link_create($1, $2, $3, $4, 60)", [org, USERS.alice, t, "not-a-hash"])).rejects.toThrow(/INVALID_REQUEST/);
    await expect(q("select public.app_scheduled_link_create($1, $2, $3, $4, 60)", [org, USERS.alice, t, hash("s").toUpperCase()])).rejects.toThrow(/INVALID_REQUEST/);
    for (const wait of [0, 59, 604801, null]) await expect(q("select public.app_scheduled_link_create($1, $2, $3, $4, $5)", [org, USERS.alice, t, hash("s"), wait])).rejects.toThrow(/INVALID_REQUEST/);
    expect(await su("select id from public.scheduled_task_links")).toEqual([]);
  });

  it("is one at a time: a new one stops the old and drops what the old one left waiting", async () => {
    await clear();
    const t = await task();
    const first = await create(t, "secret-one");
    expect(await fire(first, "secret-one", "sent through the old link")).toBe("queued");
    const second = await create(t, "secret-two");
    expect(second).not.toBe(first);
    expect((await su<{ live: number }>("select count(*)::int as live from public.scheduled_task_links where task_id = $1 and revoked_at is null", [t]))[0]!.live).toBe(1);
    // What came through the link that was replaced doesn't outlive it: the run it queued is told nothing.
    expect(await waiting(t)).toEqual({ link_payload: null, due: false });
    const [run] = await claim();
    expect(await payload(run!.run_id)).toBeNull();
    expect(await fire(first, "secret-one")).toBe("unknown");
  });

  it("is stopped by its owner whatever the task's state and whatever their role has become, and by nobody else", async () => {
    await clear();
    await su("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member') on conflict do nothing", [org, USERS.bob]);
    const t = await task(USERS.bob);
    const link = await create(t, "bobs-secret", { actor: USERS.bob });
    expect(await fire(link, "bobs-secret", "still waiting")).toBe("queued");
    // Someone else in the workspace can't stop it, nor can its owner be named from another workspace.
    await expect(q("select public.app_scheduled_link_revoke($1, $2, $3)", [org, USERS.alice, t])).rejects.toThrow(/NOT_FOUND/);
    await expect(q("select public.app_scheduled_link_revoke($1, $2, $3)", [otherOrg, USERS.bob, t])).rejects.toThrow(/NOT_FOUND/);
    await expect(q("select public.app_scheduled_link_revoke($1, $2, $3)", [org, USERS.unverified, t])).rejects.toThrow();
    // Its owner, now only a viewer, with the task put away: stopping a link is never the thing to refuse.
    await q("select public.app_scheduled_task_archive($1, $2, $3)", [org, USERS.bob, t]);
    await su("update public.organization_members set role = 'viewer' where org_id = $1 and user_id = $2", [org, USERS.bob]);
    expect((await q<{ stopped: boolean }>("select public.app_scheduled_link_revoke($1, $2, $3) as stopped", [org, USERS.bob, t]))[0]!.stopped).toBe(true);
    expect(await fire(link, "bobs-secret")).toBe("unknown");
    expect(await waiting(t)).toEqual({ link_payload: null, due: false });
    // Stopping a link that isn't there says so.
    expect((await q<{ stopped: boolean }>("select public.app_scheduled_link_revoke($1, $2, $3) as stopped", [org, USERS.bob, t]))[0]!.stopped).toBe(false);
    await su("delete from public.organization_members where org_id = $1 and user_id = $2", [org, USERS.bob]);
  });

  it("goes with its task", async () => {
    await clear();
    const t = await task();
    const link = await create(t, "secret-one");
    await su("delete from public.scheduled_tasks where id = $1", [t]);
    expect(await su("select id from public.scheduled_task_links where id = $1", [link])).toEqual([]);
  });
});

describe("a call to a link", () => {
  it("queues one run of its task, as Run now does, and keeps what was sent for that run", async () => {
    await clear();
    const t = await task();
    const link = await create(t, "secret-one");
    expect(await claim()).toEqual([]);
    expect(await fire(link, "secret-one", "  order 1042 was paid  ")).toBe("queued");
    expect(await su("select uses, last_used_at is not null as used from public.scheduled_task_links where id = $1", [link])).toEqual([{ uses: 1, used: true }]);
    const [run] = await claim();
    expect(run).toMatchObject({ task_id: t, manual: true });
    expect(await payload(run!.run_id)).toBe("order 1042 was paid");
    // It has moved onto the run, which is marked as started from the link: asked again, for a second try, it is the same.
    expect(await waiting(t)).toEqual({ link_payload: null, due: false });
    expect(await runRow(run!.run_id)).toEqual({ from_link: true, payload: "order 1042 was paid" });
    expect(await payload(run!.run_id)).toBe("order 1042 was paid");
    await finish(run!.run_id, run!.attempt, "done");
    // The schedule's own next time is put back, as after Run now.
    expect((await su<{ next: string }>("select next_run_at::text as next from public.scheduled_tasks where id = $1", [t]))[0]!.next).toContain("2030-01-01");
  });

  it("marks the run as started from the link even when nothing was sent", async () => {
    await clear();
    const t = await task();
    const link = await create(t, "secret-one");
    expect(await fire(link, "secret-one", "   ")).toBe("queued");
    const [run] = await claim();
    expect(await payload(run!.run_id)).toBeNull();
    expect(await runRow(run!.run_id)).toEqual({ from_link: true, payload: null });
  });

  it("answers the wrong secret, a stopped link and no link alike, and changes nothing", async () => {
    await clear();
    const t = await task();
    const link = await create(t, "secret-one");
    expect(await fire(link, "wrong")).toBe("unknown");
    expect(await fire("00000000-0000-4000-8000-00000000dead", "secret-one")).toBe("unknown");
    expect(await q<{ s: string }>("select public.app_scheduled_link_fire($1, null, null, 0) as s", [link])).toEqual([{ s: "unknown" }]);
    expect(await q<{ s: string }>("select public.app_scheduled_link_fire(null, $1, null, 0) as s", [hash("secret-one")])).toEqual([{ s: "unknown" }]);
    expect(await q<{ s: string }>("select public.app_scheduled_link_fire($1, $2, null, -1) as s", [link, hash("secret-one")])).toEqual([{ s: "unknown" }]);
    expect(await su("select uses, last_used_at from public.scheduled_task_links where id = $1", [link])).toEqual([{ uses: 0, last_used_at: null }]);
    expect(await waiting(t)).toEqual({ link_payload: null, due: false });
    expect(await claim()).toEqual([]);
  });

  it("waits the longer of the caller's floor and the link's own between runs", async () => {
    await clear();
    const t = await task();
    // A link made on a plan that runs a task once a day keeps that wait, whatever floor the server passes.
    const daily = await create(t, "secret-one", { wait: 86_400 });
    expect(await fire(daily, "secret-one", "first", 900)).toBe("queued");
    expect(await fire(daily, "secret-one", "second", 900)).toBe("too_soon");
    await su("update public.scheduled_task_links set last_used_at = now() - interval '16 minutes' where id = $1", [daily]);
    expect(await fire(daily, "secret-one", "second", 900)).toBe("too_soon");
    expect((await waiting(t)).link_payload).toBe("first");
    await su("update public.scheduled_task_links set last_used_at = now() - interval '25 hours' where id = $1", [daily]);
    // The first run was never claimed: the later call's words replace the earlier, and there is still one run.
    expect(await fire(daily, "secret-one", "second", 900)).toBe("queued");
    const runs = await claim();
    expect(runs).toHaveLength(1);
    expect(await payload(runs[0]!.run_id)).toBe("second");
    // The server's floor holds over a link made with a shorter wait.
    const t2 = await task();
    const quick = await create(t2, "secret-two", { wait: 60 });
    expect(await fire(quick, "secret-two", null, 900)).toBe("queued");
    await su("update public.scheduled_task_links set last_used_at = now() - interval '5 minutes' where id = $1", [quick]);
    expect(await fire(quick, "secret-two", null, 900)).toBe("too_soon");
  });

  it("says a run is under way, and that a task is off when it is paused, ended or put away; a refused call is no use of the link", async () => {
    await clear();
    const t = await task();
    const link = await create(t, "secret-one");
    expect(await fire(link, "secret-one")).toBe("queued");
    await rested(link);
    const [run] = await claim();
    // The runner asks what the run was sent, as it does for every run: the call's mark moves onto the run.
    await payload(run!.run_id);
    expect(await fire(link, "secret-one", "while it runs")).toBe("busy");
    await finish(run!.run_id, run!.attempt, "done");
    await q("select public.app_scheduled_task_state($1, $2, $3, 'paused', null, 9)", [org, USERS.alice, t]);
    expect(await fire(link, "secret-one", "while paused")).toBe("off");
    expect(await waiting(t)).toEqual({ link_payload: null, due: false });
    await q("select public.app_scheduled_task_state($1, $2, $3, 'active', $4, 9)", [org, USERS.alice, t, FAR]);
    expect(await fire(link, "secret-one")).toBe("queued");
    await rested(link);
    await q("select public.app_scheduled_task_archive($1, $2, $3)", [org, USERS.alice, t]);
    expect(await fire(link, "secret-one")).toBe("off");
    expect((await su<{ uses: number }>("select uses from public.scheduled_task_links where id = $1", [link]))[0]!.uses).toBe(2);
  });

  it("is off once its owner may no longer use AI in the workspace, or the workspace is suspended", async () => {
    await clear();
    await su("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member') on conflict do nothing", [org, USERS.bob]);
    const t = await task(USERS.bob);
    const link = await create(t, "bobs-secret", { actor: USERS.bob });
    await su("update public.organization_members set role = 'viewer' where org_id = $1 and user_id = $2", [org, USERS.bob]);
    expect(await fire(link, "bobs-secret")).toBe("off");
    await su("update public.organization_members set role = 'member' where org_id = $1 and user_id = $2", [org, USERS.bob]);
    await su("update public.organizations set suspended_at = now() where id = $1", [org]);
    expect(await fire(link, "bobs-secret")).toBe("off");
    await su("update public.organizations set suspended_at = null where id = $1", [org]);
    await su("delete from public.organization_members where org_id = $1 and user_id = $2", [org, USERS.bob]);
    expect(await fire(link, "bobs-secret")).toBe("unknown");
  });

  it("keeps at most 2,000 characters of what was sent", async () => {
    await clear();
    const t = await task();
    const link = await create(t, "secret-one");
    expect(await fire(link, "secret-one", "x".repeat(5000))).toBe("queued");
    expect((await su<{ n: number }>("select char_length(link_payload) as n from public.scheduled_tasks where id = $1", [t]))[0]!.n).toBe(2000);
  });
});

describe("what a call sent is the run it queued's, and no other's", () => {
  it("is given to a try that was waiting to be made again, which the call starts at once", async () => {
    await clear();
    const t = await task();
    const link = await create(t, "secret-one");
    // A scheduled run fails and waits to be tried again.
    await su("update public.scheduled_tasks set next_run_at = now() - interval '1 minute' where id = $1", [t]);
    const [first] = await claim();
    expect(first).toMatchObject({ manual: false });
    await finish(first!.run_id, first!.attempt, "failed", { retry: "2040-01-01T00:00:00Z" });
    expect(await claim()).toEqual([]);
    // The call makes that try now: it is the run the call started, though the schedule began it.
    expect(await fire(link, "secret-one", "try it now with this")).toBe("queued");
    const [again] = await claim();
    expect(again).toMatchObject({ run_id: first!.run_id, attempt: 2, manual: false });
    expect(await payload(again!.run_id)).toBe("try it now with this");
    expect(await runRow(again!.run_id)).toEqual({ from_link: true, payload: "try it now with this" });
  });

  it("is the same on a second try of its run, and a later call's is for a later run", async () => {
    await clear();
    const t = await task();
    const link = await create(t, "secret-one");
    await fire(link, "secret-one", "first");
    await rested(link);
    const [run] = await claim();
    expect(await payload(run!.run_id)).toBe("first");
    await finish(run!.run_id, run!.attempt, "failed", { retry: "2000-01-01T00:00:00Z" });
    // A later call, while the run waits for its second try, makes that try now. The run keeps what it was first given: one run
    // is told one thing, however often its link is called while it is still being tried.
    expect(await fire(link, "secret-one", "second")).toBe("queued");
    const [again] = await claim();
    expect(again).toMatchObject({ run_id: run!.run_id, attempt: 2 });
    expect(await payload(again!.run_id)).toBe("first");
    expect(await runRow(again!.run_id)).toEqual({ from_link: true, payload: "first" });
  });

  it("is dropped when its run never came: it never turns up in a run started later", async () => {
    await clear();
    const t = await task();
    const link = await create(t, "secret-one");
    expect(await fire(link, "secret-one", "an order from last week")).toBe("queued");
    // Paused in the minute before the run was claimed, and resumed later for its schedule's next time.
    await q("select public.app_scheduled_task_state($1, $2, $3, 'paused', null, 9)", [org, USERS.alice, t]);
    await q("select public.app_scheduled_task_state($1, $2, $3, 'active', $4, 9)", [org, USERS.alice, t, FAR]);
    expect((await waiting(t)).link_payload).toBe("an order from last week");
    // Days later the owner presses Run now.
    await q("select public.app_scheduled_task_run_now($1, $2, $3)", [org, USERS.alice, t]);
    const [run] = await claim();
    expect(run).toMatchObject({ manual: true });
    expect(await payload(run!.run_id)).toBeNull();
    expect(await runRow(run!.run_id)).toEqual({ from_link: false, payload: null });
    expect(await waiting(t)).toEqual({ link_payload: null, due: false });
  });

  it("is nothing for a run the schedule started, or one the owner started, and for a run that doesn't exist", async () => {
    await clear();
    const t = await task();
    await su("update public.scheduled_tasks set next_run_at = now() - interval '1 minute' where id = $1", [t]);
    const [scheduled] = await claim();
    expect(await payload(scheduled!.run_id)).toBeNull();
    await finish(scheduled!.run_id, scheduled!.attempt, "done");
    await q("select public.app_scheduled_task_run_now($1, $2, $3)", [org, USERS.alice, t]);
    const [byHand] = await claim();
    expect(await payload(byHand!.run_id)).toBeNull();
    expect(await runRow(byHand!.run_id)).toEqual({ from_link: false, payload: null });
    expect(await payload("00000000-0000-4000-8000-00000000dead")).toBeNull();
  });
});

describe("migration v109", () => {
  it("reads back as the owner's check of production does", async () => {
    // The line the owner runs after applying v109 (scripts/vps/check-migrations.ps1), run here so a slip in it is found before then.
    const line = readFileSync("scripts/vps/check-migrations.ps1", "utf8")
      .split("\n")
      .find((l) => l.includes("'v109 task links'"));
    expect(line).toBeTruthy();
    const expression = line!
      .slice(line!.indexOf("'v109 task links',") + "'v109 task links',".length)
      .trim()
      .replace(/;$/, "");
    expect((await su<{ ok: boolean }>(`select (${expression}) as ok`))[0]!.ok).toBe(true);
  });
});
