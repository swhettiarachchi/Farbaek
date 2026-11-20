/**
 * Chat remembers (v101, stage 207, ADR 0224): sources on a shared chat, summaries of a long conversation's earlier part, and
 * the things a person asked Farbaek AI to remember.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let otherOrg: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const su = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const asUser = async <T = Record<string, unknown>>(uid: string, sql: string, params: unknown[] = []) => as(db, "authenticated", uid, async () => (await db.query<T>(sql, params)).rows);

const start = (actor: string = USERS.alice) => q<{ id: string }>("select public.app_chat_start($1, $2, null, '') as id", [org, actor]).then((r) => r[0]!.id);
const ask = (conv: string, parent: string | null, actor: string = USERS.alice) =>
  q<{ id: string }>("select public.app_chat_add_user_message($1, $2, $3, $4, 'What is new?', '{}'::uuid[]) as id", [org, actor, conv, parent]).then((r) => r[0]!.id);
const begin = (conv: string, parent: string, actor: string = USERS.alice) =>
  q<{ id: string }>("select public.app_chat_begin_reply($1, $2, $3, $4, 'text', 'claude-sonnet-5-5') as id", [org, actor, conv, parent]).then((r) => r[0]!.id);
const write = (msg: string, meta: unknown, actor: string = USERS.alice) =>
  q("select public.app_chat_write_reply($1, $2, $3, 'An answer [1].', 'complete', null, null, null, $4::jsonb)", [org, actor, msg, JSON.stringify(meta)]);
const remember = (content: string, actor: string = USERS.alice, orgId = org) => q<{ id: string }>("select public.app_chat_remember($1, $2, $3) as id", [orgId, actor, content]).then((r) => r[0]!.id);
const memories = (uid: string) => asUser<{ id: string; content: string }>(uid, "select id, content from public.chat_memories order by created_at, id");

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Bakery");
  otherOrg = await createOrg(db, USERS.bob, "Bob Studio");
  await su("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member')", [org, USERS.bob]);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("sources on a shared chat (v101)", () => {
  it("a link shows an answer's search facts, and nothing else from its meta", async () => {
    const conv = await start();
    const question = await ask(conv, null);
    const answer = await begin(conv, question);
    const search = { at: "2026-11-20T09:00:00.000Z", status: "done", queries: ["q"], sources: [{ n: 1, url: "https://example.org/", title: "T", site: "example.org", published: null, read: true, cited: true }] };
    await write(answer, { search, route: { why: "an everyday question", tier: "fast", provider: "openai" } });
    const token = "a".repeat(64);
    await q("select public.app_chat_share($1, $2, $3, $4, 'anyone', null)", [org, USERS.alice, conv, token]);
    const shared = (await q<{ doc: { state: string; messages: Record<string, unknown>[] } }>("select public.app_chat_for_share($1, null) as doc", [token]))[0]!.doc;
    expect(shared.state).toBe("live");
    expect(shared.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(shared.messages[1]!.search).toEqual(search);
    expect(shared.messages[0]!.search ?? null).toBeNull();
    // The routing facts stay behind.
    expect(JSON.stringify(shared)).not.toContain("an everyday question");
    expect(shared.messages[1]).not.toHaveProperty("meta");
  });
});

describe("summaries of a long conversation (v101)", () => {
  it("are written for the person's own message, read only by them, replaced when written again, and go with the message", async () => {
    const conv = await start();
    const question = await ask(conv, null);
    const answer = await begin(conv, question);
    await write(answer, {});
    await q("select public.app_chat_save_summary($1, $2, $3, $4, 2, 'gpt-6-luna')", [org, USERS.alice, answer, "They are planning a bakery launch."]);
    await q("select public.app_chat_save_summary($1, $2, $3, $4, 2, 'gpt-6-luna')", [org, USERS.alice, answer, "They are planning a bakery launch for Saturday."]);
    const read = (uid: string) => asUser<{ summary: string; covers: number }>(uid, "select summary, covers from public.chat_summaries where message_id = $1", [answer]);
    expect(await read(USERS.alice)).toEqual([{ summary: "They are planning a bakery launch for Saturday.", covers: 2 }]);
    // Another member of the same workspace sees nothing, and can't write one on someone else's message.
    expect(await read(USERS.bob)).toEqual([]);
    await expect(q("select public.app_chat_save_summary($1, $2, $3, 'x', 1, null)", [org, USERS.bob, answer])).rejects.toThrow(/NOT_FOUND/);
    await expect(q("select public.app_chat_save_summary($1, $2, $3, '', 1, null)", [org, USERS.alice, answer])).rejects.toThrow(/INVALID_SUMMARY/);
    await expect(q("select public.app_chat_save_summary($1, $2, $3, $4, 1, null)", [org, USERS.alice, answer, "x".repeat(6001)])).rejects.toThrow(/INVALID_SUMMARY/);
    await q("select public.app_chat_delete($1, $2, $3)", [org, USERS.alice, conv]);
    expect(await su("select 1 from public.chat_summaries where message_id = $1", [answer])).toEqual([]);
  });

  it("nobody writes to the table directly", async () => {
    await expect(asUser(USERS.alice, "insert into public.chat_summaries (message_id, conversation_id, org_id, owner_id, summary, covers) values (gen_random_uuid(), gen_random_uuid(), $1, $2, 'x', 1)", [org, USERS.alice])).rejects.toThrow();
    await expect(asUser(USERS.alice, "select public.app_chat_save_summary($1, $2, gen_random_uuid(), 'x', 1, null)", [org, USERS.alice])).rejects.toThrow();
  });
});

describe("what a person asked to be remembered (v101)", () => {
  it("keeps each thing once, tidied, for that person in that workspace only", async () => {
    const first = await remember("  I am vegetarian   and live in Kandy. ");
    expect(await remember("i am vegetarian and live in kandy.")).toBe(first);
    await remember("Answer me in Sinhala.");
    expect((await memories(USERS.alice)).map((m) => m.content)).toEqual(["I am vegetarian and live in Kandy.", "Answer me in Sinhala."]);
    // Bob is in the same workspace and sees none of it; his own are his.
    expect(await memories(USERS.bob)).toEqual([]);
    await remember("I run the studio's accounts.", USERS.bob);
    expect((await memories(USERS.bob)).map((m) => m.content)).toEqual(["I run the studio's accounts."]);
    expect(await memories(USERS.alice)).toHaveLength(2);
  });

  it("refuses an empty or over-long one, a stranger, and a fifty-first", async () => {
    await expect(remember("   ")).rejects.toThrow(/INVALID_MEMORY/);
    await expect(remember("x".repeat(301))).rejects.toThrow(/INVALID_MEMORY/);
    // Alice isn't in Bob's workspace.
    await expect(remember("Hello", USERS.alice, otherOrg)).rejects.toThrow();
    const before = (await memories(USERS.alice)).length;
    for (let i = before; i < 50; i++) await remember(`Fact number ${i}`);
    await expect(remember("One too many")).rejects.toThrow(/MEMORY_FULL/);
    expect(await memories(USERS.alice)).toHaveLength(50);
  });

  it("forgets one, never someone else's, and then everything", async () => {
    const mine = await memories(USERS.alice);
    const bobs = await memories(USERS.bob);
    const gone = (id: string | null, actor: string) => q<{ n: number }>("select public.app_chat_forget($1, $2, $3) as n", [org, actor, id]).then((r) => r[0]!.n);
    expect(await gone(bobs[0]!.id, USERS.alice)).toBe(0);
    expect(await memories(USERS.bob)).toHaveLength(1);
    expect(await gone(mine[0]!.id, USERS.alice)).toBe(1);
    expect(await memories(USERS.alice)).toHaveLength(49);
    expect(await gone(null, USERS.alice)).toBe(49);
    expect(await memories(USERS.alice)).toEqual([]);
    // Someone who isn't in the workspace can't call it at all.
    await expect(q("select public.app_chat_forget($1, $2, null)", [otherOrg, USERS.alice])).rejects.toThrow(/FORBIDDEN/);
  });

  it("nobody reads or writes the table around the functions", async () => {
    await expect(asUser(USERS.alice, "insert into public.chat_memories (org_id, owner_id, content) values ($1, $2, 'x')", [org, USERS.alice])).rejects.toThrow();
    await expect(asUser(USERS.alice, "select public.app_chat_remember($1, $2, 'x')", [org, USERS.alice])).rejects.toThrow();
    await expect(as(db, "anon", null, async () => (await db.query("select * from public.chat_memories")).rows)).rejects.toThrow();
  });

  it("goes into the account export, and leaves with the person when they leave the workspace", async () => {
    await remember("I prefer short answers.", USERS.bob);
    const exported = (await q<{ doc: { remembered: string; workspace: string }[] }>("select public.app_chat_memories_export($1) as doc", [USERS.bob]))[0]!.doc;
    expect(exported.map((m) => [m.remembered, m.workspace])).toEqual([
      ["I run the studio's accounts.", "Alice Bakery"],
      ["I prefer short answers.", "Alice Bakery"],
    ]);
    await su("delete from public.organization_members where org_id = $1 and user_id = $2", [org, USERS.bob]);
    expect(await su("select 1 from public.chat_memories where org_id = $1 and owner_id = $2", [org, USERS.bob])).toEqual([]);
  });
});
