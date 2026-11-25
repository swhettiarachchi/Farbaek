import "server-only";
import { log } from "@/server/observability/log";
import { serverNotifier } from "@/server/email/wiring";
import { platformPause, refreshPlatformState } from "@/server/platform/state";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { headlessEnv, runHeadlessTurn } from "./headless-chat";
import { runClaimed, type RunnerDeps } from "./runner";
import { createScheduledStore } from "./store";

/** Scheduled runs this server makes at once. Each is a Chat turn with a model and maybe the web: a few, so people's own chats stay quick. */
export const MAX_CONCURRENT_RUNS = 3;

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
  const claimed = await store.claim(room);
  if (!claimed) return { status: "failed" };
  const notifier = serverNotifier();
  const deps: RunnerDeps = {
    store,
    turn: (input, signal, taskId) => runHeadlessTurn(headlessEnv(admin, (conversationId) => store.linkConversation(taskId, conversationId)), input, signal),
    ...(notifier?.scheduledFinished ? { notify: (n) => notifier.scheduledFinished!(n) } : {}),
    now: () => new Date(),
    log: (event, fields) => log("warn", event, fields),
  };
  for (const run of claimed) {
    state.running++;
    detach(async () => {
      try {
        const outcome = await runClaimed(deps, run);
        log("info", "scheduled.run", { task: run.taskId, attempt: run.attempt, outcome });
      } catch (e) {
        log("error", "scheduled.run_failed", { task: run.taskId, reason: e instanceof Error ? e.name : "unknown" });
      } finally {
        state.running--;
      }
    });
  }
  return { status: "ran", claimed: claimed.length, running: state.running };
}
