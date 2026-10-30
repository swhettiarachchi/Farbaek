import { agentFinishHandoff, createSupabaseHandoffStore } from "@/server/agent/handoffs";
import { fromAgentResult, readJson, withAgent } from "@/server/agent/http";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** POST /api/v1/agent/handoffs/{id}/result: what the checks did on this computer, once. Farbaek works out the report's digest. */
export function POST(request: Request, { params }: Params) {
  return withAgent(
    request,
    async ({ agent }) => {
      const body = await readJson(request, 256 * 1024);
      if (!body.ok) return body.response;
      return fromAgentResult(await agentFinishHandoff(createSupabaseHandoffStore(createSupabaseAdminClient()!), agent, (await params).id, body.value));
    },
    { bucket: "agent", perMinute: 120 },
    "propose",
  );
}
