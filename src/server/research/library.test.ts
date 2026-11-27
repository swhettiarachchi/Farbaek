import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { listResearch } from "./library";

type Result = { data: unknown; error: unknown };
type Step = [string, ...unknown[]];

/** A stand-in for the person's client: it records each read's steps and answers each table's reads in the order given. */
function fake(results: Record<string, Result[]>) {
  const calls: { table: string; steps: Step[] }[] = [];
  const queues = new Map(Object.entries(results).map(([table, list]) => [table, [...list]]));
  const client = {
    from(table: string) {
      const call = { table, steps: [] as Step[] };
      calls.push(call);
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "not", "contains", "order", "limit", "is"]) {
        chain[method] = (...args: unknown[]) => {
          call.steps.push([method, ...args]);
          return chain;
        };
      }
      chain.then = (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(queues.get(table)?.shift() ?? { data: [], error: null }).then(resolve, reject);
      return chain;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const ORG = "00000000-0000-4000-8000-0000000000aa";
const TASK_CHAT = "00000000-0000-4000-8000-0000000000c9";
const done = { search: { at: "2026-11-26T08:00:00.000Z", status: "done", queries: ["q"], sources: [{ n: 1, url: "https://example.org/a", title: "A", site: "example.org", published: null, read: true }] } };
const row = (id: string, conversation: string, parent: string, at: string) => ({ id, conversation_id: conversation, parent_id: parent, created_at: at, meta: done });
const chat = (id: string, title: string, over: Record<string, unknown> = {}) => ({ id, title, project_id: null, archived_at: null, ...over });
const ok = (data: unknown): Result => ({ data, error: null });
const failed: Result = { data: null, error: { message: "down" } };
const steps = (call: { steps: Step[] }, name: string) => call.steps.filter((s) => s[0] === name).map((s) => s.slice(1));

describe("reading a person's research (stage 288, ADR 0296)", () => {
  it("reads finished and stopped answers that searched, in this workspace, and titles them by their questions", async () => {
    const { client, calls } = fake({
      scheduled_tasks: [ok([])],
      chat_messages: [ok([row("a1", "c1", "q1", "2026-11-26T08:00:05.000Z"), row("a0", "c1", "q0", "2026-11-25T08:00:05.000Z")]), ok([{ id: "q1", content: "What do solar panels cost?" }, { id: "q0", content: `${"long ".repeat(200)}` }])],
      chat_conversations: [ok([chat("c1", "Solar")])],
    });
    const lists = await listResearch(client, ORG);
    expect(lists?.asked.map((i) => [i.id, i.title])).toEqual([
      ["a1", "What do solar panels cost?"],
      ["a0", expect.stringMatching(/^long long/)],
    ]);
    expect(lists?.repeated).toEqual([]);

    const answers = calls.find((c) => c.table === "chat_messages")!;
    expect(steps(answers, "eq")).toEqual([
      ["org_id", ORG],
      ["role", "assistant"],
    ]);
    expect(steps(answers, "in")).toEqual([["status", ["complete", "stopped"]]]);
    expect(steps(answers, "contains")).toEqual([["meta", { search: { status: "done" } }]]);
    expect(steps(answers, "order")).toEqual([["created_at", { ascending: false }]]);
    // Only the listed rows' questions are asked for.
    const questions = calls.filter((c) => c.table === "chat_messages")[1]!;
    expect(steps(questions, "in")).toEqual([["id", ["q1", "q0"]]]);
  });

  it("reads a scheduled task's conversation apart, and lists it once", async () => {
    const runs = Array.from({ length: 5 }, (_, day) => row(`run${day}`, TASK_CHAT, `ask${day}`, `2026-11-2${day}T06:00:00.000Z`));
    const { client, calls } = fake({
      scheduled_tasks: [ok([{ conversation_id: TASK_CHAT }, { conversation_id: TASK_CHAT }, { conversation_id: "not-an-id); drop" }])],
      chat_messages: [ok([row("a1", "c1", "q1", "2026-11-26T08:00:05.000Z")]), ok(runs), ok([{ id: "q1", content: "Mine" }, { id: "ask4", content: "Research the morning news" }])],
      chat_conversations: [ok([chat("c1", "Solar"), chat(TASK_CHAT, "Morning news")])],
    });
    const lists = await listResearch(client, ORG);
    expect(lists?.asked.map((i) => i.id)).toEqual(["a1"]);
    expect(lists?.repeated.map((i) => [i.id, i.title])).toEqual([["run4", "Research the morning news"]]);

    const [own, theirs] = calls.filter((c) => c.table === "chat_messages");
    // Only a real id ever goes into the filter's text.
    expect(steps(own!, "not")).toEqual([["conversation_id", "in", `(${TASK_CHAT})`]]);
    expect(steps(theirs!, "in")).toContainEqual(["conversation_id", [TASK_CHAT]]);
    const tasks = calls.find((c) => c.table === "scheduled_tasks")!;
    expect(steps(tasks, "eq")).toEqual([["org_id", ORG]]);
  });

  it("says it couldn't read, never that there is none, when the answers or their chats can't be read", async () => {
    expect(await listResearch(fake({ scheduled_tasks: [ok([])], chat_messages: [failed] }).client, ORG)).toBeNull();
    expect(await listResearch(fake({ scheduled_tasks: [ok([])], chat_messages: [ok([row("a1", "c1", "q1", "2026-11-26T08:00:05.000Z")])], chat_conversations: [failed] }).client, ORG)).toBeNull();
  });

  it("still lists when the tasks or the questions can't be read: the grouping and the titles are all that is lost", async () => {
    const { client, calls } = fake({
      scheduled_tasks: [failed],
      chat_messages: [ok([row("a1", "c1", "q1", "2026-11-26T08:00:05.000Z")]), failed],
      chat_conversations: [ok([chat("c1", "Solar")])],
    });
    const lists = await listResearch(client, ORG);
    expect(lists?.asked.map((i) => [i.id, i.title])).toEqual([["a1", "Solar"]]);
    expect(steps(calls.find((c) => c.table === "chat_messages")!, "not")).toEqual([]);
  });

  it("answers with two empty lists when nothing was researched, and leaves out an archived chat", async () => {
    const none = fake({ scheduled_tasks: [ok([])], chat_messages: [ok([])] });
    expect(await listResearch(none.client, ORG)).toEqual({ asked: [], repeated: [] });
    expect(none.calls.some((c) => c.table === "chat_conversations")).toBe(false);

    const archived = fake({ scheduled_tasks: [ok([])], chat_messages: [ok([row("a1", "c1", "q1", "2026-11-26T08:00:05.000Z")])], chat_conversations: [ok([chat("c1", "Old", { archived_at: "2026-11-27T00:00:00.000Z" })])] });
    expect(await listResearch(archived.client, ORG)).toEqual({ asked: [], repeated: [] });
  });
});
