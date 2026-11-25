import "server-only";
import { SCHEDULED_LIMITS } from "@/core/automation/tasks";
import { log } from "@/server/observability/log";
import { serverNotifier } from "@/server/email/wiring";
import { platformPause, refreshPlatformState } from "@/server/platform/state";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { resolvePlan } from "@/server/workspace/ai-usage";
import { createSupabaseWriteDeps } from "@/server/workspace/supabase-writer";
import { headlessEnv, runHeadlessTurn } from "./headless-chat";
import { runClaimed, type RunnerDeps } from "./runner";
import { createScheduledStore } from "./store";

/** Scheduled runs this server makes at once. Each is a Chat turn with a model and maybe the web: a few, so people's own chats stay quick. */
export const MAX_CONCURRENT_RUNS = 3;
/** A run's place is given up after this long whatever it is doing: under the lease (15 minutes), so the count of runs never sticks. */
const RUN_CAP_MS = 13 * 60_000;

// How many runs this process holds now. Lost on a restart, as the runs are: their leases run out and they're claimed again.
const state = (globalThis as { __farbaekScheduled?: { running: number } }).__farbaekScheduled ?? { running: 0 };
(globalThis as { __farbaekScheduled?: { running: number } }).__farbaekScheduled = state;

export type TickStatus =
  | { status: "ran"; claimed: number; running: number }
  /** AI is paused for the whole platform: nothing is claimed, so no task fails or is paused for it. */
  | { status: "paused"; reason: string }
  | { status: "not_configured" }
  | { status: "failed" };

/**
 * One tick: claims the tasks that are due, up to the room this server has, and starts each on its own. `detach` keeps a started run
 * going after the tick has answered (Next's `after` in a route). Answers at once: a run's own outcome is recorded on its run.
 */
export async function startDueTasks(detach: (work: () => Promise<void>) => void): Promise<TickStatus> {
  const admin = createSupabaseAdminClient();
  if (!admin) return { status: "not_configured" };
  await refreshPlatformState().catch(() => undefined);
  const paused = platformPause("ai_runs");
  if (paused) return { status: "paused", reason: paused };
  const room = MAX_CONCURRENT_RUNS - state.running;
  if (room <= 0) return { status: "ran", claimed: 0, running: state.running };
  const store = createScheduledStore(admin);
  // The places are taken before the database is asked, so two ticks that overlap can't both fill the same room.
  state.running += room;
  const claimed = await store.claim(room).catch(() => null);
  state.running -= room - (claimed?.length ?? 0);
  if (!claimed) return { status: "failed" };
  const notifier = serverNotifier();
  const deps: RunnerDeps = {
    store,
    turn: (input, signal, taskId) => runHeadlessTurn(headlessEnv(admin, (conversationId) => store.linkConversation(taskId, conversationId)), input, signal),
    // The plan the owner has now: read when the task runs, so a trial that ended or a smaller plan is followed from then on.
    limit: async (orgId, ownerId) => {
      const plan = await resolvePlan(createSupabaseWriteDeps(admin, admin, ownerId), orgId);
      return plan.ok ? SCHEDULED_LIMITS[plan.value.plan.planId] : null;
    },
    ...(notifier?.scheduledFinished ? { notify: (n) => notifier.scheduledFinished!(n) } : {}),
    now: () => new Date(),
    log: (event, fields) => log("warn", event, fields),
  };
  for (const run of claimed) {
    detach(async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const capped = new Promise<"capped">((resolve) => {
          timer = setTimeout(() => resolve("capped"), RUN_CAP_MS);
        });
        const outcome = await Promise.race([runClaimed(deps, run), capped]);
        // A run that outlived its cap keeps going on its own; its lease runs out and the due time is claimed again.
        log(outcome === "capped" ? "error" : "info", "scheduled.run", { task: run.taskId, attempt: run.attempt, outcome });
      } catch (e) {
        log("error", "scheduled.run_failed", { task: run.taskId, reason: e instanceof Error ? e.name : "unknown" });
      } finally {
        clearTimeout(timer);
        state.running--;
      }
    });
  }
  return { status: "ran", claimed: claimed.length, running: state.running };
}
