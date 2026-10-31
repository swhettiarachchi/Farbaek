import { agentOpenHandoff, createSupabaseHandoffStore } from "@/server/agent/handoffs";
import { fromAgentResult, withAgent } from "@/server/agent/http";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** POST /api/v1/agent/handoffs/{id}/open: the person on this computer started it. */
export function POST(request: Request, { params }: Params) {
  return withAgent(
    request,
    async ({ agent }) => fromAgentResult(await agentOpenHandoff(createSupabaseHandoffStore(createSupabaseAdminClient()!), agent, (await params).id)),
    { bucket: "agent", perMinute: 120 },
    "propose",
  );
}
