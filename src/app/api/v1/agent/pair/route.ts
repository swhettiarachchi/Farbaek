import { pairAgent } from "@/server/agent/service";
import { clientKey, fromAgentResult, readJson, withAgentStore } from "@/server/agent/http";

export const dynamic = "force-dynamic";

/** POST /api/v1/agent/pair: redeem a pairing code from the Agents page. The agent token in the reply is shown once. */
export function POST(request: Request) {
  return withAgentStore(request, async (store) => {
    const body = await readJson(request, 4 * 1024);
    if (!body.ok) return body.response;
    return fromAgentResult(await pairAgent(store, body.value, clientKey(request)), 201);
  });
}
