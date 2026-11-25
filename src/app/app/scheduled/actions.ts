"use server";

/**
 * Scheduled tasks' actions (stage 271, ADR 0278): save, pause, resume, run now and remove. Each checks the person and their plan's
 * limits here, then goes through a service-only function that checks the person again. When a task runs next is worked out here, on
 * the server, from the schedule saved: the browser never says when.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { describeSchedule, nextRun } from "@/core/automation/schedule";
import { SCHEDULED_LIMITS, scheduleProblem, taskInputSchema, titleFor, type ScheduledLimit } from "@/core/automation/tasks";
import { archiveTask, readTask, runTaskNow, saveTask, setTaskState, type StoreResult } from "@/server/automation/store";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { resolvePlan } from "@/server/workspace/ai-usage";
import { loadAppContext } from "@/server/workspace/context";
import { createSupabaseWriteDeps } from "@/server/workspace/supabase-writer";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";

export type ScheduledState = { status: "idle" } | { status: "error"; message: string } | { status: "done"; message: string };

interface Writer {
  admin: SupabaseClient;
  user: SupabaseClient;
  orgId: string;
  userId: string;
  limit: ScheduledLimit;
}

async function writer(): Promise<{ ok: true; w: Writer } | { ok: false; message: string }> {
  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in");
  if (ctx.mode === "demo") return { ok: false, message: "The demo workspace is read-only, so nothing here is saved." };
  if (!ctx.current) return { ok: false, message: "Create a workspace first." };
  if (!ctx.writes.enabled) return { ok: false, message: ctx.writes.reason ?? "Changes are off for this workspace right now." };
  if (!ctx.role || !CONTRIBUTOR_ROLES.includes(ctx.role)) return { ok: false, message: "Viewers can read the workspace but can't use its AI." };
  const admin = createSupabaseAdminClient();
  const user = await createSupabaseServerClient();
  if (!admin || !user) return { ok: false, message: "Scheduled tasks aren't set up on this server." };
  // The plan, read on the server: when it can't be read, nothing is scheduled (never the largest plan's limits by default).
  const plan = await resolvePlan(createSupabaseWriteDeps(user, admin, ctx.user.id), ctx.current.id);
  if (!plan.ok) return { ok: false, message: "Your plan couldn't be confirmed just now, so nothing was changed. Try again in a moment." };
  return { ok: true, w: { admin, user, orgId: ctx.current.id, userId: ctx.user.id, limit: SCHEDULED_LIMITS[plan.value.plan.planId] } };
}

const uuid = z.uuid();
const refused = (r: Extract<StoreResult<unknown>, { ok: false }>, limit: ScheduledLimit): ScheduledState => ({
  status: "error",
  message:
    r.code === "QUOTA_EXCEEDED"
      ? `Your plan keeps ${limit.active} scheduled ${limit.active === 1 ? "task" : "tasks"} active at once. Pause or remove one first, or choose a larger plan.`
      : r.code === "VERSION_CONFLICT"
        ? "This task was changed somewhere else while you were working. Reload to see it, then make your change again."
        : r.code === "NOT_FOUND"
          ? "That task isn't here any more. Reload the page."
          : r.code === "BUSY"
            ? "It's running now. Wait for it to finish, then try again."
            : r.code === "SCHEDULE_ENDED"
            ? "Its schedule has no run left. Change its schedule, then resume it."
            : r.code === "FORBIDDEN"
              ? "Viewers can read the workspace but can't use its AI."
              : "That couldn't be saved just now. Nothing was changed. Try again.",
});

/** At most this many changes an hour for one person: far above a person's own use, and a ceiling on a stuck script. */
async function withinRate(w: Writer, key: string, max: number): Promise<boolean> {
  const r = await w.admin.rpc("app_rate_limit", { p_key: `scheduled-${key}:${w.userId}`, p_window_seconds: 3600, p_limit: max });
  return !r.error && r.data === true;
}

/** Text as a person typed it, without the control characters a paste can carry (a form feed from a PDF): each becomes a space. */
const plain = (s: string) =>
  Array.from(s, (c) => {
    const n = c.codePointAt(0) ?? 32;
    return (n < 32 && n !== 9 && n !== 10 && n !== 13) || n === 127 ? " " : c;
  }).join("");

const saveInput = z.object({
  taskId: uuid.nullable(),
  baseVersion: z.number().int().min(1).nullable(),
  title: z.string().max(200),
  instruction: z.string().max(8000),
  schedule: z.unknown(),
  options: z.unknown(),
});

/** Saves a new task, or a change to one from the version on screen. */
export async function saveScheduledTaskAction(input: z.input<typeof saveInput>): Promise<ScheduledState> {
  const raw = saveInput.safeParse(input);
  if (!raw.success || (raw.data.taskId === null) !== (raw.data.baseVersion === null)) return { status: "error", message: "That couldn't be read. Nothing was saved." };
  const instruction = plain(raw.data.instruction).trim();
  if (!instruction) return { status: "error", message: "Say what Farbaek should do." };
  const parsed = taskInputSchema.safeParse({ title: plain(raw.data.title).trim() || titleFor(instruction), instruction, schedule: raw.data.schedule, options: raw.data.options });
  if (!parsed.success) {
    const where = parsed.error.issues[0]?.path[0];
    return { status: "error", message: where === "instruction" ? "The instruction is too long: keep it under 4,000 characters." : where === "title" ? "The name is too long: keep it under 80 characters." : "That schedule couldn't be read. Check its time and days, then save again." };
  }
  const g = await writer();
  if (!g.ok) return { status: "error", message: g.message };
  if (!(await withinRate(g.w, "save", 40))) return { status: "error", message: "That's a lot of changes in an hour. Wait a little, then carry on." };
  const now = new Date();
  // An edit keeps the runs it has already made counted against "ends after N runs".
  const existing = raw.data.taskId ? await readTask(g.w.user, g.w.orgId, raw.data.taskId) : null;
  if (raw.data.taskId && !existing) return { status: "error", message: "That task isn't here any more. Reload the page." };
  const problem = scheduleProblem(parsed.data.schedule, g.w.limit, now, existing?.runsFinished ?? 0);
  if (problem) return { status: "error", message: problem };
  const saved = await saveTask(g.w.admin, g.w, {
    taskId: raw.data.taskId,
    baseVersion: raw.data.baseVersion,
    title: parsed.data.title,
    instruction: parsed.data.instruction,
    schedule: parsed.data.schedule,
    options: parsed.data.options,
    nextRunAt: nextRun(parsed.data.schedule, now, existing?.runsFinished ?? 0),
    maxActive: g.w.limit.active,
  });
  if (!saved.ok) return refused(saved, g.w.limit);
  revalidatePath("/app/scheduled");
  return { status: "done", message: `Saved. ${describeSchedule(parsed.data.schedule)}` };
}

/** Pause, or resume from its next time ahead. */
export async function setScheduledTaskStateAction(taskId: string, state: "active" | "paused"): Promise<ScheduledState> {
  if (!uuid.safeParse(taskId).success || (state !== "active" && state !== "paused")) return { status: "error", message: "That task doesn't exist." };
  const g = await writer();
  if (!g.ok) return { status: "error", message: g.message };
  if (!(await withinRate(g.w, "state", 60))) return { status: "error", message: "That's a lot of changes in an hour. Wait a little, then carry on." };
  const task = await readTask(g.w.user, g.w.orgId, taskId);
  if (!task) return { status: "error", message: "That task isn't here any more. Reload the page." };
  let next: Date | null = null;
  if (state === "active") {
    if (!task.schedule) return { status: "error", message: "Its schedule couldn't be read. Open it, set its schedule again and save, then resume it." };
    const problem = scheduleProblem(task.schedule, g.w.limit, new Date(), task.runsFinished);
    if (problem) return { status: "error", message: problem };
    next = nextRun(task.schedule, new Date(), task.runsFinished);
  }
  const r = await setTaskState(g.w.admin, g.w, taskId, state, next, g.w.limit.active);
  if (!r.ok) return refused(r, g.w.limit);
  revalidatePath("/app/scheduled");
  return { status: "done", message: state === "paused" ? "Paused. It won't run until you resume it." : "Resumed." };
}

/** Runs an active task once at the next tick, apart from its schedule; a try that was waiting to be made again is made now. */
export async function runScheduledTaskNowAction(taskId: string): Promise<ScheduledState> {
  if (!uuid.safeParse(taskId).success) return { status: "error", message: "That task doesn't exist." };
  const g = await writer();
  if (!g.ok) return { status: "error", message: g.message };
  if (!(await withinRate(g.w, "now", 12))) return { status: "error", message: "That's a lot of runs started by hand in an hour. Wait a little, then try again." };
  const r = await runTaskNow(g.w.admin, g.w, taskId);
  if (!r.ok) return r.code === "NOT_FOUND" ? { status: "error", message: "It can't be started just now: it's paused or its schedule has ended." } : refused(r, g.w.limit);
  revalidatePath("/app/scheduled");
  return { status: "done", message: "It will start within a few minutes. Its answer will be in Chat." };
}

/** Removes a task from the list (for ConfirmAction). Its past answers stay in Chat. */
export async function removeScheduledTaskAction(_previous: { status: string }, form: FormData): Promise<{ status: "idle" } | { status: "error"; message: string } | { status: "done"; message: string }> {
  const taskId = String(form.get("taskId") ?? "");
  if (!uuid.safeParse(taskId).success) return { status: "error", message: "That task doesn't exist." };
  const g = await writer();
  if (!g.ok) return { status: "error", message: g.message };
  const r = await archiveTask(g.w.admin, g.w, taskId);
  if (!r.ok) return refused(r, g.w.limit) as { status: "error"; message: string };
  revalidatePath("/app/scheduled");
  return { status: "done", message: "Removed. Its past answers are still in Chat." };
}
