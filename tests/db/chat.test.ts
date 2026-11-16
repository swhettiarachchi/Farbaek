/**
 * Farbaek Chat (v98, stage 199, ADR 0213): private conversations, branching messages, answers written while they stream, files,
 * share links and the account export.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USAGE_OPERATIONS } from "@/config/usage";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let otherOrg: string;
let project: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const su = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const asUser = async <T = Record<string, unknown>>(uid: string, sql: string, params: unknown[] = []) => as(db, "authenticated", uid, async () => (await db.query<T>(sql, params)).rows);

const start = (actor: string = USERS.alice, orgId = org, projectId: string | null = null) =>
  q<{ id: string }>("select public.app_chat_start($1, $2, $3, '') as id", [orgId, actor, projectId]).then((r) => r[0]!.id);
const ask = (conv: string, parent: string | null, text = "What is a good name for a bakery?", files: string[] = [], actor: string = USERS.alice) =>
  q<{ id: string }>("select public.app_chat_add_user_message($1, $2, $3, $4, $5, $6::uuid[]) as id", [org, actor, conv, parent, text, files]).then((r) => r[0]!.id);
const begin = (conv: string, parent: string, kind = "text", actor: string = USERS.alice) =>
  q<{ id: string }>("select public.app_chat_begin_reply($1, $2, $3, $4, $5, 'claude-sonnet-5-5') as id", [org, actor, conv, parent, kind]).then((r) => r[0]!.id);
const write = (msg: string, content: string, status = "complete", actor: string = USERS.alice) =>
  q("select public.app_chat_write_reply($1, $2, $3, $4, $5, null, null, 1200, null)", [org, actor, msg, content, status]);
const attach = (name = "notes.txt", actor: string = USERS.alice) =>
  q<{ id: string }>("select public.app_chat_save_attachment($1, $2, null, $3, 'text', 'text/plain', 5, $4, 'aGVsbG8=', null, null) as id", [org, actor, name, "a".repeat(64)]).then((r) => r[0]!.id);
const path = (uid: string, conv: string, leaf: string | null = null, limit = 60) =>
  asUser<{ id: string; role: string; content: string; siblings: string[]; files: { name: string }[] }>(uid, "select * from public.chat_path($1, $2, $3)", [conv, leaf, limit]);

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Bakery");
  otherOrg = await createOrg(db, USERS.bob, "Bob Studio");
  await su("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member')", [org, USERS.bob]);
  project = (await su<{ id: string }>("insert into public.projects (org_id, name, created_by) values ($1, 'Bakery site', $2) returning id", [org, USERS.alice]))[0]!.id;
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("Farbaek Chat (v98)", () => {
  it("meters chat as its own operation", async () => {
    expect(USAGE_OPERATIONS).toContain("chat");
    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 86_400_000).toISOString();
    const grant = JSON.stringify({ kind: "plan", units: 1_000, starts_at: from, expires_at: to, source_key: "plan:chat" });
    await expect(q("select public.app_reserve_usage($1, $2, 'k-chat', 'chat', null, 5, $3)", [org, USERS.alice, grant])).resolves.toHaveLength(1);
  });

  it("keeps a conversation private to the person who started it", async () => {
    const conv = await start();
    const question = await ask(conv, null);
    const answer = await begin(conv, question);
    await write(answer, "Try Rise and Crumb.");
    expect((await path(USERS.alice, conv)).map((m) => [m.role, m.content])).toEqual([
      ["user", "What is a good name for a bakery?"],
      ["assistant", "Try Rise and Crumb."],
    ]);
    // Bob is in the same workspace, but it isn't his conversation.
    expect(await path(USERS.bob, conv)).toEqual([]);
    expect(await asUser(USERS.bob, "select id from public.chat_conversations where id = $1", [conv])).toEqual([]);
    await expect(ask(conv, answer, "Mine now?", [], USERS.bob)).rejects.toThrow(/NOT_FOUND/);
    // The browser can't write.
    await expect(asUser(USERS.alice, "insert into public.chat_messages (conversation_id, org_id, owner_id, role, content) values ($1, $2, $3, 'user', 'x')", [conv, org, USERS.alice])).rejects.toThrow(
      /permission denied/,
    );
  });

  it("writes an answer while it streams and keeps it once ended", async () => {
    const conv = await start();
    const question = await ask(conv, null);
    const answer = await begin(conv, question);
    await write(answer, "Half an ans", "streaming");
    expect((await su<{ status: string; content: string }>("select status, content from public.chat_messages where id = $1", [answer]))[0]).toEqual({ status: "streaming", content: "Half an ans" });
    await write(answer, "Half an answer", "stopped");
    await expect(write(answer, "changed later")).rejects.toThrow(/ALREADY_ENDED/);
    // Continue: it streams again with what it had.
    const had = await q<{ c: string }>("select public.app_chat_reopen_reply($1, $2, $3) as c", [org, USERS.alice, answer]);
    expect(had[0]!.c).toBe("Half an answer");
    await write(answer, "Half an answer, now whole.");
    expect((await su<{ status: string }>("select status from public.chat_messages where id = $1", [answer]))[0]!.status).toBe("complete");
  });

  it("marks answers left streaming by a stopped server as stopped", async () => {
    const conv = await start();
    const question = await ask(conv, null);
    const stuck = await begin(conv, question);
    await write(stuck, "Partial", "streaming");
    await su("update public.chat_messages set updated_at = now() - interval '11 minutes' where id = $1", [stuck]);
    const q2 = await ask(conv, null, "Another question");
    await begin(conv, q2);
    expect((await su<{ status: string; content: string }>("select status, content from public.chat_messages where id = $1", [stuck]))[0]).toEqual({ status: "stopped", content: "Partial" });
  });

  it("keeps an edited question and a new answer as branches, and switches between them", async () => {
    const conv = await start();
    const q1 = await ask(conv, null, "First wording");
    const a1 = await begin(conv, q1);
    await write(a1, "Answer one");
    const a2 = await begin(conv, q1);
    await write(a2, "Answer two");
    let rows = await path(USERS.alice, conv);
    expect(rows.map((m) => m.content)).toEqual(["First wording", "Answer two"]);
    expect(rows[1]!.siblings).toEqual([a1, a2]);

    const q2 = await ask(conv, null, "Second wording");
    const a3 = await begin(conv, q2);
    await write(a3, "Answer three");
    rows = await path(USERS.alice, conv);
    expect(rows[0]!.siblings).toEqual([q1, q2]);

    // Back to the first question: its newest answer shows.
    const tip = await q<{ t: string }>("select public.app_chat_set_leaf($1, $2, $3, $4) as t", [org, USERS.alice, conv, q1]);
    expect(tip[0]!.t).toBe(a2);
    expect((await path(USERS.alice, conv)).map((m) => m.content)).toEqual(["First wording", "Answer two"]);
  });

  it("reads a long branch a page at a time", async () => {
    const conv = await start();
    let parent: string | null = null;
    for (let i = 0; i < 5; i++) {
      const question: string = await ask(conv, parent, `Question ${i}`);
      parent = await begin(conv, question);
      await write(parent, `Answer ${i}`);
    }
    const last = await path(USERS.alice, conv, null, 4);
    expect(last.map((m) => m.content)).toEqual(["Question 3", "Answer 3", "Question 4", "Answer 4"]);
    const earlier = await su<{ parent_id: string }>("select parent_id from public.chat_messages where id = $1", [last[0]!.id]);
    const before = await path(USERS.alice, conv, earlier[0]!.parent_id, 4);
    expect(before.map((m) => m.content)).toEqual(["Question 1", "Answer 1", "Question 2", "Answer 2"]);
  });

  it("attaches files once, copies them onto an edited question, and keeps them to their owner", async () => {
    const conv = await start();
    const file = await attach();
    const q1 = await ask(conv, null, "Summarise this", [file]);
    expect((await path(USERS.alice, conv))[0]!.files.map((f) => f.name)).toEqual(["notes.txt"]);
    // Editing the question keeps its file, as a copy.
    const q2 = await ask(conv, null, "Summarise this briefly", [file]);
    expect((await su<{ c: number }>("select count(*)::int as c from public.chat_attachments where message_id = $1", [q2]))[0]!.c).toBe(1);
    expect((await su<{ c: number }>("select count(*)::int as c from public.chat_attachments where message_id = $1", [q1]))[0]!.c).toBe(1);
    // Someone else's file can't be attached.
    const bobs = await attach("bob.txt", USERS.bob);
    await expect(ask(conv, null, "Hers?", [bobs])).rejects.toThrow(/FILE_NOT_FOUND/);
    expect(await asUser(USERS.bob, "select id from public.chat_attachments where id = $1", [file])).toEqual([]);
  });

  it("renames, pins, archives and moves a conversation, and keeps a given name from the AI's title", async () => {
    const conv = await start();
    await q("select public.app_chat_auto_title($1, $2, $3, 'Bakery names')", [org, USERS.alice, conv]);
    await q("select public.app_chat_update($1, $2, $3, 'My bakery', true, null, true, $4)", [org, USERS.alice, conv, project]);
    await q("select public.app_chat_auto_title($1, $2, $3, 'Something else')", [org, USERS.alice, conv]);
    const [c] = await su<{ title: string; pinned: boolean; project_id: string; archived: boolean }>(
      "select title, pinned_at is not null as pinned, project_id, archived_at is not null as archived from public.chat_conversations where id = $1",
      [conv],
    );
    expect(c).toEqual({ title: "My bakery", pinned: true, project_id: project, archived: false });
    await expect(q("select public.app_chat_update($1, $2, $3, null, null, null, true, $4)", [org, USERS.alice, conv, otherOrg])).rejects.toThrow(/NOT_FOUND/);
    await expect(q("select public.app_chat_update($1, $2, $3, '', null, null, null, null)", [org, USERS.alice, conv])).rejects.toThrow(/INVALID_NAME/);
  });

  it("shares a snapshot of the branch, to the workspace or anyone, and closes the link", async () => {
    const conv = await start();
    const q1 = await ask(conv, null, "Shared question");
    const a1 = await begin(conv, q1, "image");
    const image = await q<{ id: string }>("select public.app_chat_save_attachment($1, $2, $3, 'bread.png', 'image', 'image/png', 4, $4, 'iVBO', 1024, 1024) as id", [org, USERS.alice, a1, "b".repeat(64)]);
    await write(a1, "");
    const token = "c".repeat(64);
    await q("select public.app_chat_share($1, $2, $3, $4, 'workspace', null)", [org, USERS.alice, conv, token]);
    // Later messages aren't in the link.
    const q2 = await ask(conv, a1, "Not shared");
    expect(q2).toBeTruthy();

    const open = (viewer: string | null) => q<{ r: { state: string; messages?: { content: string; files: { name: string }[] }[] } }>("select public.app_chat_for_share($1, $2) as r", [token, viewer]).then((r) => r[0]!.r);
    expect((await open(null)).state).toBe("sign_in");
    expect((await open(USERS.unverified)).state).toBe("members_only");
    const live = await open(USERS.bob);
    expect(live.state).toBe("live");
    expect(live.messages!.map((m) => m.content)).toEqual(["Shared question", ""]);
    expect(live.messages![1]!.files.map((f) => f.name)).toEqual(["bread.png"]);
    const file = (viewer: string | null, id: string) => q<{ r: { name: string } | null }>("select public.app_chat_share_file($1, $2, $3) as r", [token, viewer, id]).then((r) => r[0]!.r);
    expect((await file(USERS.bob, image[0]!.id))!.name).toBe("bread.png");
    expect(await file(null, image[0]!.id)).toBeNull();

    // A new link for anyone replaces the last one.
    const anyone = "d".repeat(64);
    await q("select public.app_chat_share($1, $2, $3, $4, 'anyone', now() + interval '7 days')", [org, USERS.alice, conv, anyone]);
    expect((await open(USERS.bob)).state).toBe("revoked");
    const opened = await q<{ r: { state: string } }>("select public.app_chat_for_share($1, null) as r", [anyone]);
    expect(opened[0]!.r.state).toBe("live");
    await q("select public.app_chat_unshare($1, $2, $3)", [org, USERS.alice, conv]);
    expect((await q<{ r: { state: string } }>("select public.app_chat_for_share($1, null) as r", [anyone]))[0]!.r.state).toBe("revoked");
    expect((await q<{ r: { state: string } }>("select public.app_chat_for_share($1, null) as r", ["e".repeat(64)]))[0]!.r.state).toBe("none");
  });

  it("refuses to share an answer still being written", async () => {
    const conv = await start();
    const q1 = await ask(conv, null);
    await begin(conv, q1);
    await expect(q("select public.app_chat_share($1, $2, $3, $4, 'anyone', null)", [org, USERS.alice, conv, "f".repeat(64)])).rejects.toThrow(/STILL_ANSWERING/);
  });

  it("deletes a conversation with its messages and records it without its words", async () => {
    const conv = await start();
    const q1 = await ask(conv, null, "Private words");
    await write(await begin(conv, q1), "Private answer");
    await q("select public.app_chat_delete($1, $2, $3)", [org, USERS.alice, conv]);
    expect(await su("select id from public.chat_messages where conversation_id = $1", [conv])).toEqual([]);
    const [e] = await su<{ metadata: Record<string, unknown> }>("select metadata from public.audit_events where action = 'chat.deleted' and target = $1", [conv]);
    expect(e!.metadata).toEqual({ messages: 2 });
  });

  it("includes conversations in the account export", async () => {
    const conv = await start();
    const q1 = await ask(conv, null, "Exported question");
    await write(await begin(conv, q1), "Exported answer");
    const [r] = await q<{ e: { chats: { messages: { text: string }[] }[] } }>("select public.app_account_export($1) as e", [USERS.alice]);
    const texts = r!.e.chats.flatMap((c) => c.messages.map((m) => m.text));
    expect(texts).toContain("Exported question");
    expect(texts).toContain("Exported answer");
  });

  it("writes a new question and its answer in one go, or nothing at all", async () => {
    const turn = (conv: string | null, files: string[] = []) =>
      q<{ r: { conversation: string; question: string; answer: string } }>("select public.app_chat_begin_turn($1, $2, $3, null, 'Bakery names', null, 'Names?', $4::uuid[], 'text', 'claude-haiku-5-5') as r", [org, USERS.alice, conv, files]).then((r) => r[0]!.r);
    const before = (await su<{ c: number }>("select count(*)::int as c from public.chat_conversations where owner_id = $1", [USERS.alice]))[0]!.c;
    const r = await turn(null);
    expect(await path(USERS.alice, r.conversation)).toHaveLength(2);
    // A file that isn't hers fails the whole turn: no empty conversation is left behind.
    const bobs = await attach("bob2.txt", USERS.bob);
    await expect(turn(null, [bobs])).rejects.toThrow(/FILE_NOT_FOUND/);
    expect((await su<{ c: number }>("select count(*)::int as c from public.chat_conversations where owner_id = $1", [USERS.alice]))[0]!.c).toBe(before + 1);
  });

  it("names a chat with the AI's words only when the person hasn't, and says which", async () => {
    const conv = await start();
    expect((await q<{ r: boolean }>("select public.app_chat_auto_title($1, $2, $3, 'From the AI') as r", [org, USERS.alice, conv]))[0]!.r).toBe(true);
    await q("select public.app_chat_update($1, $2, $3, 'Mine', null, null, null, null)", [org, USERS.alice, conv]);
    expect((await q<{ r: boolean }>("select public.app_chat_auto_title($1, $2, $3, 'From the AI again') as r", [org, USERS.alice, conv]))[0]!.r).toBe(false);
  });

  it("continues only the last answer of a branch", async () => {
    const conv = await start();
    const q1 = await ask(conv, null);
    const a1 = await begin(conv, q1);
    await write(a1, "Half", "stopped");
    await ask(conv, a1, "A follow-up");
    await expect(q("select public.app_chat_reopen_reply($1, $2, $3)", [org, USERS.alice, a1])).rejects.toThrow(/CANNOT_CONTINUE/);
  });

  it("lets an answer a stopped server left behind be continued and shared after two minutes", async () => {
    const conv = await start();
    const q1 = await ask(conv, null);
    const a1 = await begin(conv, q1);
    await write(a1, "Cut off", "streaming");
    await su("update public.chat_messages set updated_at = now() - interval '3 minutes' where id = $1", [a1]);
    await expect(q("select public.app_chat_share($1, $2, $3, $4, 'anyone', null)", [org, USERS.alice, conv, "9".repeat(64)])).resolves.toHaveLength(1);
    expect((await q<{ c: string }>("select public.app_chat_reopen_reply($1, $2, $3) as c", [org, USERS.alice, a1]))[0]!.c).toBe("Cut off");
  });

  it("keeps each person's chat files under 300 MB in a workspace", async () => {
    await su("insert into public.chat_attachments (org_id, owner_id, name, kind, mime, size_bytes, sha256, content) select $1, $2, 'big.pdf', 'pdf', 'application/pdf', 5242880, $3, 'x' from generate_series(1, 60)", [org, USERS.bob, "c".repeat(64)]);
    await expect(attach("one-more.txt", USERS.bob)).rejects.toThrow(/STORAGE_FULL/);
    await expect(attach("hers.txt", USERS.alice)).resolves.toBeTruthy();
  });

  it("takes someone's conversations with them when they leave the workspace", async () => {
    const conv = await start(USERS.bob);
    await ask(conv, null, "Bob's question", [], USERS.bob);
    await su("delete from public.organization_members where org_id = $1 and user_id = $2", [org, USERS.bob]);
    expect(await su("select id from public.chat_conversations where id = $1", [conv])).toEqual([]);
  });
});
