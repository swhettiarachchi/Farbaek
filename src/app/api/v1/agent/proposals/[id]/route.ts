import { agentProposal } from "@/server/agent/service";
import { fromAgentResult, withAgent } from "@/server/agent/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/v1/agent/proposals/{id}: where one of this agent's proposals stands (ADR 0042). */
export function GET(request: Request, { params }: Params) {
  return withAgent(request, async ({ store, agent }) => fromAgentResult(await agentProposal(store, agent, (await params).id)));
}
