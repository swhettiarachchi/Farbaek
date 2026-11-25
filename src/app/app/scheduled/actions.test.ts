/**
 * Scheduled tasks' actions (stage 271, ADR 0278), run as the server runs them, with the database standing in: the plan's limits and
 * the next run are the server's own, a refusal saves nothing, and what can't be confirmed fails closed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { world, calls } = vi.hoisted(() => ({
  world: {
    mode: "live" as "live" | "demo",
    role: "owner" as string | null,
    writes: true,
    plan: "plus" as string | null,
    rate: true,
    task: null as Record<string, unknown> | null,
    save: null as unknown,
    state: null as unknown,
    now: null as unknown,
    // The person's own tasks, as the page reads them; null when they can't be read.
    tasks: [] as Record<string, unknown>[] | null,
  },
  calls: [] as { kind: string; input: Record<string, unknown> }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock("@/server/workspace/context", () => ({
  loadAppContext: async () => ({ mode: world.mode, current: { id: "org-1" }, user: { id: "user-1" }, role: world.role, writes: { enabled: world.writes, reason: world.writes ? "" : "Changes are paused." } }),
}));
vi.mock("@/server/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: async (name: string, input: Record<string, unknown>) => {
      calls.push({ kind: name, input });
      return { data: world.rate, error: null };
    },
  }),
}));
vi.mock("@/server/supabase/server", () => ({ createSupabaseServerClient: async () => ({}) }));
vi.mock("@/server/workspace/supabase-writer", () => ({ createSupabaseWriteDeps: () => ({}) }));
vi.mock("@/server/workspace/ai-usage", () => ({
  resolvePlan: async () => (world.plan ? { ok: true, value: { plan: { planId: world.plan } } } : { ok: false, code: "INTERNAL", message: "no" }),
}));
vi.mock("@/server/automation/store", () => ({
  listTasks: async () => world.tasks,
  readTask: async () => world.task,
  saveTask: async (_admin: unknown, _w: unknown, input: Record<string, unknown>) => {
    calls.push({ kind: "save", input });
    return world.save ?? { ok: true, value: { id: "11111111-1111-4111-8111-111111111111", version: 1 } };
  },
  setTaskState: async (_admin: unknown, _w: unknown, taskId: string, state: string, next: Date | null, maxActive: number) => {
    calls.push({ kind: "state", input: { taskId, state, next, maxActive } });
    return world.state ?? { ok: true, value: null };
  },
  runTaskNow: async (_admin: unknown, _w: unknown, taskId: string) => {
    calls.push({ kind: "now", input: { taskId } });
    return world.now ?? { ok: true, value: null };
  },
  archiveTask: async (_admin: unknown, _w: unknown, taskId: string) => {
    calls.push({ kind: "archive", input: { taskId } });
    return { ok: true, value: null };
  },
}));

import { removeScheduledTaskAction, runScheduledTaskNowAction, saveScheduledTaskAction, scheduleFromChatAction, scheduleOfferStateAction, setScheduledTaskStateAction } from "./actions";

const TASK = "22222222-2222-4222-8222-222222222222";
const CHAT = "33333333-3333-4333-8333-333333333333";
const daily = { repeat: { kind: "daily", time: "08:00" }, timeZone: "Asia/Colombo", end: { kind: "never" } };
const options = { web: true, effort: "balanced", notify: true };
const fresh = (more: Record<string, unknown> = {}) => ({ taskId: null, baseVersion: null, title: "", instruction: "Give me the morning news with sources.", schedule: daily, options, ...more });
const saved = () => calls.filter((c) => c.kind === "save");

beforeEach(() => {
  Object.assign(world, { mode: "live", role: "owner", writes: true, plan: "plus", rate: true, task: null, save: null, state: null, now: null, tasks: [] });
  calls.length = 0;
});

describe("saving a scheduled task", () => {
  it("saves a new task with its name from the words, the server's own next time and the plan's limit", async () => {
    const before = Date.now();
    const r = await saveScheduledTaskAction({ ...fresh(), nextRunAt: "2001-01-01T00:00:00Z", maxActive: 999 } as never);
    expect(r.status).toBe("done");
    const input = saved()[0]!.input;
    expect(input.title).toBe("Give me the morning news with sources.");
    expect(input.maxActive).toBe(10);
    // 08:00 in Colombo is 02:30 UTC, ahead of now and within a day: worked out here, whatever the browser sent.
    const next = input.nextRunAt as Date;
    expect(next.getTime()).toBeGreaterThan(before);
    expect(next.getTime() - before).toBeLessThanOrEqual(24 * 3_600_000 + 1000);
    expect(next.toISOString().slice(11, 16)).toBe("02:30");
  });

  it("refuses an hourly schedule on a plan that runs a task once a day at most, and saves nothing", async () => {
    world.plan = "free";
    const r = await saveScheduledTaskAction(fresh({ schedule: { ...daily, repeat: { kind: "hourly", minute: 0 } } }) as never);
    expect(r).toMatchObject({ status: "error" });
    expect(r.status === "error" && r.message).toMatch(/once a day/);
    expect(saved()).toHaveLength(0);
  });

  it("refuses a time that has passed, a schedule that isn't one, and an empty instruction", async () => {
    expect(await saveScheduledTaskAction(fresh({ schedule: { ...daily, repeat: { kind: "once", date: "2020-01-01", time: "08:00" } } }) as never)).toMatchObject({ status: "error" });
    expect(await saveScheduledTaskAction(fresh({ schedule: { ...daily, timeZone: "Mars/Olympus" } }) as never)).toMatchObject({ status: "error" });
    expect(await saveScheduledTaskAction(fresh({ schedule: { ...daily, repeat: { kind: "daily", time: "25:00" } } }) as never)).toMatchObject({ status: "error" });
    expect(await saveScheduledTaskAction(fresh({ instruction: "   " }) as never)).toMatchObject({ status: "error" });
    expect(saved()).toHaveLength(0);
  });

  it("saves nothing when the plan can't be read, in the demo, for a viewer, or with changes off", async () => {
    world.plan = null;
    expect(await saveScheduledTaskAction(fresh() as never)).toMatchObject({ status: "error" });
    Object.assign(world, { plan: "plus", mode: "demo" });
    expect(await saveScheduledTaskAction(fresh() as never)).toMatchObject({ status: "error" });
    Object.assign(world, { mode: "live", role: "viewer" });
    expect(await saveScheduledTaskAction(fresh() as never)).toMatchObject({ status: "error" });
    Object.assign(world, { role: "owner", writes: false });
    expect(await saveScheduledTaskAction(fresh() as never)).toMatchObject({ status: "error" });
    expect(saved()).toHaveLength(0);
  });

  it("stops at the hourly ceiling on changes", async () => {
    world.rate = false;
    expect(await saveScheduledTaskAction(fresh() as never)).toMatchObject({ status: "error" });
    expect(saved()).toHaveLength(0);
  });

  it("counts the runs a task has made when a change keeps an end after a number of runs", async () => {
    world.task = { id: TASK, runsFinished: 3, schedule: daily, state: "active" };
    const three = { ...daily, end: { kind: "after", runs: 3 } };
    const r = await saveScheduledTaskAction(fresh({ taskId: TASK, baseVersion: 2, schedule: three }) as never);
    expect(r.status === "error" && r.message).toMatch(/no run left/);
    expect(saved()).toHaveLength(0);
    const ok = await saveScheduledTaskAction(fresh({ taskId: TASK, baseVersion: 2, schedule: { ...daily, end: { kind: "after", runs: 4 } } }) as never);
    expect(ok.status).toBe("done");
    expect(saved()[0]!.input).toMatchObject({ taskId: TASK, baseVersion: 2 });
  });

  it("refuses a change to a task that isn't the person's, and a task id without its version", async () => {
    expect(await saveScheduledTaskAction(fresh({ taskId: TASK, baseVersion: 1 }) as never)).toMatchObject({ status: "error" });
    expect(await saveScheduledTaskAction(fresh({ taskId: TASK, baseVersion: null }) as never)).toMatchObject({ status: "error" });
    expect(await saveScheduledTaskAction(fresh({ taskId: "not-an-id", baseVersion: 1 }) as never)).toMatchObject({ status: "error" });
    expect(saved()).toHaveLength(0);
  });

  it("gives a task that has run before a one-time run ahead", async () => {
    world.task = { id: TASK, runsFinished: 3, schedule: daily, state: "ended" };
    const ahead = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const r = await saveScheduledTaskAction(fresh({ taskId: TASK, baseVersion: 4, schedule: { ...daily, repeat: { kind: "once", date: ahead, time: "17:00" } } }) as never);
    expect(r.status).toBe("done");
    expect((saved()[0]!.input.nextRunAt as Date).toISOString().slice(0, 10)).toBe(ahead);
  });

  it("takes pasted text with a page break in it, as spaces", async () => {
    const r = await saveScheduledTaskAction(fresh({ instruction: `Summarise this page${String.fromCharCode(12)}and the next, every day`, title: `Two${String.fromCharCode(0)}pages` }) as never);
    expect(r.status).toBe("done");
    expect(saved()[0]!.input).toMatchObject({ instruction: "Summarise this page and the next, every day", title: "Two pages" });
  });

  it("says the plan's own limit when the database counts too many active tasks", async () => {
    world.save = { ok: false, code: "QUOTA_EXCEEDED", message: "QUOTA_EXCEEDED" };
    const r = await saveScheduledTaskAction(fresh() as never);
    expect(r.status === "error" && r.message).toMatch(/keeps 10 scheduled tasks active/);
  });
});

describe("pause, resume, run now and remove", () => {
  it("pauses with no next time, and resumes from the stored schedule's next time", async () => {
    world.task = { id: TASK, runsFinished: 0, schedule: daily, state: "active" };
    expect((await setScheduledTaskStateAction(TASK, "paused")).status).toBe("done");
    expect(calls.find((c) => c.kind === "state")!.input).toMatchObject({ state: "paused", next: null, maxActive: 10 });
    calls.length = 0;
    expect((await setScheduledTaskStateAction(TASK, "active")).status).toBe("done");
    const resumed = calls.find((c) => c.kind === "state")!.input;
    expect(resumed.state).toBe("active");
    expect((resumed.next as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it("won't resume a schedule that has ended, that can't be read, or that the plan no longer allows", async () => {
    world.task = { id: TASK, runsFinished: 0, schedule: { ...daily, end: { kind: "on", date: "2020-01-01" } }, state: "paused" };
    expect(await setScheduledTaskStateAction(TASK, "active")).toMatchObject({ status: "error" });
    world.task = { id: TASK, runsFinished: 0, schedule: null, state: "paused" };
    expect(await setScheduledTaskStateAction(TASK, "active")).toMatchObject({ status: "error" });
    Object.assign(world, { plan: "free", task: { id: TASK, runsFinished: 0, schedule: { ...daily, repeat: { kind: "hourly", minute: 5 } }, state: "paused" } });
    expect(await setScheduledTaskStateAction(TASK, "active")).toMatchObject({ status: "error" });
    expect(calls.filter((c) => c.kind === "state")).toHaveLength(0);
  });

  it("stops at the hourly ceiling on pausing and resuming, and says when a task is running", async () => {
    world.task = { id: TASK, runsFinished: 0, schedule: daily, state: "active" };
    world.rate = false;
    expect(await setScheduledTaskStateAction(TASK, "paused")).toMatchObject({ status: "error" });
    expect(calls.filter((c) => c.kind === "state")).toHaveLength(0);
    world.rate = true;
    world.now = { ok: false, code: "BUSY" };
    const busy = await runScheduledTaskNowAction(TASK);
    expect(busy.status === "error" && busy.message).toMatch(/running now/);
    world.now = { ok: false, code: "NOT_FOUND" };
    const off = await runScheduledTaskNowAction(TASK);
    expect(off.status === "error" && off.message).toMatch(/paused or its schedule has ended/);
  });

  it("refuses a state the page doesn't offer, and ids that aren't ids", async () => {
    expect(await setScheduledTaskStateAction(TASK, "ended" as never)).toMatchObject({ status: "error" });
    expect(await setScheduledTaskStateAction("1; drop", "paused")).toMatchObject({ status: "error" });
    expect(await runScheduledTaskNowAction("nope")).toMatchObject({ status: "error" });
    const form = new FormData();
    form.set("taskId", "nope");
    expect(await removeScheduledTaskAction({ status: "idle" }, form)).toMatchObject({ status: "error" });
    expect(calls.filter((c) => ["state", "now", "archive"].includes(c.kind))).toHaveLength(0);
  });

  it("starts a run by hand within its own ceiling, and removes a task", async () => {
    expect((await runScheduledTaskNowAction(TASK)).status).toBe("done");
    expect(calls.some((c) => c.kind === "now")).toBe(true);
    world.rate = false;
    calls.length = 0;
    expect(await runScheduledTaskNowAction(TASK)).toMatchObject({ status: "error" });
    expect(calls.some((c) => c.kind === "now")).toBe(false);
    const form = new FormData();
    form.set("taskId", TASK);
    expect((await removeScheduledTaskAction({ status: "idle" }, form)).status).toBe("done");
    expect(calls.find((c) => c.kind === "archive")!.input).toEqual({ taskId: TASK });
  });
});

describe("scheduling from Chat (stage 273)", () => {
  const ASKED = "Send me the AI news every morning at 8";

  it("offers when nothing like it is scheduled, and says so when the same instruction already is", async () => {
    expect(await scheduleOfferStateAction(ASKED, CHAT)).toEqual({ status: "offer" });
    world.tasks = [{ id: TASK, instruction: "send me the  AI news every morning at 8 ", schedule: daily, state: "active", conversationId: null }];
    expect(await scheduleOfferStateAction(ASKED, CHAT)).toEqual({ status: "scheduled", sentence: "Every day at 8:00 AM, Colombo time.", paused: false });
    world.tasks = [{ id: TASK, instruction: ASKED, schedule: daily, state: "paused", conversationId: null }];
    expect(await scheduleOfferStateAction(ASKED, null)).toMatchObject({ status: "scheduled", paused: true });
    // One that has ended is offered again: it no longer runs.
    world.tasks = [{ id: TASK, instruction: ASKED, schedule: daily, state: "ended", conversationId: null }];
    expect(await scheduleOfferStateAction(ASKED, CHAT)).toEqual({ status: "offer" });
  });

  it("never offers in a scheduled task's own chat, whether the task still runs or has ended", async () => {
    // A task's chat ends on its instruction, run after run. A reminder that has been delivered must not offer itself for another day.
    for (const state of ["active", "paused", "ended"]) {
      world.tasks = [{ id: TASK, instruction: "remind me tomorrow at 5pm to call the bank", schedule: daily, state, conversationId: CHAT }];
      expect(await scheduleOfferStateAction("remind me tomorrow at 5pm to call the bank", CHAT), state).toEqual({ status: "off" });
      // Whatever the chat's last question now says.
      expect(await scheduleOfferStateAction("send me the weather every morning", CHAT), state).toEqual({ status: "off" });
    }
    // Another chat is unaffected, and an id that isn't one is no chat.
    world.tasks = [{ id: TASK, instruction: "something else", schedule: daily, state: "active", conversationId: CHAT }];
    expect(await scheduleOfferStateAction(ASKED, "55555555-5555-4555-8555-555555555555")).toEqual({ status: "offer" });
    expect(await scheduleOfferStateAction(ASKED, "not-an-id")).toEqual({ status: "offer" });
  });

  it("offers nothing to someone who can't schedule here, or when their tasks can't be read", async () => {
    world.role = "viewer";
    expect(await scheduleOfferStateAction(ASKED, CHAT)).toEqual({ status: "off" });
    Object.assign(world, { role: "owner", writes: false });
    expect(await scheduleOfferStateAction(ASKED, CHAT)).toEqual({ status: "off" });
    Object.assign(world, { writes: true, tasks: null });
    expect(await scheduleOfferStateAction(ASKED, CHAT)).toEqual({ status: "off" });
    expect(await scheduleOfferStateAction("x".repeat(9_000), CHAT)).toEqual({ status: "off" });
    // The demo workspace shows the offer; pressing it says why nothing is saved.
    Object.assign(world, { tasks: [], mode: "demo" });
    expect(await scheduleOfferStateAction(ASKED, CHAT)).toEqual({ status: "offer" });
    expect(await scheduleFromChatAction({ instruction: ASKED, schedule: daily })).toMatchObject({ status: "error", message: expect.stringContaining("read-only") });
  });

  it("schedules what was asked with the usual choices and the server's own next time, and says where its answers will be", async () => {
    const r = await scheduleFromChatAction({ instruction: ASKED, schedule: daily });
    expect(r).toEqual({ status: "done", message: "Scheduled. Every day at 8:00 AM, Colombo time. Its answers will be in Chat, under its own name." });
    const input = saved()[0]!.input;
    expect(input).toMatchObject({ taskId: null, baseVersion: null, title: ASKED, instruction: ASKED, options: { web: true, effort: "balanced", notify: true }, maxActive: 10 });
    expect((input.nextRunAt as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it("makes one task when the press is repeated: the same instruction already scheduled is said, not saved again", async () => {
    world.tasks = [{ id: TASK, instruction: ASKED, schedule: daily, state: "active", conversationId: null }];
    const again = await scheduleFromChatAction({ instruction: ` ${ASKED}  `, schedule: daily });
    expect(again).toEqual({ status: "done", message: "This is already scheduled. Every day at 8:00 AM, Colombo time." });
    expect(saved()).toHaveLength(0);
  });

  it("refuses what the Scheduled page's own save refuses", async () => {
    world.plan = "free";
    const hourly = await scheduleFromChatAction({ instruction: "check the site every hour", schedule: { ...daily, repeat: { kind: "hourly", minute: 0 } } });
    expect(hourly.status === "error" && hourly.message).toMatch(/once a day/);
    world.plan = "plus";
    world.save = { ok: false, code: "QUOTA_EXCEEDED", message: "QUOTA_EXCEEDED" };
    const full = await scheduleFromChatAction({ instruction: ASKED, schedule: daily });
    expect(full.status === "error" && full.message).toMatch(/keeps 10 scheduled tasks active/);
    world.save = null;
    expect(await scheduleFromChatAction({ instruction: ASKED, schedule: { repeat: { kind: "sometimes" } } })).toMatchObject({ status: "error" });
    expect(await scheduleFromChatAction({ instruction: "   ", schedule: daily })).toMatchObject({ status: "error" });
    expect(await scheduleFromChatAction({ instruction: "x".repeat(9_000), schedule: daily })).toMatchObject({ status: "error" });
  });
});
