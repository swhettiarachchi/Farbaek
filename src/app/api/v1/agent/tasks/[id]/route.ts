import { agentTask } from "@/server/agent/service";
import { fromAgentResult, withAgent } from "@/server/agent/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/v1/agent/tasks/{id}: the task, its approved contract and its project's file list. */
export function GET(request: Request, { params }: Params) {
  return withAgent(request, async ({ store, agent }) => fromAgentResult(await agentTask(store, agent, (await params).id)));
}
