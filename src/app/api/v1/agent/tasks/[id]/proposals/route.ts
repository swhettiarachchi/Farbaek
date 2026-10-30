import { WORKSPACE_LIMITS } from "@/config/workspace";
import { submitAgentProposal } from "@/server/agent/service";
import { fromAgentResult, readJson, withAgent } from "@/server/agent/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** POST /api/v1/agent/tasks/{id}/proposals: submit the agent's change. Farbaek checks it again and creates an ordinary proposal for review. */
export function POST(request: Request, { params }: Params) {
  return withAgent(request, async ({ store, agent }) => {
    const body = await readJson(request, WORKSPACE_LIMITS.maxImportBytes + 64 * 1024);
    if (!body.ok) return body.response;
    return fromAgentResult(await submitAgentProposal(store, agent, (await params).id, body.value), 201);
  }, { bucket: "agent", perMinute: 120 }, "propose");
}
