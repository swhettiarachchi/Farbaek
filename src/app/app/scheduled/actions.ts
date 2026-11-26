"use server";

/**
 * Scheduled tasks' actions (stage 271, ADR 0278): save, pause, resume, run now and remove; and agents' own (stage 275, ADR 0282):
 * save, remove and clear notes. Each checks the person and their plan's limits here, then goes through a service-only function that
 * checks the person again. When a task runs next is worked out here, on the server, from the schedule saved: the browser never says
 * when. An agent is paused, resumed and started by hand through its task, with the task's own actions. A task's or an agent's link
 * (stage 277, ADR 0284) is made and stopped here too.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AGENT_LIMITS, agentInputSchema } from "@/core/automation/agents";
import { sameInstruction } from "@/core/automation/offer";
import { linkWaitSeconds } from "@/core/automation/links";
import { describeSchedule, nextRun } from "@/core/automation/schedule";
import { DEFAULT_OPTIONS, SCHEDULED_LIMITS, scheduleProblem, taskInputSchema, titleFor, type ScheduledLimit } from "@/core/automation/tasks";
import { archiveAgent, clearAgentNotes, saveAgent } from "@/server/automation/agents";
import { createLink, revokeLink } from "@/server/automation/links";
import { archiveTask, listTasks, readTask, runTaskNow, saveTask, setTaskState, type Person, type StoreResult } from "@/server/automation/store";
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
  /** Agents the plan lets this person keep here. */
  agents: number;
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
  return { ok: true, w: { admin, user, orgId: ctx.current.id, userId: ctx.user.id, limit: SCHEDULED_LIMITS[plan.value.plan.planId], agents: AGENT_LIMITS[plan.value.plan.planId] } };
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
  return (await save(input, true)).state;
}

/**
 * The save itself. `refresh` re-reads the Scheduled page for whoever is on it; a save made from Chat leaves it be, so the chat the
 * person is in isn't re-read under them (the Scheduled page reads its tasks afresh whenever it is opened).
 */
async function save(input: z.input<typeof saveInput>, refresh: boolean): Promise<{ state: ScheduledState; sentence: string | null }> {
  const no = (message: string) => ({ state: { status: "error" as const, message }, sentence: null });
  const raw = saveInput.safeParse(input);
  if (!raw.success || (raw.data.taskId === null) !== (raw.data.baseVersion === null)) return no("That couldn't be read. Nothing was saved.");
  const instruction = plain(raw.data.instruction).trim();
  if (!instruction) return no("Say what Farbaek should do.");
  const parsed = taskInputSchema.safeParse({ title: plain(raw.data.title).trim() || titleFor(instruction), instruction, schedule: raw.data.schedule, options: raw.data.options });
  if (!parsed.success) {
    const where = parsed.error.issues[0]?.path[0];
    return no(where === "instruction" ? "The instruction is too long: keep it under 4,000 characters." : where === "title" ? "The name is too long: keep it under 80 characters." : "That schedule couldn't be read. Check its time and days, then save again.");
  }
  const g = await writer();
  if (!g.ok) return no(g.message);
  if (!(await withinRate(g.w, "save", 40))) return no("That's a lot of changes in an hour. Wait a little, then carry on.");
  const now = new Date();
  // An edit keeps the runs it has already made counted against "ends after N runs".
  const existing = raw.data.taskId ? await readTask(g.w.user, g.w.orgId, raw.data.taskId) : null;
  if (raw.data.taskId && !existing) return no("That task isn't here any more. Reload the page.");
  // An agent's work is changed with its agent, so its name, goal and limit can't drift apart from the task.
  if (existing?.agentId) return no("This is an agent's work. Change it on the Agents tab.");
  const problem = scheduleProblem(parsed.data.schedule, g.w.limit, now, existing?.runsFinished ?? 0);
  if (problem) return no(problem);
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
  if (!saved.ok) return { state: refused(saved, g.w.limit), sentence: null };
  if (refresh) revalidatePath("/app/scheduled");
  const sentence = describeSchedule(parsed.data.schedule);
  return { state: { status: "done", message: `Saved. ${sentence}` }, sentence };
}

// ---- From Chat (stage 273, ADR 0280) -------------------------------------------------------------------------------------------

export type ScheduleOfferState =
  /** Worth offering: nothing like it is scheduled. */
  | { status: "offer" }
  /** The person has this very instruction scheduled already: said, not offered again. */
  | { status: "scheduled"; sentence: string; paused: boolean }
  /** Not offered: it couldn't be checked, this person can't schedule here, or this chat is a scheduled task's own. */
  | { status: "off" };

/** The person's task with this very instruction that still runs or is paused, if any. Read as them: their own tasks only. */
async function scheduledAlready(instruction: string, conversationId: string | null): Promise<{ status: "none" } | { status: "unknown" } | { status: "task's own chat" } | { status: "same"; sentence: string; paused: boolean }> {
  const ctx = await loadAppContext();
  const user = ctx?.current && ctx.mode === "live" ? await createSupabaseServerClient() : null;
  if (!ctx?.current || !user) return { status: "unknown" };
  const tasks = await listTasks(user, ctx.current.id);
  if (!tasks) return { status: "unknown" };
  // A chat a scheduled task writes its answers into ends on that task's instruction, run after run: nothing is offered there,
  // whether the task still runs or has ended.
  if (conversationId && tasks.some((t) => t.conversationId === conversationId)) return { status: "task's own chat" };
  const same = tasks.find((t) => t.state !== "ended" && sameInstruction(t.instruction, plain(instruction)));
  return same ? { status: "same", sentence: same.schedule ? describeSchedule(same.schedule) : "", paused: same.state === "paused" } : { status: "none" };
}

/**
 * Whether to offer, under a Chat answer, to schedule what was asked. The same instruction already scheduled is said as scheduled,
 * so the offer isn't made twice; a scheduled task's own chat is never offered in.
 */
export async function scheduleOfferStateAction(instruction: string, conversationId: string | null): Promise<ScheduleOfferState> {
  if (typeof instruction !== "string" || instruction.length > 8_000) return { status: "off" };
  const conversation = typeof conversationId === "string" && uuid.safeParse(conversationId).success ? conversationId : null;
  const ctx = await loadAppContext();
  if (!ctx?.current) return { status: "off" };
  // The demo workspace shows the offer; pressing it says the workspace is read-only.
  if (ctx.mode === "demo") return { status: "offer" };
  if (!ctx.writes.enabled || !ctx.role || !CONTRIBUTOR_ROLES.includes(ctx.role)) return { status: "off" };
  const already = await scheduledAlready(instruction, conversation);
  if (already.status === "same") return { status: "scheduled", sentence: already.sentence, paused: already.paused };
  return already.status === "none" ? { status: "offer" } : { status: "off" };
}

const fromChatInput = z.object({ instruction: z.string().max(8_000), schedule: z.unknown() });

/**
 * Schedules what the person asked in Chat, from the offer under its answer: the same checks as the Scheduled page's own save (the
 * person, their plan, the schedule, when it runs next). The same instruction already scheduled is said, not saved a second time, so
 * a press repeated after a dropped answer, or from a second tab, makes one task.
 */
export async function scheduleFromChatAction(input: z.input<typeof fromChatInput>): Promise<ScheduledState> {
  const raw = fromChatInput.safeParse(input);
  if (!raw.success) return { status: "error", message: "That couldn't be read. Nothing was scheduled." };
  const already = await scheduledAlready(raw.data.instruction, null);
  if (already.status === "same") return { status: "done", message: `This is already scheduled. ${already.sentence}`.trim() };
  const saved = await save({ taskId: null, baseVersion: null, title: "", instruction: raw.data.instruction, schedule: raw.data.schedule, options: DEFAULT_OPTIONS }, false);
  if (saved.state.status !== "done") return saved.state;
  return { status: "done", message: `Scheduled. ${saved.sentence ?? ""} Its answers will be in Chat, under its own name.`.replace("  ", " ") };
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
  // An agent's work goes when its agent is removed: taken away alone, it would leave an agent with nothing to do. A task that
  // can't be read can't be shown to be no agent's, so it isn't removed either.
  const task = await readTask(g.w.user, g.w.orgId, taskId);
  if (!task) return { status: "error", message: "That task isn't here any more, or couldn't be read just now. Reload the page." };
  if (task.agentId) return { status: "error", message: "This is an agent's work. Remove the agent on the Agents tab." };
  const r = await archiveTask(g.w.admin, g.w, taskId);
  if (!r.ok) return refused(r, g.w.limit) as { status: "error"; message: string };
  revalidatePath("/app/scheduled");
  return { status: "done", message: "Removed. Its past answers are still in Chat." };
}

// ---- Agents (stage 275, ADR 0282) ----------------------------------------------------------------------------------------------

const refusedAgent = (r: Extract<StoreResult<unknown>, { ok: false }>, w: Writer): ScheduledState => ({
  status: "error",
  message:
    r.code === "AGENT_LIMIT"
      ? `Your plan keeps ${w.agents} ${w.agents === 1 ? "agent" : "agents"}. Remove one first, or choose a larger plan.`
      : r.code === "QUOTA_EXCEEDED"
        ? `Your plan keeps ${w.limit.active} scheduled ${w.limit.active === 1 ? "task" : "tasks"} active at once, and an agent's work is one of them. Pause or remove one first, or choose a larger plan.`
        : r.code === "VERSION_CONFLICT"
          ? "This agent was changed somewhere else while you were working. Reload to see it, then make your change again."
          : r.code === "NOT_FOUND"
            ? "That agent isn't here any more. Reload the page."
            : r.code === "FORBIDDEN"
              ? "Viewers can read the workspace but can't use its AI."
              : "That couldn't be saved just now. Nothing was changed. Try again.",
});

const agentSaveInput = z.object({
  agentId: uuid.nullable(),
  baseVersion: z.number().int().min(1).nullable(),
  name: z.string().max(200),
  goal: z.string().max(8000),
  runsLimit: z.number(),
  useMemory: z.boolean(),
  schedule: z.unknown(),
  options: z.unknown(),
});

/** Saves a new agent with the task that does its work, or a change to both from the version on screen. */
export async function saveAgentAction(input: z.input<typeof agentSaveInput>): Promise<ScheduledState> {
  const no = (message: string): ScheduledState => ({ status: "error", message });
  const raw = agentSaveInput.safeParse(input);
  if (!raw.success || (raw.data.agentId === null) !== (raw.data.baseVersion === null)) return no("That couldn't be read. Nothing was saved.");
  const name = plain(raw.data.name).replace(/\s+/g, " ").trim();
  const goal = plain(raw.data.goal).trim();
  if (!name) return no("Give it a name.");
  if (!goal) return no("Say what it should work toward.");
  const who = agentInputSchema.safeParse({ name, goal, runsLimit: raw.data.runsLimit, useMemory: raw.data.useMemory });
  if (!who.success) {
    const where = who.error.issues[0]?.path[0];
    return no(where === "name" ? "The name is too long: keep it under 40 characters." : where === "goal" ? "The goal is too long: keep it under 2,000 characters." : "Its limit is a whole number of runs from 1 to 750.");
  }
  const work = taskInputSchema.safeParse({ title: who.data.name, instruction: who.data.goal, schedule: raw.data.schedule, options: raw.data.options });
  if (!work.success) return no("That schedule couldn't be read. Check its time and days, then save again.");
  const g = await writer();
  if (!g.ok) return no(g.message);
  if (!(await withinRate(g.w, "agent", 40))) return no("That's a lot of changes in an hour. Wait a little, then carry on.");
  const now = new Date();
  // A change keeps the runs its task has already made counted against "ends after N runs".
  let runsFinished = 0;
  if (raw.data.agentId) {
    const tasks = await listTasks(g.w.user, g.w.orgId);
    const task = tasks?.find((t) => t.agentId === raw.data.agentId);
    if (!task) return no(tasks ? "That agent isn't here any more. Reload the page." : "That couldn't be saved just now. Nothing was changed. Try again.");
    runsFinished = task.runsFinished;
  }
  const problem = scheduleProblem(work.data.schedule, g.w.limit, now, runsFinished);
  if (problem) return no(problem);
  const saved = await saveAgent(g.w.admin, g.w, {
    agentId: raw.data.agentId,
    baseVersion: raw.data.baseVersion,
    name: who.data.name,
    goal: who.data.goal,
    runsLimit: who.data.runsLimit,
    useMemory: who.data.useMemory,
    schedule: work.data.schedule,
    options: work.data.options,
    nextRunAt: nextRun(work.data.schedule, now, runsFinished),
    maxActive: g.w.limit.active,
    maxAgents: g.w.agents,
  });
  if (!saved.ok) return refusedAgent(saved, g.w);
  revalidatePath("/app/scheduled", "layout");
  return { status: "done", message: `Saved. ${describeSchedule(work.data.schedule)}` };
}

type Pressed = { status: "idle" } | { status: "error"; message: string } | { status: "done"; message: string };

/** Removes an agent and stops its work (for ConfirmAction). Its past answers stay in Chat. */
export async function removeAgentAction(_previous: { status: string }, form: FormData): Promise<Pressed> {
  const agentId = String(form.get("agentId") ?? "");
  if (!uuid.safeParse(agentId).success) return { status: "error", message: "That agent doesn't exist." };
  const g = await writer();
  if (!g.ok) return { status: "error", message: g.message };
  const r = await archiveAgent(g.w.admin, g.w, agentId);
  if (!r.ok) return refusedAgent(r, g.w) as { status: "error"; message: string };
  revalidatePath("/app/scheduled", "layout");
  return { status: "done", message: "Removed. Its past answers are still in Chat." };
}

/** Clears what an agent remembers of its earlier runs (for ConfirmAction): its next run starts without notes. */
export async function clearAgentNotesAction(_previous: { status: string }, form: FormData): Promise<Pressed> {
  const agentId = String(form.get("agentId") ?? "");
  if (!uuid.safeParse(agentId).success) return { status: "error", message: "That agent doesn't exist." };
  const g = await writer();
  if (!g.ok) return { status: "error", message: g.message };
  if (!(await withinRate(g.w, "agent", 40))) return { status: "error", message: "That's a lot of changes in an hour. Wait a little, then carry on." };
  const r = await clearAgentNotes(g.w.admin, g.w, agentId);
  if (!r.ok) return refusedAgent(r, g.w) as { status: "error"; message: string };
  revalidatePath("/app/scheduled", "layout");
  return { status: "done", message: "Cleared. Its next run starts a new chat, without notes. Its past answers are still in Chat." };
}

// ---- A link that starts a task or an agent from another app (stage 277, ADR 0284) ------------------------------------------------

export type LinkMade = { status: "error"; message: string } | { status: "done"; linkId: string; secret: string; waitSeconds: number };

/**
 * Who may turn a link off: the signed-in person, for a task of their own (the database checks whose it is). Nothing else is asked.
 * Stopping a way in is never held back by what holds back using the AI: a workspace that is paused or read-only, a plan that
 * couldn't be read just now, or a role that has since become a viewer's. Those are the moments a person most needs it to work.
 */
async function stopper(): Promise<{ ok: true; admin: SupabaseClient; who: Person } | { ok: false; message: string }> {
  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in");
  if (ctx.mode === "demo") return { ok: false, message: "The demo workspace is read-only, so nothing here is saved." };
  if (!ctx.current) return { ok: false, message: "Create a workspace first." };
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, message: "Scheduled tasks aren't set up on this server." };
  return { ok: true, admin, who: { orgId: ctx.current.id, userId: ctx.user.id } };
}

/**
 * Makes the link of one of the person's own tasks (an agent's work is a task), stopping the one it had. The secret is in this
 * answer and nowhere else: only its hash is kept, so it can never be shown again.
 */
export async function createTaskLinkAction(taskId: string): Promise<LinkMade> {
  if (!uuid.safeParse(taskId).success) return { status: "error", message: "That task doesn't exist." };
  const g = await writer();
  if (!g.ok) return { status: "error", message: g.message };
  if (!(await withinRate(g.w, "link", 10))) return { status: "error", message: "That's a lot of links in an hour. Wait a little, then try again." };
  // How often the link may start a run is the plan's, read on the server now and kept on the link.
  const waitSeconds = linkWaitSeconds(g.w.limit);
  const made = await createLink(g.w.admin, g.w, taskId, waitSeconds);
  if (!made.ok) {
    return {
      status: "error",
      message: made.code === "NOT_FOUND" ? "That isn't here any more. Reload the page." : made.code === "FORBIDDEN" ? "Viewers can read the workspace but can't use its AI." : "The link couldn't be made just now. Nothing was changed. Try again.",
    };
  }
  revalidatePath("/app/scheduled", "layout");
  return { status: "done", linkId: made.value.id, secret: made.value.secret, waitSeconds };
}

/** Stops a task's link (for ConfirmAction): a call with its secret is refused from now on. */
export async function revokeTaskLinkAction(_previous: { status: string }, form: FormData): Promise<Pressed> {
  const taskId = String(form.get("taskId") ?? "");
  if (!uuid.safeParse(taskId).success) return { status: "error", message: "That task doesn't exist." };
  const g = await stopper();
  if (!g.ok) return { status: "error", message: g.message };
  const r = await revokeLink(g.admin, g.who, taskId);
  if (!r.ok) return { status: "error", message: r.code === "NOT_FOUND" ? "That isn't here any more. Reload the page." : "The link couldn't be turned off just now. Try again." };
  revalidatePath("/app/scheduled", "layout");
  return { status: "done", message: r.value ? "The link is off. A call with its secret is refused from now on." : "It had no link." };
}
