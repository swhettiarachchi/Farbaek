import { listAgentTasks } from "@/server/agent/service";
import { fromAgentResult, withAgent } from "@/server/agent/http";

export const dynamic = "force-dynamic";

/** GET /api/v1/agent/tasks: tasks whose contract is approved and that are waiting for a change. */
export function GET(request: Request) {
  return withAgent(request, async ({ store, agent }) => fromAgentResult(await listAgentTasks(store, agent)));
}
