import { agentHandoff, createSupabaseHandoffStore } from "@/server/agent/handoffs";
import { fromAgentResult, withAgent } from "@/server/agent/http";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/v1/agent/handoffs/{id}: one handoff with the change waiting for review, to build the local copy from. */
export function GET(request: Request, { params }: Params) {
  return withAgent(request, async ({ agent }) => fromAgentResult(await agentHandoff(createSupabaseHandoffStore(createSupabaseAdminClient()!), agent, (await params).id)));
}
