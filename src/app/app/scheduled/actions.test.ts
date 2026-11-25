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

import { removeScheduledTaskAction, runScheduledTaskNowAction, saveScheduledTaskAction, setScheduledTaskStateAction } from "./actions";

const TASK = "22222222-2222-4222-8222-222222222222";
const daily = { repeat: { kind: "daily", time: "08:00" }, timeZone: "Asia/Colombo", end: { kind: "never" } };
const options = { web: true, effort: "balanced", notify: true };
const fresh = (more: Record<string, unknown> = {}) => ({ taskId: null, baseVersion: null, title: "", instruction: "Give me the morning news with sources.", schedule: daily, options, ...more });
const saved = () => calls.filter((c) => c.kind === "save");

beforeEach(() => {
  Object.assign(world, { mode: "live", role: "owner", writes: true, plan: "plus", rate: true, task: null, save: null, state: null, now: null });
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
