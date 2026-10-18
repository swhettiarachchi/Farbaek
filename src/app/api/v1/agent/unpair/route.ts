import { unpairAgent } from "@/server/agent/service";
import { fromAgentResult, withAgent } from "@/server/agent/http";

export const dynamic = "force-dynamic";

/** POST /api/v1/agent/unpair: the app revokes its own token. */
export function POST(request: Request) {
  return withAgent(request, async ({ store, agent }) => fromAgentResult(await unpairAgent(store, agent)));
}
