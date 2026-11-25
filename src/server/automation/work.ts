import "server-only";
import type { HomeRun, HomeTask } from "@/core/automation/home";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { demoScheduled } from "./demo";
import { listHomeTasks, listRuns } from "./store";

/** How many of the person's latest runs a page that sums up scheduled work reads: enough for the last ones that ended and any under way. */
export const SCHEDULED_RUNS_READ = 30;

/**
 * The person's own scheduled tasks (agents' work among them) and their latest runs, read as them: what Home's card (stage 274) and
 * the All work page (stage 276) show. Tasks that can't be read are null, never "none": Home then shows no card (the Scheduled page
 * is where that is said) and All work says they are missing. Runs that can't be read are null too, and a page then says nothing
 * about a last run or one under way. The demo gives its labelled samples.
 */
export async function loadScheduledWork(mode: string, orgId: string, runs: number = SCHEDULED_RUNS_READ): Promise<{ tasks: HomeTask[] | null; runs: HomeRun[] | null }> {
  if (mode === "demo") return demoScheduled(new Date());
  if (mode !== "live") return { tasks: [], runs: [] };
  try {
    const client = await createSupabaseServerClient();
    if (!client) return { tasks: [], runs: [] };
    const tasks = await listHomeTasks(client, orgId);
    return { tasks, runs: tasks && tasks.length > 0 ? await listRuns(client, orgId, runs) : [] };
  } catch {
    return { tasks: null, runs: null };
  }
}
