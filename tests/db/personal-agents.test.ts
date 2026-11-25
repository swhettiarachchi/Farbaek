/**
 * Migration v108: agents (stage 275, ADR 0282). An agent is a person's own, with one scheduled task that does its work; only the
 * server writes either, through functions that check the person again. The plan's limits hold, a change is made from the version on
 * screen, and what a run leaves as its note is given to the next until the person clears it. SYNTHETIC values.
 */
import type { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LIMIT_WINDOW_HOURS, limitProblem } from "../../src/core/automation/agents";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let otherOrg: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const su = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const SCHEDULE = JSON.stringify({ repeat: { kind: "daily", time: "09:00" }, timeZone: "Asia/Colombo", end: { kind: "never" } });
const OPTIONS = JSON.stringify({ web: true, effort: "balanced", notify: true });

interface SaveArgs {
  actor?: string;
  orgId?: string;
  agent?: string | null;
  base?: number | null;
  name?: string;
  goal?: string;
  runs?: number;
  memory?: boolean;
  next?: string | null;
  maxActive?: number;
  maxAgents?: number;
}
const save = (o: SaveArgs = {}) =>
  q<{ id: string; task_id: string; version: number }>("select * from public.app_personal_agent_save($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13)", [
    o.orgId ?? org,
    o.actor ?? USERS.alice,
    o.agent ?? null,
    o.base ?? null,
    o.name ?? "Scout",
    o.goal ?? "Keep track of what my competitors change.",
    o.runs ?? 35,
    o.memory ?? true,
    SCHEDULE,
    OPTIONS,
    o.next === undefined ? "2026-01-01T00:00:00Z" : o.next,
    o.maxActive ?? 5,
    o.maxAgents ?? 3,
  ]).then((r) => r[0]!);
const claim = (limit = 5) => q<{ run_id: string; task_id: string; attempt: number }>("select * from public.app_scheduled_claim($1)", [limit]);
const FAR = "2030-01-01T00:00:00Z";
const MESSAGE = "99999999-9999-4999-8999-999999999999";
/** Records how a run went. `turn` says a Chat turn was begun (an answer has one; a run that never reached the model has none). */
const finish = (run: string, attempt: number, status: string, next: string | null = FAR, o: { turn?: boolean; detail?: string | null; retry?: string | null } = {}) =>
  q<{ ok: boolean }>("select public.app_scheduled_run_finish($1, $2, $3, $4, null, $5, $6, $7, null, $8) as ok", [run, attempt, status, o.detail ?? null, (o.turn ?? status === "done") ? MESSAGE : null, next, o.retry ?? null, status === "done" ? 0 : 1]);
/** Makes the task due a while ago and claims it: a run with a due time of its own, near now, as the limit counts by. */
const due = async (task: string, ago: string) => {
  await su(`update public.scheduled_tasks set next_run_at = now() - interval '${ago}', lease_until = null, attempts = 0 where id = $1`, [task]);
  const [c] = await claim();
  return c!;
};
const context = (task: string) => q<{ c: { agent_id: string; name: string; goal: string; runs_limit: number; use_memory: boolean; archived: boolean; runs_in_30_days: number; told_limit: boolean; new_chat: boolean; notes: { at: string; note: string }[] } | null }>("select public.app_personal_agent_run_context($1) as c", [task]).then((r) => r[0]!.c);
const note = (run: string, text: string | null) => q<{ ok: boolean }>("select public.app_scheduled_run_note($1, $2) as ok", [run, text]).then((r) => r[0]!.ok);
const clear = async () => {
  await su("delete from public.personal_agents");
  await su("delete from public.scheduled_tasks");
};
let minute = 0;
/** One finished run of the agent's task, with what it left. Each is given a due time of its own, a minute after the last. */
const runOnce = async (text: string | null) => {
  const [c] = await claim();
  minute += 1;
  await finish(c!.run_id, c!.attempt, "done", new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString());
  if (text !== null) await note(c!.run_id, text);
  return c!.run_id;
};

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  otherOrg = await createOrg(db, USERS.bob, "Bob Studio");
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("a person's agents", () => {
  it("are saved with the task that does their work, named and worded as the agent is", async () => {
    await clear();
    const a = await save();
    expect(a.version).toBe(1);
    const agent = await su("select name, goal, runs_limit, use_memory, notes_from, archived_at from public.personal_agents where id = $1", [a.id]);
    expect(agent).toEqual([{ name: "Scout", goal: "Keep track of what my competitors change.", runs_limit: 35, use_memory: true, notes_from: null, archived_at: null }]);
    const task = await su("select title, instruction, state, personal_agent_id as agent_id from public.scheduled_tasks where id = $1", [a.task_id]);
    expect(task).toEqual([{ title: "Scout", instruction: "Keep track of what my competitors change.", state: "active", agent_id: a.id }]);
  });

  it("are theirs alone to read, and nobody writes them but the server's functions", async () => {
    await clear();
    const a = await save();
    const mine = await as(db, "authenticated", USERS.alice, async () => (await db.query<{ name: string }>("select name from public.personal_agents where id = $1", [a.id])).rows);
    expect(mine).toEqual([{ name: "Scout" }]);
    const theirs = await as(db, "authenticated", USERS.bob, async () => (await db.query("select id from public.personal_agents where id = $1", [a.id])).rows);
    expect(theirs).toEqual([]);
    await expect(as(db, "authenticated", USERS.alice, async () => db.query("update public.personal_agents set name = 'x' where id = $1", [a.id]))).rejects.toThrow();
    await expect(as(db, "authenticated", USERS.alice, async () => db.query("insert into public.personal_agents (org_id, owner_id, name, goal, runs_limit) values ($1, $2, 'x', 'y', 5)", [org, USERS.alice]))).rejects.toThrow();
    for (const call of [
      "select * from public.app_personal_agent_save($1, $2, null, null, 'x', 'y', 5, true, '{}'::jsonb, '{}'::jsonb, now(), 5, 3)",
      "select public.app_personal_agent_archive($1, $2, gen_random_uuid())",
      "select public.app_personal_agent_notes_clear($1, $2, gen_random_uuid())",
    ]) {
      await expect(as(db, "authenticated", USERS.alice, async () => db.query(call, [org, USERS.alice]))).rejects.toThrow();
      await expect(as(db, "anon", null, async () => db.query(call, [org, USERS.alice]))).rejects.toThrow();
    }
    await expect(as(db, "authenticated", USERS.alice, async () => db.query("select public.app_personal_agent_run_context($1)", [a.task_id]))).rejects.toThrow();
    await expect(as(db, "authenticated", USERS.alice, async () => db.query("select public.app_scheduled_run_note(gen_random_uuid(), 'x')"))).rejects.toThrow();
    await expect(as(db, "authenticated", USERS.alice, async () => db.query("select public.app_personal_agents_export($1)", [USERS.alice]))).rejects.toThrow();
  });

  it("can't be made by someone who isn't in the workspace, or in another person's name there", async () => {
    await clear();
    await expect(save({ actor: USERS.bob })).rejects.toThrow(/FORBIDDEN|NOT_A_MEMBER|permission/i);
    await expect(save({ actor: USERS.unverified })).rejects.toThrow();
    expect(await su("select id from public.personal_agents")).toEqual([]);
    expect(await su("select id from public.scheduled_tasks")).toEqual([]);
  });

  it("refuses a name, goal or limit out of range, and leaves nothing behind", async () => {
    await clear();
    for (const bad of [{ name: "  " }, { name: "x".repeat(41) }, { goal: " " }, { goal: "x".repeat(2001) }, { runs: 0 }, { runs: 751 }, { maxAgents: -1 }]) {
      await expect(save(bad)).rejects.toThrow(/INVALID_REQUEST/);
    }
    expect(await su("select id from public.personal_agents")).toEqual([]);
    expect(await su("select id from public.scheduled_tasks")).toEqual([]);
  });

  it("hold to the plan's limit on agents, and to its limit on active tasks, whichever comes first", async () => {
    await clear();
    await save({ name: "One", maxAgents: 2 });
    await save({ name: "Two", maxAgents: 2 });
    await expect(save({ name: "Three", maxAgents: 2 })).rejects.toThrow(/AGENT_LIMIT/);
    // A plan with room for agents but not for another active task: the task's own limit refuses, and no agent is left without one.
    await expect(save({ name: "Three", maxAgents: 5, maxActive: 2 })).rejects.toThrow(/QUOTA_EXCEEDED/);
    expect((await su("select name from public.personal_agents order by name")).map((r) => r.name)).toEqual(["One", "Two"]);
    expect(await su("select id from public.scheduled_tasks where personal_agent_id is null")).toEqual([]);
    // Removing one makes room.
    const [one] = await su<{ id: string }>("select id from public.personal_agents where name = 'One'");
    await q("select public.app_personal_agent_archive($1, $2, $3)", [org, USERS.alice, one!.id]);
    await save({ name: "Three", maxAgents: 2, maxActive: 2 });
  });

  it("are changed from the version on screen, and the task follows", async () => {
    await clear();
    const a = await save();
    const b = await save({ agent: a.id, base: 1, name: "Scout two", goal: "Watch prices only.", runs: 10, memory: false });
    expect(b).toMatchObject({ id: a.id, task_id: a.task_id, version: 2 });
    expect(await su("select name, goal, runs_limit, use_memory, version from public.personal_agents where id = $1", [a.id])).toEqual([{ name: "Scout two", goal: "Watch prices only.", runs_limit: 10, use_memory: false, version: 2 }]);
    expect(await su("select title, instruction from public.scheduled_tasks where id = $1", [a.task_id])).toEqual([{ title: "Scout two", instruction: "Watch prices only." }]);
    await expect(save({ agent: a.id, base: 1, name: "Stale" })).rejects.toThrow(/VERSION_CONFLICT/);
    await expect(save({ agent: a.id, base: null, name: "No version" })).rejects.toThrow(/VERSION_CONFLICT/);
    // A pause of its task (a change made elsewhere) doesn't make the agent's own version stale.
    await q("select public.app_scheduled_task_state($1, $2, $3, 'paused', null, 5)", [org, USERS.alice, a.task_id]);
    expect((await save({ agent: a.id, base: 2, name: "Scout three" })).version).toBe(3);
    expect((await su("select state from public.scheduled_tasks where id = $1", [a.task_id]))[0]!.state).toBe("paused");
  });

  it("can't be changed or removed by anyone else, or from another workspace", async () => {
    await clear();
    const a = await save();
    await su("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member') on conflict do nothing", [org, USERS.bob]);
    await expect(save({ actor: USERS.bob, agent: a.id, base: 1, name: "Bob's now" })).rejects.toThrow(/NOT_FOUND/);
    await expect(q("select public.app_personal_agent_archive($1, $2, $3)", [org, USERS.bob, a.id])).rejects.toThrow(/NOT_FOUND/);
    await expect(q("select public.app_personal_agent_notes_clear($1, $2, $3)", [org, USERS.bob, a.id])).rejects.toThrow(/NOT_FOUND/);
    await expect(q("select public.app_personal_agent_archive($1, $2, $3)", [otherOrg, USERS.bob, a.id])).rejects.toThrow(/NOT_FOUND/);
    expect((await su("select name, archived_at from public.personal_agents where id = $1", [a.id]))[0]).toEqual({ name: "Scout", archived_at: null });
    await su("delete from public.organization_members where org_id = $1 and user_id = $2", [org, USERS.bob]);
  });

  it("stop working when removed: the agent and its task are put away together, and can't be removed twice", async () => {
    await clear();
    const a = await save();
    await q("select public.app_personal_agent_archive($1, $2, $3)", [org, USERS.alice, a.id]);
    expect((await su<{ archived: boolean }>("select archived_at is not null as archived from public.personal_agents where id = $1", [a.id]))[0]!.archived).toBe(true);
    expect(await su("select state, next_run_at, archived_at is not null as archived from public.scheduled_tasks where id = $1", [a.task_id])).toEqual([{ state: "ended", next_run_at: null, archived: true }]);
    expect(await claim()).toEqual([]);
    await expect(q("select public.app_personal_agent_archive($1, $2, $3)", [org, USERS.alice, a.id])).rejects.toThrow(/NOT_FOUND/);
    await expect(save({ agent: a.id, base: 1 })).rejects.toThrow(/NOT_FOUND/);
    // Its name is free for a new one.
    await save();
  });

  it("doesn't count an agent left without its work against the plan's limit, so its place is never one nobody can free", async () => {
    await clear();
    const a = await save({ maxAgents: 1 });
    await expect(save({ name: "Two", maxAgents: 1 })).rejects.toThrow(/AGENT_LIMIT/);
    // Its task is put away by itself (the page refuses this; the database isn't asked to).
    await q("select public.app_scheduled_task_archive($1, $2, $3)", [org, USERS.alice, a.task_id]);
    await save({ name: "Two", maxAgents: 1 });
    // The agent left behind can still be put away, and changing it is refused: it has no work.
    await expect(save({ agent: a.id, base: 1 })).rejects.toThrow(/NOT_FOUND/);
    await q("select public.app_personal_agent_archive($1, $2, $3)", [org, USERS.alice, a.id]);
  });
  it("go with their owner when the owner leaves the workspace", async () => {
    await clear();
    await su("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member') on conflict do nothing", [org, USERS.bob]);
    const bobs = await save({ actor: USERS.bob, name: "Bob's" });
    const mine = await save({ name: "Alice's" });
    await su("delete from public.organization_members where org_id = $1 and user_id = $2", [org, USERS.bob]);
    expect(await su("select id from public.personal_agents where id = $1", [bobs.id])).toEqual([]);
    expect(await su("select id from public.scheduled_tasks where id = $1", [bobs.task_id])).toEqual([]);
    expect(await su("select id from public.personal_agents where id = $1", [mine.id])).toHaveLength(1);
  });
});

describe("what the runner is given for an agent's task", () => {
  it("is the agent, with no runs and no notes before its first run; and nothing for a task that isn't an agent's", async () => {
    await clear();
    const a = await save({ runs: 12, memory: false });
    expect(await context(a.task_id)).toEqual({ agent_id: a.id, name: "Scout", goal: "Keep track of what my competitors change.", runs_limit: 12, use_memory: false, archived: false, runs_in_30_days: 0, told_limit: false, new_chat: false, notes: [] });
    const plain = (await q<{ id: string }>("select id from public.app_scheduled_task_save($1, $2, null, null, 'Plain', 'Do a thing.', $3::jsonb, $4::jsonb, '2026-01-01T00:00:00Z', 9)", [org, USERS.alice, SCHEDULE, OPTIONS]))[0]!;
    expect(await context(plain.id)).toBeNull();
    expect(await context("00000000-0000-4000-8000-00000000dead")).toBeNull();
  });

  it("counts the runs that made a turn, due in the last 30 days less half a day: a retried one once, none that was skipped or never reached the model", async () => {
    await clear();
    const a = await save();
    // An answer.
    const done = await due(a.task_id, "5 minutes");
    await finish(done.run_id, done.attempt, "done");
    // A turn that began and didn't finish: usage may have been spent, so it counts.
    const failed = await due(a.task_id, "4 minutes");
    await finish(failed.run_id, failed.attempt, "failed", FAR, { turn: true });
    // One that never reached the model ("couldn't be prepared"), and one passed over: neither made a turn.
    const blind = await due(a.task_id, "3 minutes");
    await finish(blind.run_id, blind.attempt, "failed");
    const skipped = await due(a.task_id, "2 minutes");
    await finish(skipped.run_id, skipped.attempt, "skipped");
    // Tried, failed, tried again and answered: one due time, one row, counted once.
    const first = await due(a.task_id, "1 minute");
    await finish(first.run_id, first.attempt, "failed", null, { turn: true, retry: "2000-01-01T00:00:00Z" });
    const [again] = await claim();
    expect(again).toMatchObject({ run_id: first.run_id, attempt: 2 });
    await finish(again!.run_id, 2, "done");
    // Either side of the window's edge.
    const old = await due(a.task_id, `${LIMIT_WINDOW_HOURS + 1} hours`);
    await finish(old.run_id, old.attempt, "done");
    const edge = await due(a.task_id, `${LIMIT_WINDOW_HOURS - 1} hours`);
    await finish(edge.run_id, edge.attempt, "done");
    // And one under way now.
    await due(a.task_id, "10 seconds");
    expect((await context(a.task_id))!.runs_in_30_days).toBe(4);
  });

  it("doesn't hold a daily agent whose limit is its schedule's 30 runs up for the run made at this time 30 days before", async () => {
    await clear();
    const a = await save({ runs: 30 });
    // Thirty daily runs: yesterday back to 30 days ago, that last one claimed a little later in its minute than today's will be.
    for (let day = 1; day <= 30; day++) {
      const c = await due(a.task_id, day === 30 ? "30 days" : `${day} days`);
      await finish(c.run_id, c.attempt, "done");
    }
    // Twenty-nine of them count, so today's run is within the limit.
    expect((await context(a.task_id))!.runs_in_30_days).toBe(29);
    expect(limitProblem({ runsIn30Days: 29, runsLimit: 30 })).toBeNull();
  });

  it("says the person has been told once a run was passed over for its limit, until a run makes a turn again", async () => {
    await clear();
    const a = await save({ runs: 1 });
    const told = async () => (await context(a.task_id))!.told_limit;
    const limit = limitProblem({ runsIn30Days: 1, runsLimit: 1 })!;
    const first = await due(a.task_id, "6 minutes");
    await finish(first.run_id, first.attempt, "done");
    expect(await told()).toBe(false);
    // A run skipped for another reason isn't the limit.
    const other = await due(a.task_id, "5 minutes");
    await finish(other.run_id, other.attempt, "skipped", FAR, { detail: "This month's AI usage is used up." });
    expect(await told()).toBe(false);
    // Passed over for the limit, in the words the runner records: told from now on, whatever is skipped after.
    const over = await due(a.task_id, "4 minutes");
    await finish(over.run_id, over.attempt, "skipped", FAR, { detail: limit });
    expect(await told()).toBe(true);
    const after = await due(a.task_id, "3 minutes");
    await finish(after.run_id, after.attempt, "skipped", FAR, { detail: "This month's AI usage is used up." });
    expect(await told()).toBe(true);
    // It works again: the next time it reaches its limit is a new stretch, told again.
    const works = await due(a.task_id, "2 minutes");
    await finish(works.run_id, works.attempt, "done");
    expect(await told()).toBe(false);
  });

  it("starts a new chat once the notes are cleared, and carries on one begun since", async () => {
    await clear();
    const a = await save();
    const chat = async () => (await q<{ id: string }>("select public.app_chat_start($1, $2, null, 'Scout') as id", [org, USERS.alice]))[0]!.id;
    // No chat yet: nothing to leave behind.
    expect((await context(a.task_id))!.new_chat).toBe(false);
    await q("select public.app_scheduled_task_conversation($1, $2)", [a.task_id, await chat()]);
    expect((await context(a.task_id))!.new_chat).toBe(false);
    // Cleared: the chat that holds its earlier answers isn't carried on.
    await q("select public.app_personal_agent_notes_clear($1, $2, $3)", [org, USERS.alice, a.id]);
    expect((await context(a.task_id))!.new_chat).toBe(true);
    // The run that follows begins a chat of its own, which later runs carry on.
    await q("select public.app_scheduled_task_conversation($1, $2)", [a.task_id, await chat()]);
    expect((await context(a.task_id))!.new_chat).toBe(false);
  });

  it("doesn't give a note from a run that was under way when the notes were cleared", async () => {
    await clear();
    const a = await save();
    const [c] = await claim();
    await su("update public.scheduled_task_runs set started_at = now() - interval '1 minute' where id = $1", [c!.run_id]);
    await q("select public.app_personal_agent_notes_clear($1, $2, $3)", [org, USERS.alice, a.id]);
    await finish(c!.run_id, c!.attempt, "done", "2026-01-01T00:30:00Z");
    expect(await note(c!.run_id, "Written from what was cleared.")).toBe(true);
    expect((await context(a.task_id))!.notes).toEqual([]);
    await runOnce("After the clearing.");
    expect((await context(a.task_id))!.notes.map((n) => n.note)).toEqual(["After the clearing."]);
  });
  it("keeps a note only on a run that finished, trimmed and no longer than a note may be", async () => {
    await clear();
    const a = await save();
    const [c] = await claim();
    expect(await note(c!.run_id, "Too early.")).toBe(false);
    await finish(c!.run_id, c!.attempt, "done");
    expect(await note(c!.run_id, "   ")).toBe(false);
    expect(await note(c!.run_id, null)).toBe(false);
    expect(await note(c!.run_id, `  ${"x".repeat(900)}  `)).toBe(true);
    expect((await su<{ n: number }>("select char_length(note) as n from public.scheduled_task_runs where id = $1", [c!.run_id]))[0]!.n).toBe(700);
    expect(await note("00000000-0000-4000-8000-00000000dead", "No such run.")).toBe(false);
    expect((await context(a.task_id))!.notes).toHaveLength(1);
  });

  it("gives the latest eight notes, newest first, and none from before the person cleared them", async () => {
    await clear();
    const a = await save();
    for (let i = 1; i <= 10; i++) await runOnce(`Run ${i}.`);
    await runOnce(null);
    const before = (await context(a.task_id))!.notes;
    expect(before.map((n) => n.note)).toEqual(["Run 10.", "Run 9.", "Run 8.", "Run 7.", "Run 6.", "Run 5.", "Run 4.", "Run 3."]);
    // The runs so far started before the clearing; one made after it is given again.
    await su("update public.scheduled_task_runs set started_at = now() - interval '1 hour'");
    await q("select public.app_personal_agent_notes_clear($1, $2, $3)", [org, USERS.alice, a.id]);
    expect((await context(a.task_id))!.notes).toEqual([]);
    // The notes themselves are still on the runs, for the person to read.
    expect((await su<{ n: number }>("select count(*)::int as n from public.scheduled_task_runs where note is not null"))[0]!.n).toBe(10);
    await runOnce("After the clearing.");
    expect((await context(a.task_id))!.notes.map((n) => n.note)).toEqual(["After the clearing."]);
    // Clearing doesn't make the version on screen stale.
    expect((await save({ agent: a.id, base: 1 })).version).toBe(2);
  });

  it("is still answered for once the agent is removed, marked so, so its task is never run as if it were no agent's", async () => {
    await clear();
    const a = await save();
    await q("select public.app_personal_agent_archive($1, $2, $3)", [org, USERS.alice, a.id]);
    expect(await context(a.task_id)).toMatchObject({ agent_id: a.id, archived: true });
  });
});

describe("a person's agents in the download of their data", () => {
  it("lists their own with the notes each kept, and no one else's", async () => {
    await clear();
    const a = await save();
    await runOnce("Compared prices. Next: read the blogs.");
    await su("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member') on conflict do nothing", [org, USERS.bob]);
    await save({ actor: USERS.bob, name: "Bob's" });
    const mine = (await q<{ e: { name: string; goal: string; runs_limit: number; use_memory: boolean; workspace: string; notes: { note: string }[] }[] }>("select public.app_personal_agents_export($1) as e", [USERS.alice]))[0]!.e;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ name: "Scout", goal: "Keep track of what my competitors change.", runs_limit: 35, use_memory: true, workspace: "Alice Studio" });
    expect(mine[0]!.notes.map((n) => n.note)).toEqual(["Compared prices. Next: read the blogs."]);
    await q("select public.app_personal_agent_archive($1, $2, $3)", [org, USERS.alice, a.id]);
    expect((await q<{ e: unknown[] }>("select public.app_personal_agents_export($1) as e", [USERS.alice]))[0]!.e).toEqual([]);
    await su("delete from public.organization_members where org_id = $1 and user_id = $2", [org, USERS.bob]);
  });
});

describe("migration v108", () => {
  it("reads back as the owner's check of production does", async () => {
    // The line the owner runs after applying v108 (scripts/vps/check-migrations.ps1), run here so a slip in it is found before then.
    const line = readFileSync("scripts/vps/check-migrations.ps1", "utf8")
      .split("\n")
      .find((l) => l.includes("'v108 personal agents'"));
    expect(line).toBeTruthy();
    const expression = line!
      .slice(line!.indexOf("'v108 personal agents',") + "'v108 personal agents',".length)
      .trim()
      .replace(/;$/, "");
    expect((await su<{ ok: boolean }>(`select (${expression}) as ok`))[0]!.ok).toBe(true);
  });

  it("leaves scheduled tasks that aren't an agent's as they were", async () => {
    await clear();
    const plain = (await q<{ id: string }>("select id from public.app_scheduled_task_save($1, $2, null, null, 'Plain', 'Do a thing.', $3::jsonb, $4::jsonb, '2026-01-01T00:00:00Z', 9)", [org, USERS.alice, SCHEDULE, OPTIONS]))[0]!;
    expect(await su("select personal_agent_id as agent_id from public.scheduled_tasks where id = $1", [plain.id])).toEqual([{ agent_id: null }]);
    const [c] = await claim();
    await finish(c!.run_id, c!.attempt, "done");
    expect(await su("select status, note from public.scheduled_task_runs where id = $1", [c!.run_id])).toEqual([{ status: "done", note: null }]);
  });
});
