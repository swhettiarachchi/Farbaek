/**
 * The scheduled store's reads (stages 271 and 275), with the database's API standing in: what each answer from it means. A database
 * that doesn't have v108 yet reads and runs as it always did, and nothing wider than that one answer is taken to mean so: any other
 * fault must not make an agent's task run as a plain one. SYNTHETIC values.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { columnNotThereYet, createScheduledStore, functionNotThereYet, listHomeTasks, listRuns, listTasks } from "./store";

vi.mock("server-only", () => ({}));

interface Answer {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
}

/** A client that answers each call from the functions given, and records the columns each read asked for. */
function client(o: { rpc?: (name: string) => Answer; select?: (table: string, columns: string) => Answer }) {
  const reads: { table: string; columns: string }[] = [];
  const api = {
    rpc: async (name: string) => ({ data: null, error: null, ...(o.rpc?.(name) ?? {}) }),
    from: (table: string) => ({
      select: (columns: string) => {
        reads.push({ table, columns });
        const answer = { data: null, error: null, ...(o.select?.(table, columns) ?? {}) };
        const chain: Record<string, unknown> = {};
        for (const method of ["eq", "is", "order", "limit", "in", "not", "gt"]) chain[method] = () => chain;
        chain.then = (resolve: (a: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(answer).then(resolve, reject);
        return chain;
      },
    }),
  };
  return { api: api as unknown as SupabaseClient, reads };
}

const TASK = "22222222-2222-4222-8222-222222222222";
const AGENT = "77777777-7777-4777-8777-777777777777";
const ORG = "33333333-3333-4333-8333-333333333333";
const SCHEDULE = { repeat: { kind: "daily", time: "09:00" }, timeZone: "Asia/Colombo", end: { kind: "never" } };
const taskRow = (more: Record<string, unknown> = {}) => ({
  id: TASK,
  title: "Morning news",
  instruction: "Research the news.",
  schedule: SCHEDULE,
  options: { web: true, effort: "balanced", notify: true },
  state: "active",
  state_reason: null,
  conversation_id: null,
  next_run_at: "2026-11-26T03:30:00Z",
  last_run_at: null,
  last_status: null,
  runs_finished: 0,
  version: 1,
  created_at: "2026-11-20T00:00:00Z",
  ...more,
});
const runRow = (more: Record<string, unknown> = {}) => ({ id: "11111111-1111-4111-8111-111111111111", task_id: TASK, due_at: "2026-11-25T03:30:00Z", status: "done", manual: false, detail: null, conversation_id: null, finished_at: "2026-11-25T03:31:00Z", started_at: "2026-11-25T03:30:05Z", ...more });
const CONTEXT = { agent_id: AGENT, name: "Scout", goal: "Watch my competitors.", runs_limit: 30, use_memory: false, archived: false, runs_in_30_days: 4, told_limit: true, new_chat: true, notes: [{ at: "2026-11-24T03:30:00Z", note: "Listed them. Next: compare prices." }] };

describe("whose work a claimed task is", () => {
  const ask = (answer: Answer) => createScheduledStore(client({ rpc: () => answer }).api).agent(TASK);

  it("is the agent the database names, with its limit, its memory choice and its notes", async () => {
    expect(await ask({ data: CONTEXT })).toEqual({ agentId: AGENT, name: "Scout", goal: "Watch my competitors.", runsLimit: 30, useMemory: false, archived: false, runsIn30Days: 4, toldLimit: true, newChat: true, notes: CONTEXT.notes });
  });

  it("is nobody's when the database says the task is no agent's, or doesn't have agents yet", async () => {
    expect(await ask({ data: null })).toBeNull();
    // A database without v108: the API doesn't know the function.
    expect(await ask({ error: { code: "PGRST202", message: "Could not find the function public.app_personal_agent_run_context(p_task) in the schema cache" } })).toBeNull();
  });

  it("can't be told, and so mustn't be run as a plain task, on any other fault", async () => {
    for (const error of [
      // A fault inside the function itself: a column or a function it uses is missing. The task may well be an agent's.
      { code: "42703", message: "column r.message_id does not exist" },
      { code: "42883", message: "function private.something(uuid) does not exist" },
      { code: "42P01", message: "relation public.chat_conversations does not exist" },
      { code: "57014", message: "canceling statement due to statement timeout" },
      { code: "PGRST301", message: "JWT expired" },
      { message: "fetch failed" },
      {},
    ]) {
      expect(await ask({ error }), JSON.stringify(error)).toBe("error");
    }
    // An answer that isn't what the function returns.
    expect(await ask({ data: { ...CONTEXT, runs_limit: "thirty" } })).toBe("error");
    expect(await ask({ data: { agent_id: AGENT } })).toBe("error");
  });

  it("tells a function that isn't there from every other answer, and a column that isn't there likewise", () => {
    expect(functionNotThereYet({ code: "PGRST202" })).toBe(true);
    for (const code of ["42883", "42703", "PGRST204", "42P01", undefined]) expect(functionNotThereYet(code ? { code } : {}), String(code)).toBe(false);
    expect(columnNotThereYet({ code: "42703" })).toBe(true);
    expect(columnNotThereYet({ code: "PGRST204" })).toBe(true);
    for (const code of ["PGRST202", "42883", "42P01", "57014", undefined]) expect(columnNotThereYet(code ? { code } : {}), String(code)).toBe(false);
  });
});

describe("keeping a run's note", () => {
  const keep = (answer: Answer) => createScheduledStore(client({ rpc: () => answer }).api).runNote("11111111-1111-4111-8111-111111111111", "Did a thing.");

  it("is quiet when the database kept it, and says so when it didn't or couldn't be asked", async () => {
    await expect(keep({ data: true })).resolves.toBeUndefined();
    await expect(keep({ data: false })).rejects.toThrow("NOTE_NOT_KEPT");
    await expect(keep({ error: { code: "22021", message: "invalid byte sequence" } })).rejects.toThrow("NOTE_NOT_KEPT");
  });
});

describe("what a run was sent through its link", () => {
  const ask = (answer: Answer) => createScheduledStore(client({ rpc: () => answer }).api).runPayload("11111111-1111-4111-8111-111111111111");

  it("is the text, or nothing; nothing on a database without links yet; and not known on any other fault", async () => {
    expect(await ask({ data: "order 1042 was paid" })).toBe("order 1042 was paid");
    expect(await ask({ data: null })).toBeNull();
    expect(await ask({ data: "" })).toBeNull();
    expect(await ask({ error: { code: "PGRST202" } })).toBeNull();
    await expect(ask({ error: { code: "57014" } })).rejects.toThrow("PAYLOAD_UNREADABLE");
    await expect(ask({ error: { code: "42703" } })).rejects.toThrow("PAYLOAD_UNREADABLE");
    // A caller may send any text at all, the word "error" too: it is what was sent, never a fault.
    expect(await ask({ data: "error" })).toBe("error");
  });
});

describe("reading a person's tasks and runs", () => {
  it("reads the agent each task belongs to, and each run's note", async () => {
    const tasks = client({ select: () => ({ data: [taskRow({ personal_agent_id: AGENT }), taskRow({ id: "44444444-4444-4444-8444-444444444444", personal_agent_id: null })] }) });
    expect((await listTasks(tasks.api, ORG))!.map((t) => t.agentId)).toEqual([AGENT, null]);
    expect(tasks.reads).toHaveLength(1);
    const runs = client({ select: () => ({ data: [runRow({ note: "Did a thing." }), runRow({ id: "55555555-5555-4555-8555-555555555555", note: null })] }) });
    expect((await listRuns(runs.api, ORG))!.map((r) => [r.note, r.startedAt])).toEqual([
      ["Did a thing.", "2026-11-25T03:30:05Z"],
      [null, "2026-11-25T03:30:05Z"],
    ]);
  });

  it("reads them as it always did from a database without v108: no agents, no notes, nothing lost", async () => {
    const missing = (column: string) => (_table: string, columns: string) => (columns.includes(column) ? { error: { code: "42703", message: `column scheduled_tasks.${column} does not exist` } } : { data: columns.includes("task_id") ? [runRow()] : [taskRow()] });
    const tasks = client({ select: missing("personal_agent_id") });
    expect(await listTasks(tasks.api, ORG)).toEqual([expect.objectContaining({ id: TASK, title: "Morning news", agentId: null })]);
    expect(tasks.reads.map((r) => r.columns.includes("personal_agent_id"))).toEqual([true, false]);
    const runs = client({ select: missing("note") });
    expect(await listRuns(runs.api, ORG)).toEqual([expect.objectContaining({ taskId: TASK, note: null })]);
    const home = client({ select: missing("personal_agent_id") });
    expect(await listHomeTasks(home.api, ORG)).toEqual([expect.objectContaining({ id: TASK, agent: false })]);
  });

  it("reads which runs a link started, and reads the rest as before from a database without v109", async () => {
    const all = client({ select: () => ({ data: [runRow({ note: null, from_link: true, manual: true }), runRow({ id: "55555555-5555-4555-8555-555555555555", note: "Did a thing.", from_link: false })] }) });
    expect((await listRuns(all.api, ORG))!.map((r) => [r.fromLink, r.manual, r.note])).toEqual([
      [true, true, null],
      [false, false, "Did a thing."],
    ]);
    expect(all.reads).toHaveLength(1);
    // v108 without v109: the link's column is missing and nothing else is; an agent's notes are still read.
    const before = client({ select: (_t, columns) => (columns.includes("from_link") ? { error: { code: "42703", message: "column scheduled_task_runs.from_link does not exist" } } : { data: [runRow({ note: "Did a thing." })] }) });
    expect(await listRuns(before.api, ORG)).toEqual([expect.objectContaining({ taskId: TASK, note: "Did a thing.", fromLink: false })]);
    expect(before.reads.map((r) => [r.columns.includes("from_link"), r.columns.includes("note")])).toEqual([
      [true, true],
      [false, true],
    ]);
    // Before v108 as well: three reads, each asking for less.
    const oldest = client({ select: (_t, columns) => (columns.includes("note") ? { error: { code: "42703" } } : { data: [runRow()] }) });
    expect(await listRuns(oldest.api, ORG)).toEqual([expect.objectContaining({ note: null, fromLink: false })]);
    expect(oldest.reads).toHaveLength(3);
  });

  it("says they couldn't be read on any other fault, and doesn't ask a second time", async () => {
    for (const read of [listTasks, listRuns, listHomeTasks]) {
      const c = client({ select: () => ({ error: { code: "57014", message: "canceling statement due to statement timeout" } }) });
      expect(await read(c.api, ORG)).toBeNull();
      expect(c.reads).toHaveLength(1);
    }
    // The older read failing too is still "couldn't be read", never "none".
    const twice = client({ select: (_t, columns) => ({ error: columns.includes("personal_agent_id") ? { code: "42703" } : { code: "57014" } }) });
    expect(await listTasks(twice.api, ORG)).toBeNull();
    expect(twice.reads).toHaveLength(2);
  });

  it("tells Home which tasks are an agent's work, so their links go to the Agents tab", async () => {
    const c = client({ select: () => ({ data: [taskRow({ personal_agent_id: AGENT }), taskRow({ id: "44444444-4444-4444-8444-444444444444", personal_agent_id: null })] }) });
    expect((await listHomeTasks(c.api, ORG))!.map((t) => t.agent)).toEqual([true, false]);
    // Only what Home shows is asked for.
    expect(c.reads[0]!.columns).not.toContain("instruction");
  });
});
