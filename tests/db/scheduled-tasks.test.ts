/**
 * Migration v106: scheduled tasks (stage 271, ADR 0278). A person's tasks and runs are theirs alone to read; only the server writes
 * them, through functions that check the person again. A due task is claimed under a lease, each due time runs at most once, a try
 * that failed is claimed again later, and a try that was given up on changes nothing. SYNTHETIC values.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let otherOrg: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const su = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const SCHEDULE = JSON.stringify({ repeat: { kind: "daily", time: "09:00" }, timeZone: "Asia/Colombo", end: { kind: "never" } });
const OPTIONS = JSON.stringify({ web: true, effort: "balanced", notify: true });
const save = (o: { actor?: string; orgId?: string; task?: string | null; base?: number | null; title?: string; next?: string | null; max?: number } = {}) =>
  q<{ id: string; version: number }>("select * from public.app_scheduled_task_save($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10)", [
    o.orgId ?? org,
    o.actor ?? USERS.alice,
    o.task ?? null,
    o.base ?? null,
    o.title ?? "Morning news",
    "Research the latest news and summarise it.",
    SCHEDULE,
    OPTIONS,
    o.next === undefined ? "2026-01-01T00:00:00Z" : o.next,
    o.max ?? 5,
  ]).then((r) => r[0]!);
const claim = (limit = 5) => q<{ run_id: string; task_id: string; attempt: number; due_at: string; runs_finished: number }>("select * from public.app_scheduled_claim($1)", [limit]);
const finish = (run: string, attempt: number, status: string, o: { next?: string | null; retry?: string | null; pause?: string | null; detail?: string | null } = {}) =>
  q<{ ok: boolean }>("select public.app_scheduled_run_finish($1, $2, $3, $4, null, null, $5, $6, $7) as ok", [run, attempt, status, o.detail ?? null, o.next ?? null, o.retry ?? null, o.pause ?? null]).then((r) => r[0]!.ok);
const task = (id: string) => su<Record<string, unknown>>("select state, state_reason, next_run_at, lease_until, attempts, runs_finished, failures_in_row, last_status, version from public.scheduled_tasks where id = $1", [id]).then((r) => r[0]!);
const clear = () => su("delete from public.scheduled_tasks");

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  otherOrg = await createOrg(db, USERS.bob, "Bob Studio");
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("a person's scheduled tasks", () => {
  it("are theirs alone to read, and nobody writes them but the server's functions", async () => {
    await clear();
    const t = await save();
    const mine = await as(db, "authenticated", USERS.alice, async () => (await db.query<{ title: string }>("select title from public.scheduled_tasks where id = $1", [t.id])).rows);
    expect(mine).toEqual([{ title: "Morning news" }]);
    const theirs = await as(db, "authenticated", USERS.bob, async () => (await db.query("select id from public.scheduled_tasks where id = $1", [t.id])).rows);
    expect(theirs).toEqual([]);
    await expect(as(db, "authenticated", USERS.alice, async () => db.query("update public.scheduled_tasks set title = 'x' where id = $1", [t.id]))).rejects.toThrow();
    await expect(as(db, "authenticated", USERS.alice, async () => db.query("select public.app_scheduled_claim(5)"))).rejects.toThrow();
    await expect(as(db, "anon", null, async () => db.query("select id from public.scheduled_tasks"))).rejects.toThrow();
  });

  it("are saved only by a contributor of the workspace, within the plan's limit on active tasks", async () => {
    await clear();
    // Bob isn't in Alice's workspace.
    await expect(save({ actor: USERS.bob })).rejects.toThrow();
    await save({ max: 2 });
    await save({ max: 2, title: "Second" });
    await expect(save({ max: 2, title: "Third" })).rejects.toThrow(/QUOTA_EXCEEDED/);
    // A task with no run left is saved as ended, and doesn't count against the limit.
    const ended = await save({ max: 2, title: "Past", next: null });
    expect(await task(ended.id)).toMatchObject({ state: "ended", next_run_at: null });
  });

  it("change only from the version on screen, and only by their owner", async () => {
    await clear();
    const t = await save();
    const again = await save({ task: t.id, base: 1, title: "Evening news" });
    expect(again.version).toBe(2);
    await expect(save({ task: t.id, base: 1, title: "Late" })).rejects.toThrow(/VERSION_CONFLICT/);
    // Another workspace's owner can't change it, even naming this workspace's task.
    await expect(save({ actor: USERS.bob, orgId: otherOrg, task: t.id, base: 2 })).rejects.toThrow(/NOT_FOUND/);
  });

  it("pause, resume within the limit, run now and are removed", async () => {
    await clear();
    const t = await save({ max: 1, next: "2099-01-01T00:00:00Z" });
    await q("select public.app_scheduled_task_state($1, $2, $3, 'paused', null, 1)", [org, USERS.alice, t.id]);
    expect(await task(t.id)).toMatchObject({ state: "paused" });
    // A paused task can't be run now, and leaves room for another active one.
    await expect(q("select public.app_scheduled_task_run_now($1, $2, $3)", [org, USERS.alice, t.id])).rejects.toThrow(/NOT_FOUND/);
    const other = await save({ max: 1, title: "Other", next: "2099-01-01T00:00:00Z" });
    await expect(q("select public.app_scheduled_task_state($1, $2, $3, 'active', '2099-01-01T00:00:00Z', 1)", [org, USERS.alice, t.id])).rejects.toThrow(/QUOTA_EXCEEDED/);
    await q("select public.app_scheduled_task_archive($1, $2, $3)", [org, USERS.alice, other.id]);
    await q("select public.app_scheduled_task_state($1, $2, $3, 'active', '2099-01-01T00:00:00Z', 1)", [org, USERS.alice, t.id]);
    expect(await task(t.id)).toMatchObject({ state: "active", failures_in_row: 0 });
    // Not due until 2099: run now makes it due at once, and only its owner may.
    expect(await claim()).toEqual([]);
    await expect(q("select public.app_scheduled_task_run_now($1, $2, $3)", [otherOrg, USERS.bob, t.id])).rejects.toThrow(/NOT_FOUND/);
    await q("select public.app_scheduled_task_run_now($1, $2, $3)", [org, USERS.alice, t.id]);
    expect((await claim()).map((c) => c.task_id)).toEqual([t.id]);
  });
});

describe("the runner's claims", () => {
  it("claims a due task once: a second claim finds nothing while its lease holds", async () => {
    await clear();
    const t = await save();
    const first = await claim();
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ task_id: t.id, attempt: 1, runs_finished: 0 });
    expect(await claim()).toEqual([]);
    const runs = await su<{ status: string; attempt: number }>("select status, attempt from public.scheduled_task_runs where task_id = $1", [t.id]);
    expect(runs).toEqual([{ status: "running", attempt: 1 }]);
    // The owner reads their run; someone else doesn't.
    const mine = await as(db, "authenticated", USERS.alice, async () => (await db.query("select id from public.scheduled_task_runs where task_id = $1", [t.id])).rows);
    expect(mine).toHaveLength(1);
    const theirs = await as(db, "authenticated", USERS.bob, async () => (await db.query("select id from public.scheduled_task_runs where task_id = $1", [t.id])).rows);
    expect(theirs).toEqual([]);
  });

  it("finishes a due time: the task moves to its next time, and the same due time is never run again", async () => {
    await clear();
    const t = await save();
    const [c] = await claim();
    expect(await finish(c!.run_id, 1, "done", { next: "2099-01-02T03:30:00Z" })).toBe(true);
    expect(await task(t.id)).toMatchObject({ state: "active", attempts: 0, lease_until: null, runs_finished: 1, failures_in_row: 0, last_status: "done" });
    expect(await claim()).toEqual([]);
    // Finishing it again changes nothing.
    expect(await finish(c!.run_id, 1, "failed", { next: null })).toBe(false);
    expect(await task(t.id)).toMatchObject({ state: "active", last_status: "done" });
  });

  it("tries a failed try again later, as another try at the same due time, in the same run's row", async () => {
    await clear();
    const t = await save();
    const [c] = await claim();
    expect(await finish(c!.run_id, 1, "failed", { retry: "2020-01-01T00:00:00Z", detail: "A provider was down." })).toBe(true);
    expect((await su<{ status: string }>("select status from public.scheduled_task_runs where id = $1", [c!.run_id]))[0]!.status).toBe("retrying");
    // The retry time has passed: claimed again, attempt 2, the same run and due time.
    const [again] = await claim();
    expect(again).toMatchObject({ run_id: c!.run_id, task_id: t.id, attempt: 2, due_at: c!.due_at });
    expect(await su("select id from public.scheduled_task_runs where task_id = $1", [t.id])).toHaveLength(1);
  });

  it("claims a task again when its runner died, and ignores the dead try's late word", async () => {
    await clear();
    const t = await save();
    const [c] = await claim();
    // The lease runs out with nothing recorded.
    await su("update public.scheduled_tasks set lease_until = now() - interval '1 minute' where id = $1", [t.id]);
    const [again] = await claim();
    expect(again).toMatchObject({ run_id: c!.run_id, attempt: 2 });
    // The first try wakes up and reports: it was given up on, so nothing changes.
    expect(await finish(c!.run_id, 1, "done", { next: "2099-01-02T03:30:00Z" })).toBe(false);
    expect(await task(t.id)).toMatchObject({ runs_finished: 0, last_status: null });
    expect(await finish(again!.run_id, 2, "done", { next: "2099-01-02T03:30:00Z" })).toBe(true);
    expect(await task(t.id)).toMatchObject({ runs_finished: 1, last_status: "done" });
  });

  it("counts runs that didn't finish, pauses with a reason when told to, and ends when no run is left", async () => {
    await clear();
    const t = await save();
    const [c] = await claim();
    await finish(c!.run_id, 1, "skipped", { next: "2020-01-02T00:00:00Z", detail: "No AI usage left this month." });
    expect(await task(t.id)).toMatchObject({ failures_in_row: 1, last_status: "skipped", state: "active" });
    const [d] = await claim();
    await finish(d!.run_id, 1, "failed", { next: "2020-01-03T00:00:00Z", pause: "Paused by Farbaek: its last 5 runs didn't finish." });
    expect(await task(t.id)).toMatchObject({ failures_in_row: 2, state: "paused", state_reason: "Paused by Farbaek: its last 5 runs didn't finish." });
    // Paused: not claimed, though its time has passed.
    expect(await claim()).toEqual([]);
    await q("select public.app_scheduled_task_state($1, $2, $3, 'active', '2020-01-04T00:00:00Z', 5)", [org, USERS.alice, t.id]);
    const [e] = await claim();
    await finish(e!.run_id, 1, "done", { next: null });
    expect(await task(t.id)).toMatchObject({ state: "ended", state_reason: "Its schedule has finished.", failures_in_row: 0 });
  });

  it("leaves a task as its owner left it when they paused or removed it mid-run", async () => {
    await clear();
    const t = await save();
    const [c] = await claim();
    await q("select public.app_scheduled_task_state($1, $2, $3, 'paused', null, 5)", [org, USERS.alice, t.id]);
    await finish(c!.run_id, 1, "done", { next: "2099-01-02T03:30:00Z" });
    expect(await task(t.id)).toMatchObject({ state: "paused", last_status: "done" });
  });

  it("links the task's conversation only when it's the owner's own, in the same workspace", async () => {
    await clear();
    const t = await save();
    const mine = (await q<{ id: string }>("select public.app_chat_start($1, $2, null, 'Morning news') as id", [org, USERS.alice]))[0]!.id;
    const bobs = (await q<{ id: string }>("select public.app_chat_start($1, $2, null, 'Bob chat') as id", [otherOrg, USERS.bob]))[0]!.id;
    await q("select public.app_scheduled_task_conversation($1, $2)", [t.id, bobs]);
    expect((await su<{ conversation_id: string | null }>("select conversation_id from public.scheduled_tasks where id = $1", [t.id]))[0]!.conversation_id).toBeNull();
    await q("select public.app_scheduled_task_conversation($1, $2)", [t.id, mine]);
    expect((await su<{ conversation_id: string | null }>("select conversation_id from public.scheduled_tasks where id = $1", [t.id]))[0]!.conversation_id).toBe(mine);
  });

  it("records the timer as a background job", async () => {
    await q("select public.app_note_job_run('scheduled_tasks', true, 'Started 0; 0 running.')");
    expect(await su("select job from public.job_runs where job = 'scheduled_tasks'")).toHaveLength(1);
  });
});
