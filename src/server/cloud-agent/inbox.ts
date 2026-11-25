import "server-only";
import { RUN_STALE_AFTER_MS, isLive } from "@/core/agent/cloud-run";
import type { ProposalState } from "@/core/agent/inbox";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { isRunLiveHere } from "./executor";
import { createSupabaseRunStore, listRuns, proposalStates, type RunView } from "./store";

/**
 * The agent's recent runs and the state of their changes, read as the person: what Home's inbox and the All work page both show.
 * Null when they can't be read.
 *
 * A run that's live in the database but not on this server stopped reporting when its server went away, so it isn't really waiting
 * for anyone. The run's own page clears these too; a page that lists runs mustn't keep asking until someone opens one.
 */
export async function loadInbox(orgId: string, limit = 16): Promise<{ runs: RunView[]; proposals: Map<string, ProposalState> } | null> {
  const client = await createSupabaseServerClient();
  if (!client) return null;
  try {
    let runs = await listRuns(client, orgId, { limit });
    if (runs.some((r) => isLive(r.status) && !isRunLiveHere(r.id))) {
      const admin = createSupabaseAdminClient();
      if (admin && (await createSupabaseRunStore(admin).interruptStale(new Date(Date.now() - RUN_STALE_AFTER_MS))) > 0) runs = await listRuns(client, orgId, { limit });
    }
    const ids = runs.filter((r) => r.status === "finished" && r.proposalId).map((r) => r.proposalId!);
    return { runs, proposals: await proposalStates(client, orgId, ids) };
  } catch {
    return null;
  }
}
